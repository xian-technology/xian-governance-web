import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  ChevronRight,
  ExternalLink,
  FileJson,
  GitPullRequest,
  RadioTower,
  ShieldCheck,
  Users,
  Vote,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  getNetworks,
  getOverview,
  getProposal,
  getProposals,
  getStatePatches,
  getValidators
} from "./api";
import { canVote, submitVote, useXianWallet } from "./wallet";
import { percent, shortAddress } from "../shared/format";
import {
  computeStatePatchBundleHash,
  parseStatePatchBundle
} from "../shared/statePatchHash";
import type {
  GovernanceLayer,
  ProposalDetail,
  ProposalSummary,
  ValidatorRecord
} from "../shared/types";

type View = "dashboard" | "proposals" | "validators" | "patches" | "create";

export function App() {
  const queryClient = useQueryClient();
  const wallet = useXianWallet();
  const [view, setView] = useState<View>("dashboard");
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<{
    layer: GovernanceLayer;
    proposalId: number;
  } | null>(null);

  const networks = useQuery({ queryKey: ["networks"], queryFn: getNetworks });
  const networkId = selectedNetwork ?? networks.data?.networks[0]?.id ?? "local";
  const overview = useQuery({
    queryKey: ["overview", networkId],
    queryFn: () => getOverview(networkId),
    enabled: Boolean(networkId)
  });
  const proposals = useQuery({
    queryKey: ["proposals", networkId],
    queryFn: () => getProposals(networkId),
    enabled: Boolean(networkId)
  });
  const validators = useQuery({
    queryKey: ["validators", networkId],
    queryFn: () => getValidators(networkId),
    enabled: Boolean(networkId)
  });
  const patches = useQuery({
    queryKey: ["patches", networkId],
    queryFn: () => getStatePatches(networkId),
    enabled: Boolean(networkId)
  });
  const proposalDetail = useQuery({
    queryKey: ["proposal", networkId, selectedProposal],
    queryFn: () =>
      getProposal(networkId, selectedProposal!.layer, selectedProposal!.proposalId),
    enabled: Boolean(selectedProposal)
  });

  const voteMutation = useMutation({
    mutationFn: async ({
      proposal,
      support
    }: {
      proposal: ProposalDetail;
      support: boolean;
    }) => {
      if (!wallet.wallet || !wallet.chainId) {
        throw new Error("connect wallet first");
      }
      return submitVote(wallet.wallet, wallet.chainId, proposal, support);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["proposals", networkId] }),
        queryClient.invalidateQueries({ queryKey: ["proposal", networkId] }),
        queryClient.invalidateQueries({ queryKey: ["overview", networkId] })
      ]);
    }
  });

  const activeAccount = wallet.account;
  const needsVote = useMemo(
    () =>
      proposals.data?.proposals.filter((proposal) => {
        if (proposal.status !== "pending" || !activeAccount) {
          return false;
        }
        const detail = proposalDetail.data;
        if (
          detail?.layer === proposal.layer &&
          detail.proposalId === proposal.proposalId
        ) {
          return canVote(detail, activeAccount);
        }
        return true;
      }) ?? [],
    [activeAccount, proposals.data?.proposals, proposalDetail.data],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={24} />
          <div>
            <strong>Xian Governance</strong>
            <span>Validator operations</span>
          </div>
        </div>
        <nav>
          <NavButton active={view === "dashboard"} icon={<Activity />} onClick={() => setView("dashboard")}>
            Dashboard
          </NavButton>
          <NavButton active={view === "proposals"} icon={<Vote />} onClick={() => setView("proposals")}>
            Proposals
          </NavButton>
          <NavButton active={view === "validators"} icon={<Users />} onClick={() => setView("validators")}>
            Validators
          </NavButton>
          <NavButton active={view === "patches"} icon={<FileJson />} onClick={() => setView("patches")}>
            State Patches
          </NavButton>
          <NavButton active={view === "create"} icon={<GitPullRequest />} onClick={() => setView("create")}>
            Create
          </NavButton>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="network-picker">
            <RadioTower size={16} />
            <select
              value={networkId}
              onChange={(event) => setSelectedNetwork(event.target.value)}
            >
              {networks.data?.networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </select>
          </div>
          <div className="wallet-box">
            <div>
              <span>{wallet.status === "connected" ? "Connected" : "Wallet"}</span>
              <strong>{shortAddress(wallet.account)}</strong>
            </div>
            <button type="button" className="primary" onClick={wallet.connect}>
              Connect
            </button>
          </div>
        </header>

        {wallet.error ? <div className="notice error">{wallet.error}</div> : null}

        {view === "dashboard" ? (
          <Dashboard
            overview={overview.data}
            proposals={proposals.data?.proposals ?? []}
            needsVote={needsVote}
            onOpenProposal={(proposal) => {
              setSelectedProposal(proposal);
              setView("proposals");
            }}
          />
        ) : null}

        {view === "proposals" ? (
          <div className="split-layout">
            <ProposalList
              proposals={proposals.data?.proposals ?? []}
              selected={selectedProposal}
              onSelect={setSelectedProposal}
            />
            <ProposalDetailPanel
              proposal={proposalDetail.data}
              account={wallet.account}
              loading={proposalDetail.isLoading}
              onVote={(proposal, support) => voteMutation.mutate({ proposal, support })}
              voting={voteMutation.isPending}
              voteError={voteMutation.error}
            />
          </div>
        ) : null}

        {view === "validators" ? (
          <ValidatorsView
            active={validators.data?.active ?? []}
            candidates={validators.data?.candidates ?? []}
          />
        ) : null}

        {view === "patches" ? (
          <PatchesView patches={patches.data?.patches ?? []} />
        ) : null}

        {view === "create" ? (
          <CreateProposal
            chainId={overview.data?.chain.chainId ?? wallet.chainId}
            wallet={wallet}
            onSubmitted={() => {
              void queryClient.invalidateQueries({ queryKey: ["proposals", networkId] });
              setView("proposals");
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function NavButton({
  active,
  icon,
  children,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav-item active" : "nav-item"} type="button" onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Dashboard({
  overview,
  proposals,
  needsVote,
  onOpenProposal
}: {
  overview?: Awaited<ReturnType<typeof getOverview>>;
  proposals: ProposalSummary[];
  needsVote: ProposalSummary[];
  onOpenProposal: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  const pending = proposals.filter((proposal) => proposal.status === "pending");
  return (
    <section className="view-stack">
      <div className="metric-grid">
        <Metric label="Height" value={overview?.chain.latestHeight ?? "unknown"} />
        <Metric label="Active Validators" value={overview?.activeValidators ?? 0} />
        <Metric label="Voting Weight" value={overview?.totalVotingWeight ?? 0} />
        <Metric label="Pending Proposals" value={overview?.pendingProposals ?? pending.length} />
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Needs Attention</h2>
          <span>{needsVote.length} open</span>
        </div>
        <ProposalTable proposals={needsVote.length ? needsVote : pending.slice(0, 6)} onOpen={onOpenProposal} />
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Recent Proposals</h2>
          <span>{proposals.length} indexed</span>
        </div>
        <ProposalTable proposals={proposals.slice(0, 8)} onOpen={onOpenProposal} />
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProposalList({
  proposals,
  selected,
  onSelect
}: {
  proposals: ProposalSummary[];
  selected: { layer: GovernanceLayer; proposalId: number } | null;
  onSelect: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  return (
    <section className="panel list-panel">
      <div className="panel-title">
        <h2>Proposals</h2>
        <span>{proposals.length}</span>
      </div>
      <div className="proposal-list">
        {proposals.map((proposal) => (
          <button
            key={`${proposal.layer}-${proposal.proposalId}`}
            className={
              selected?.layer === proposal.layer &&
              selected.proposalId === proposal.proposalId
                ? "proposal-row active"
                : "proposal-row"
            }
            type="button"
            onClick={() =>
              onSelect({ layer: proposal.layer, proposalId: proposal.proposalId })
            }
          >
            <StatusBadge status={proposal.status} />
            <div>
              <strong>{proposal.title}</strong>
              <span>
                {proposal.layer} #{proposal.proposalId} / {proposal.type}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </section>
  );
}

function ProposalTable({
  proposals,
  onOpen
}: {
  proposals: ProposalSummary[];
  onOpen: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  if (!proposals.length) {
    return <div className="empty">No proposals to show.</div>;
  }
  return (
    <div className="table">
      <div className="table-head proposal-grid">
        <span>Proposal</span>
        <span>Status</span>
        <span>Progress</span>
        <span />
      </div>
      {proposals.map((proposal) => (
        <button
          key={`${proposal.layer}-${proposal.proposalId}`}
          className="table-row proposal-grid"
          type="button"
          onClick={() =>
            onOpen({ layer: proposal.layer, proposalId: proposal.proposalId })
          }
        >
          <span>
            <strong>{proposal.title}</strong>
            <small>
              {proposal.layer} #{proposal.proposalId}
            </small>
          </span>
          <StatusBadge status={proposal.status} />
          <ProgressBar
            value={proposal.yesWeight}
            max={proposal.requiredYesWeight || proposal.totalWeightSnapshot}
          />
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function ProposalDetailPanel({
  proposal,
  account,
  loading,
  onVote,
  voting,
  voteError
}: {
  proposal?: ProposalDetail;
  account: string | null;
  loading: boolean;
  onVote: (proposal: ProposalDetail, support: boolean) => void;
  voting: boolean;
  voteError: unknown;
}) {
  if (loading) {
    return <section className="panel detail-panel">Loading proposal...</section>;
  }
  if (!proposal) {
    return <section className="panel detail-panel">Select a proposal.</section>;
  }
  const eligible = canVote(proposal, account);
  const referenceUrl = safeExternalUrl(proposal.uri);
  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <StatusBadge status={proposal.status} />
          <h1>{proposal.title}</h1>
          <p>
            {proposal.layer} #{proposal.proposalId} / {proposal.type}
          </p>
        </div>
        <div className="action-row">
          <button
            type="button"
            disabled={!eligible || voting}
            className="success"
            onClick={() => onVote(proposal, true)}
          >
            <Check size={16} /> Yes
          </button>
          <button
            type="button"
            disabled={!eligible || voting}
            className="danger"
            onClick={() => onVote(proposal, false)}
          >
            <X size={16} /> No
          </button>
        </div>
      </div>
      {voteError instanceof Error ? <div className="notice error">{voteError.message}</div> : null}
      <div className="detail-grid">
        <Metric label="Yes Weight" value={`${proposal.yesWeight}/${proposal.requiredYesWeight}`} />
        <Metric label="No Weight" value={proposal.noWeight} />
        <Metric label="Raw Votes" value={`${proposal.yesVotes} yes / ${proposal.noVotes} no`} />
        <Metric label="Expires" value={proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleString() : "unknown"} />
      </div>
      <ProgressBar value={proposal.yesWeight} max={proposal.requiredYesWeight} />
      {referenceUrl ? (
        <a className="reference-link" href={referenceUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Open off-chain reference
        </a>
      ) : null}
      <h3>Votes</h3>
      <div className="vote-matrix">
        {proposal.votes.map((vote) => (
          <div key={vote.voter} className="vote-row">
            <span>{shortAddress(vote.voter, 8)}</span>
            <strong>{vote.vote ?? "not voted"}</strong>
            <small>weight {vote.weight}</small>
          </div>
        ))}
      </div>
      <h3>Payload</h3>
      <pre>{JSON.stringify(proposal.payload, null, 2)}</pre>
    </section>
  );
}

function ValidatorsView({
  active,
  candidates
}: {
  active: ValidatorRecord[];
  candidates: ValidatorRecord[];
}) {
  return (
    <section className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <h2>Active Validators</h2>
          <span>{active.length}</span>
        </div>
        <ValidatorTable validators={active} />
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Pending Candidates</h2>
          <span>{candidates.length}</span>
        </div>
        <ValidatorTable validators={candidates} />
      </section>
    </section>
  );
}

function ValidatorTable({ validators }: { validators: ValidatorRecord[] }) {
  if (!validators.length) {
    return <div className="empty">No validators found.</div>;
  }
  return (
    <div className="table">
      <div className="table-head validator-grid">
        <span>Validator</span>
        <span>Status</span>
        <span>Power</span>
        <span>Endpoint</span>
      </div>
      {validators.map((validator) => (
        <div key={validator.account} className="table-row validator-grid">
          <span>
            <strong>{validator.moniker || shortAddress(validator.account, 8)}</strong>
            <small>{shortAddress(validator.account, 10)}</small>
          </span>
          <span>{validator.jailed ? "jailed" : validator.status ?? "unknown"}</span>
          <span>{validator.power}</span>
          <span>{validator.networkEndpoint ?? "not set"}</span>
        </div>
      ))}
    </div>
  );
}

function PatchesView({
  patches
}: {
  patches: Awaited<ReturnType<typeof getStatePatches>>["patches"];
}) {
  const [hashResult, setHashResult] = useState<string | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);
  return (
    <section className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <h2>State Patches</h2>
          <span>{patches.length}</span>
        </div>
        <ProposalTable
          proposals={patches.map((patch) => ({
            networkId: "local",
            layer: "protocol",
            proposalId: patch.proposalId,
            kind: "state_patch",
            type: "state_patch",
            title: patch.summary || patch.patchId,
            summary: patch.summary || "",
            status: patch.status === "applied" ? "applied" : patch.status === "approved" ? "approved" : "pending",
            yesVotes: 0,
            noVotes: 0,
            yesWeight: 0,
            noWeight: 0,
            requiredYesVotes: 0,
            requiredYesWeight: 0,
            totalWeightSnapshot: 0,
            patchId: patch.patchId,
            activationHeight: patch.activationHeight
          }))}
          onOpen={() => undefined}
        />
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Bundle Hash Verifier</h2>
          <span>local only</span>
        </div>
        <textarea
          className="json-input"
          placeholder="Paste a state patch bundle JSON file"
          onChange={(event) => {
            try {
              const bundle = parseStatePatchBundle(JSON.parse(event.target.value));
              setHashResult(computeStatePatchBundleHash(bundle));
              setHashError(null);
            } catch (error) {
              setHashResult(null);
              setHashError(error instanceof Error ? error.message : "invalid bundle");
            }
          }}
        />
        {hashResult ? <div className="notice success">Hash: {hashResult}</div> : null}
        {hashError ? <div className="notice error">{hashError}</div> : null}
      </section>
    </section>
  );
}

function CreateProposal({
  chainId,
  wallet,
  onSubmitted
}: {
  chainId: string | null;
  wallet: ReturnType<typeof useXianWallet>;
  onSubmitted: () => void;
}) {
  const [template, setTemplate] = useState<
    "contract_call" | "state_patch" | "validator_vote"
  >("contract_call");
  const [targetContract, setTargetContract] = useState("");
  const [targetFunction, setTargetFunction] = useState("");
  const [summary, setSummary] = useState("");
  const [kwargsJson, setKwargsJson] = useState("{}");
  const [patchId, setPatchId] = useState("");
  const [bundleHash, setBundleHash] = useState("");
  const [activationHeight, setActivationHeight] = useState("");
  const [uri, setUri] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [voteType, setVoteType] = useState("topic_vote");
  const [argJson, setArgJson] = useState('{"topic": ""}');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      setError(null);
      if (!wallet.wallet || !wallet.chainId) {
        throw new Error("connect wallet first");
      }
      const intent = buildProposalIntent();
      setStatus("Waiting for wallet approval...");
      const result = await wallet.wallet.sendCall(
        {
          chainId: chainId ?? wallet.chainId,
          ...intent
        },
        { mode: "checktx", waitForTx: true },
      );
      setStatus(`Submitted ${result.txHash ?? "transaction"}`);
      onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "proposal submission failed");
      setStatus(null);
    }
  }

  function buildProposalIntent() {
    if (template === "contract_call") {
      return {
        contract: "governance",
        function: "propose_contract_call",
        kwargs: {
          target_contract: targetContract,
          target_function: targetFunction,
          kwargs: parseJsonObject(kwargsJson),
          summary
        }
      };
    }
    if (template === "state_patch") {
      return {
        contract: "governance",
        function: "propose_state_patch",
        kwargs: {
          patch_id: patchId,
          bundle_hash: bundleHash,
          activation_height: Number(activationHeight),
          summary,
          uri,
          emergency
        }
      };
    }
    return {
      contract: "masternodes",
      function: "propose_vote",
      kwargs: {
        type_of_vote: voteType,
        arg: parseJsonValue(argJson)
      }
    };
  }

  return (
    <section className="panel create-panel">
      <div className="panel-title">
        <h2>Create Proposal</h2>
        <span>{chainId ?? "unknown chain"}</span>
      </div>
      <div className="template-grid">
        <TemplateCard
          active={template === "contract_call"}
          title="Protocol Contract Call"
          contract="governance"
          fn="propose_contract_call"
          onClick={() => setTemplate("contract_call")}
        />
        <TemplateCard
          active={template === "state_patch"}
          title="Protocol State Patch"
          contract="governance"
          fn="propose_state_patch"
          onClick={() => setTemplate("state_patch")}
        />
        <TemplateCard
          active={template === "validator_vote"}
          title="Validator Governance"
          contract="masternodes"
          fn="propose_vote"
          onClick={() => setTemplate("validator_vote")}
        />
      </div>
      {template === "contract_call" ? (
        <div className="form-grid">
          <label>
            Target contract
            <input value={targetContract} onChange={(event) => setTargetContract(event.target.value)} />
          </label>
          <label>
            Target function
            <input value={targetFunction} onChange={(event) => setTargetFunction(event.target.value)} />
          </label>
          <label className="wide">
            Summary
            <input value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label className="wide">
            Kwargs JSON
            <textarea value={kwargsJson} onChange={(event) => setKwargsJson(event.target.value)} />
          </label>
        </div>
      ) : null}
      {template === "state_patch" ? (
        <div className="form-grid">
          <label>
            Patch id
            <input value={patchId} onChange={(event) => setPatchId(event.target.value)} />
          </label>
          <label>
            Bundle hash
            <input value={bundleHash} onChange={(event) => setBundleHash(event.target.value)} />
          </label>
          <label>
            Activation height
            <input value={activationHeight} onChange={(event) => setActivationHeight(event.target.value)} />
          </label>
          <label>
            URI
            <input value={uri} onChange={(event) => setUri(event.target.value)} />
          </label>
          <label className="wide">
            Summary
            <input value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label className="checkbox-line">
            <input type="checkbox" checked={emergency} onChange={(event) => setEmergency(event.target.checked)} />
            Emergency threshold
          </label>
        </div>
      ) : null}
      {template === "validator_vote" ? (
        <div className="form-grid">
          <label>
            Vote type
            <select value={voteType} onChange={(event) => setVoteType(event.target.value)}>
              <option value="topic_vote">topic_vote</option>
              <option value="add_member">add_member</option>
              <option value="remove_member">remove_member</option>
              <option value="jail_member">jail_member</option>
              <option value="unjail_member">unjail_member</option>
              <option value="slash_member">slash_member</option>
              <option value="set_member_power">set_member_power</option>
              <option value="update_policy">update_policy</option>
              <option value="reward_change">reward_change</option>
              <option value="dao_payout">dao_payout</option>
              <option value="chi_cost_change">chi_cost_change</option>
              <option value="change_registration_fee">change_registration_fee</option>
              <option value="change_types">change_types</option>
            </select>
          </label>
          <label className="wide">
            Argument JSON
            <textarea value={argJson} onChange={(event) => setArgJson(event.target.value)} />
          </label>
        </div>
      ) : null}
      <div className="action-row">
        <button type="button" className="primary" onClick={submit}>
          Submit with wallet
        </button>
      </div>
      {status ? <div className="notice success">{status}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      <div className="notice">
        Proposal creation signs through the injected wallet. The backend never
        submits transactions or handles private keys.
      </div>
    </section>
  );
}

function TemplateCard({
  active,
  title,
  contract,
  fn,
  onClick
}: {
  active: boolean;
  title: string;
  contract: string;
  fn: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "template-card active" : "template-card"} onClick={onClick}>
      <strong>{title}</strong>
      <span>
        {contract}.{fn}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("invalid JSON");
  }
}

function safeExternalUrl(value?: string | null) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const width = percent(value, max);
  return (
    <div className="progress" aria-label={`${Math.round(width)} percent`}>
      <div style={{ width: `${width}%` }} />
    </div>
  );
}
