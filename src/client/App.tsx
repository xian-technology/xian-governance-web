import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  ChevronRight,
  Clock,
  FileJson,
  GitPullRequest,
  RadioTower,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  Vote,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  getHistory,
  getNetworks,
  getOverview,
  getPolicy,
  getProposal,
  getProposals,
  getStatePatches,
  getValidators
} from "./api";
import {
  canExpire,
  canVote,
  ChainMismatchError,
  resolveGovernanceContracts,
  resolveSigningChainId,
  submitExpire,
  submitVote,
  useXianWallet
} from "./wallet";
import { CreateProposal } from "./CreateProposal";
import {
  CopyButton,
  formatDateTime,
  Metric,
  ProgressBar,
  ReferenceLinks,
  shortHash,
  StatusBadge
} from "./components";
import { shortAddress } from "../shared/format";
import {
  computeStatePatchBundleHash,
  parseStatePatchBundle
} from "../shared/statePatchHash";
import type {
  GovernanceHistoryEvent,
  GovernanceHistoryResponse,
  GovernanceLayer,
  NetworkPolicy,
  ProposalDetail,
  ProposalStatus,
  ProposalSummary,
  StatePatchRecord,
  ValidatorRecord,
  VoteRecord
} from "../shared/types";

type View = "dashboard" | "proposals" | "validators" | "patches" | "create" | "settings";

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Network health and proposals at a glance" },
  proposals: { title: "Proposals", subtitle: "Review, vote, and inspect governance proposals" },
  validators: { title: "Validators", subtitle: "Active validators and pending candidates" },
  patches: { title: "State Patches", subtitle: "Scheduled patches and bundle hash verification" },
  create: { title: "Create Proposal", subtitle: "Author a new on-chain governance proposal" },
  settings: { title: "Network Settings", subtitle: "Governance and validator-set policy" }
};

export function App() {
  const queryClient = useQueryClient();
  const wallet = useXianWallet();
  const account = wallet.account;
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
    queryKey: ["proposals", networkId, account],
    queryFn: () => getProposals(networkId, account),
    enabled: Boolean(networkId)
  });
  const history = useQuery({
    queryKey: ["history", networkId],
    queryFn: () => getHistory(networkId),
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
  const policy = useQuery({
    queryKey: ["policy", networkId],
    queryFn: () => getPolicy(networkId),
    enabled: Boolean(networkId) && view === "settings"
  });
  const proposalDetail = useQuery({
    queryKey: ["proposal", networkId, selectedProposal, account],
    queryFn: () =>
      getProposal(networkId, selectedProposal!.layer, selectedProposal!.proposalId, account),
    enabled: Boolean(selectedProposal)
  });

  function invalidateProposalData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["proposals", networkId] }),
      queryClient.invalidateQueries({ queryKey: ["proposal", networkId] }),
      queryClient.invalidateQueries({ queryKey: ["history", networkId] }),
      queryClient.invalidateQueries({ queryKey: ["overview", networkId] })
    ]);
  }

  const voteMutation = useMutation({
    mutationFn: async ({ proposal, support }: { proposal: ProposalDetail; support: boolean }) => {
      if (!wallet.wallet) {
        throw new Error("connect wallet first");
      }
      const chainId = resolveSigningChainId(wallet.chainId, overview.data?.chain.chainId);
      return submitVote(
        wallet.wallet,
        chainId,
        resolveGovernanceContracts(overview.data?.network),
        proposal,
        support,
      );
    },
    onSuccess: invalidateProposalData
  });

  const expireMutation = useMutation({
    mutationFn: async ({ proposal }: { proposal: ProposalDetail }) => {
      if (!wallet.wallet) {
        throw new Error("connect wallet first");
      }
      const chainId = resolveSigningChainId(wallet.chainId, overview.data?.chain.chainId);
      return submitExpire(
        wallet.wallet,
        chainId,
        resolveGovernanceContracts(overview.data?.network),
        proposal.layer,
        proposal.proposalId,
      );
    },
    onSuccess: invalidateProposalData
  });

  const needsVote = useMemo(
    () =>
      (proposals.data?.proposals ?? []).filter(
        (proposal) => proposal.status === "pending" && proposal.viewer?.eligible,
      ),
    [proposals.data?.proposals],
  );

  const walletMissing = wallet.status === "missing";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={20} strokeWidth={2.25} />
          </div>
          <div className="brand-text">
            <strong>Xian Governance</strong>
            <span>Validator operations</span>
          </div>
        </div>
        <div>
          <div className="nav-section-label">Workspace</div>
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
            <NavButton active={view === "settings"} icon={<SettingsIcon />} onClick={() => setView("settings")}>
              Settings
            </NavButton>
          </nav>
        </div>
        <div className="sidebar-footer">
          <span className="dot" />
          <span>{overview.data?.chain.chainId ?? networkId}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <div className="page-title">
              <strong>{VIEW_META[view].title}</strong>
              <span>{VIEW_META[view].subtitle}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="network-picker">
              <RadioTower size={15} />
              <select value={networkId} onChange={(event) => setSelectedNetwork(event.target.value)}>
                {networks.data?.networks.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="wallet-box">
              <div className="wallet-status">
                <span>
                  {wallet.status === "connected" ? <span className="live-dot" /> : null}
                  {wallet.status === "connected" ? "Connected" : "Wallet"}
                </span>
                <strong>{shortAddress(wallet.account) || "—"}</strong>
              </div>
              <button
                type="button"
                className={wallet.status === "connected" ? "ghost" : "primary"}
                onClick={wallet.connect}
                disabled={wallet.connecting}
              >
                {wallet.connecting ? "…" : wallet.status === "connected" ? "Reconnect" : "Connect"}
              </button>
            </div>
          </div>
        </header>

        {walletMissing ? (
          <div className="notice warning">
            No Xian wallet detected. Install the Xian browser wallet to vote or create proposals.
            Reading governance state works without a wallet.
          </div>
        ) : null}
        {wallet.error ? <div className="notice error">{wallet.error}</div> : null}
        <ChainBanner
          walletChainId={wallet.chainId}
          networkChainId={overview.data?.chain.chainId ?? null}
          connected={wallet.status === "connected"}
        />

        {view === "dashboard" ? (
          <Dashboard
            overview={overview.data}
            loading={overview.isLoading}
            proposals={proposals.data?.proposals ?? []}
            history={history.data}
            needsVote={needsVote}
            connected={wallet.status === "connected"}
            onOpenProposal={(proposal) => {
              setSelectedProposal(proposal);
              setView("proposals");
            }}
          />
        ) : null}

        {view === "proposals" ? (
          <ProposalsView
            proposals={proposals.data?.proposals ?? []}
            loading={proposals.isLoading}
            selected={selectedProposal}
            onSelect={setSelectedProposal}
            detail={proposalDetail.data}
            detailLoading={proposalDetail.isLoading}
            account={wallet.account}
            onVote={(proposal, support) => voteMutation.mutate({ proposal, support })}
            onExpire={(proposal) => expireMutation.mutate({ proposal })}
            voting={voteMutation.isPending}
            expiring={expireMutation.isPending}
            actionError={voteMutation.error ?? expireMutation.error}
          />
        ) : null}

        {view === "validators" ? (
          <ValidatorsView
            active={validators.data?.active ?? []}
            candidates={validators.data?.candidates ?? []}
            loading={validators.isLoading}
          />
        ) : null}

        {view === "patches" ? (
          <PatchesView patches={patches.data?.patches ?? []} loading={patches.isLoading} />
        ) : null}

        {view === "create" ? (
          <CreateProposal
            networkId={networkId}
            overview={overview.data}
            wallet={wallet}
            onSubmitted={() => {
              void invalidateProposalData();
              setView("proposals");
            }}
          />
        ) : null}

        {view === "settings" ? (
          <SettingsView policy={policy.data} loading={policy.isLoading} networkName={
            networks.data?.networks.find((network) => network.id === networkId)?.name ?? networkId
          } />
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

function ChainBanner({
  walletChainId,
  networkChainId,
  connected
}: {
  walletChainId: string | null;
  networkChainId: string | null;
  connected: boolean;
}) {
  if (!connected || !walletChainId || !networkChainId || walletChainId === networkChainId) {
    return null;
  }
  return (
    <div className="notice error">
      Wallet chain <strong>{walletChainId}</strong> does not match the selected network{" "}
      <strong>{networkChainId}</strong>. Signing is blocked until they match.
    </div>
  );
}

function Dashboard({
  overview,
  loading,
  proposals,
  history,
  needsVote,
  connected,
  onOpenProposal
}: {
  overview?: Awaited<ReturnType<typeof getOverview>>;
  loading: boolean;
  proposals: ProposalSummary[];
  history?: GovernanceHistoryResponse;
  needsVote: ProposalSummary[];
  connected: boolean;
  onOpenProposal: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  const pending = proposals.filter((proposal) => proposal.status === "pending");
  return (
    <section className="view-stack">
      <div className="metric-grid">
        <Metric label="Height" value={overview?.chain.latestHeight ?? (loading ? "…" : "unknown")} />
        <Metric label="Active Validators" value={overview?.activeValidators ?? 0} />
        <Metric label="Voting Weight" value={overview?.totalVotingWeight ?? 0} />
        <Metric label="Pending Proposals" value={overview?.pendingProposals ?? pending.length} />
        <Metric label="Expiring Soon" value={overview?.expiringSoon ?? 0} />
        <Metric label="Scheduled Patches" value={overview?.scheduledPatches ?? 0} />
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Needs Your Vote</h2>
          <span>{needsVote.length} open</span>
        </div>
        {!connected ? (
          <div className="empty">Connect your validator wallet to see proposals needing your vote.</div>
        ) : needsVote.length === 0 ? (
          <div className="empty">You are up to date — no pending proposals need your vote.</div>
        ) : (
          <ProposalTable proposals={needsVote} onOpen={onOpenProposal} />
        )}
      </section>
      <GovernanceHistoryFeed history={history} onOpenProposal={onOpenProposal} />
      <section className="panel">
        <div className="panel-title">
          <h2>Recent Proposals</h2>
          <span>{proposals.length} indexed</span>
        </div>
        {loading && proposals.length === 0 ? (
          <div className="empty">Loading proposals…</div>
        ) : (
          <ProposalTable proposals={proposals.slice(0, 8)} onOpen={onOpenProposal} />
        )}
      </section>
    </section>
  );
}

function GovernanceHistoryFeed({
  history,
  onOpenProposal
}: {
  history?: GovernanceHistoryResponse;
  onOpenProposal: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  const events = history?.events ?? [];
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Recent Governance Events</h2>
        <span>{history?.available === false ? "direct RPC" : `${events.length} indexed`}</span>
      </div>
      {history?.available === false ? (
        <div className="empty">BDS history unavailable on this node.</div>
      ) : null}
      {history?.available !== false && events.length === 0 ? (
        <div className="empty">No governance events indexed yet.</div>
      ) : null}
      {history?.available !== false && events.length > 0 ? (
        <div className="event-feed">
          {events.slice(0, 8).map((event, index) => (
            <HistoryEventRow key={eventKey(event, index)} event={event} onOpenProposal={onOpenProposal} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface ProposalFilters {
  layer: "all" | GovernanceLayer;
  status: "all" | ProposalStatus;
  type: "all" | string;
  needsVote: boolean;
  emergency: boolean;
  expiringSoon: boolean;
  search: string;
}

const DEFAULT_FILTERS: ProposalFilters = {
  layer: "all",
  status: "all",
  type: "all",
  needsVote: false,
  emergency: false,
  expiringSoon: false,
  search: ""
};

function ProposalsView({
  proposals,
  loading,
  selected,
  onSelect,
  detail,
  detailLoading,
  account,
  onVote,
  onExpire,
  voting,
  expiring,
  actionError
}: {
  proposals: ProposalSummary[];
  loading: boolean;
  selected: { layer: GovernanceLayer; proposalId: number } | null;
  onSelect: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
  detail?: ProposalDetail;
  detailLoading: boolean;
  account: string | null;
  onVote: (proposal: ProposalDetail, support: boolean) => void;
  onExpire: (proposal: ProposalDetail) => void;
  voting: boolean;
  expiring: boolean;
  actionError: unknown;
}) {
  const [filters, setFilters] = useState<ProposalFilters>(DEFAULT_FILTERS);
  const types = useMemo(
    () => Array.from(new Set(proposals.map((proposal) => proposal.type))).sort(),
    [proposals],
  );
  const filtered = useMemo(
    () => proposals.filter((proposal) => matchesFilters(proposal, filters)),
    [proposals, filters],
  );

  return (
    <div className="view-stack">
      <ProposalFilterBar filters={filters} types={types} onChange={setFilters} total={proposals.length} shown={filtered.length} />
      <div className="split-layout">
        <ProposalList proposals={filtered} loading={loading} selected={selected} onSelect={onSelect} />
        <ProposalDetailPanel
          proposal={detail}
          account={account}
          loading={detailLoading}
          onVote={onVote}
          onExpire={onExpire}
          voting={voting}
          expiring={expiring}
          actionError={actionError}
        />
      </div>
    </div>
  );
}

function ProposalFilterBar({
  filters,
  types,
  onChange,
  total,
  shown
}: {
  filters: ProposalFilters;
  types: string[];
  onChange: (filters: ProposalFilters) => void;
  total: number;
  shown: number;
}) {
  const update = (patch: Partial<ProposalFilters>) => onChange({ ...filters, ...patch });
  return (
    <section className="panel filter-bar">
      <div className="filter-row">
        <input
          className="filter-search"
          placeholder="Search title, proposer, id…"
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
        />
        <select value={filters.layer} onChange={(event) => update({ layer: event.target.value as ProposalFilters["layer"] })}>
          <option value="all">All layers</option>
          <option value="protocol">Protocol</option>
          <option value="validator">Validator</option>
        </select>
        <select value={filters.status} onChange={(event) => update({ status: event.target.value as ProposalFilters["status"] })}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="executed">Executed</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="applied">Applied</option>
        </select>
        <select value={filters.type} onChange={(event) => update({ type: event.target.value })}>
          <option value="all">All types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-row">
        <FilterChip active={filters.needsVote} onClick={() => update({ needsVote: !filters.needsVote })}>
          Needs my vote
        </FilterChip>
        <FilterChip active={filters.emergency} onClick={() => update({ emergency: !filters.emergency })}>
          Emergency
        </FilterChip>
        <FilterChip active={filters.expiringSoon} onClick={() => update({ expiringSoon: !filters.expiringSoon })}>
          Expiring soon
        </FilterChip>
        <span className="filter-count">
          {shown}/{total}
        </span>
      </div>
    </section>
  );
}

function FilterChip({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "filter-chip active" : "filter-chip"} onClick={onClick}>
      {children}
    </button>
  );
}

function matchesFilters(proposal: ProposalSummary, filters: ProposalFilters): boolean {
  if (filters.layer !== "all" && proposal.layer !== filters.layer) return false;
  if (filters.status !== "all" && proposal.status !== filters.status) return false;
  if (filters.type !== "all" && proposal.type !== filters.type) return false;
  if (filters.needsVote && !proposal.viewer?.eligible) return false;
  if (filters.emergency && !proposal.emergency) return false;
  if (filters.expiringSoon && !isExpiringSoon(proposal)) return false;
  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = [
      proposal.title,
      proposal.type,
      proposal.proposer ?? "",
      `#${proposal.proposalId}`,
      proposal.layer
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function isExpiringSoon(proposal: ProposalSummary): boolean {
  if (proposal.status !== "pending" || !proposal.expiresAt) return false;
  const expiresAt = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  const delta = expiresAt - Date.now();
  return delta > 0 && delta <= 48 * 60 * 60 * 1000;
}

function ProposalList({
  proposals,
  loading,
  selected,
  onSelect
}: {
  proposals: ProposalSummary[];
  loading: boolean;
  selected: { layer: GovernanceLayer; proposalId: number } | null;
  onSelect: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  return (
    <section className="panel list-panel">
      <div className="panel-title">
        <h2>Proposals</h2>
        <span>{proposals.length}</span>
      </div>
      {loading && proposals.length === 0 ? (
        <div className="empty">Loading proposals…</div>
      ) : proposals.length === 0 ? (
        <div className="empty">No proposals match the current filters.</div>
      ) : (
        <div className="proposal-list">
          {proposals.map((proposal) => (
            <button
              key={`${proposal.layer}-${proposal.proposalId}`}
              className={
                selected?.layer === proposal.layer && selected.proposalId === proposal.proposalId
                  ? "proposal-row active"
                  : "proposal-row"
              }
              type="button"
              onClick={() => onSelect({ layer: proposal.layer, proposalId: proposal.proposalId })}
            >
              <StatusBadge status={proposal.status} />
              <div>
                <strong>
                  {proposal.emergency ? <span className="tag danger">emergency</span> : null}
                  {proposal.title}
                </strong>
                <span>
                  {proposal.layer} #{proposal.proposalId} / {proposal.type}
                </span>
              </div>
              <span className="row-end">
                {proposal.viewer?.eligible ? <span className="tag warn">vote</span> : null}
                <ChevronRight size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
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
          onClick={() => onOpen({ layer: proposal.layer, proposalId: proposal.proposalId })}
        >
          <span>
            <strong>{proposal.title}</strong>
            <small>
              {proposal.layer} #{proposal.proposalId}
            </small>
          </span>
          <StatusBadge status={proposal.status} />
          <ProgressBar value={proposal.yesWeight} max={proposal.requiredYesWeight || proposal.totalWeightSnapshot} />
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
  onExpire,
  voting,
  expiring,
  actionError
}: {
  proposal?: ProposalDetail;
  account: string | null;
  loading: boolean;
  onVote: (proposal: ProposalDetail, support: boolean) => void;
  onExpire: (proposal: ProposalDetail) => void;
  voting: boolean;
  expiring: boolean;
  actionError: unknown;
}) {
  if (loading) {
    return <section className="panel detail-panel">Loading proposal…</section>;
  }
  if (!proposal) {
    return <section className="panel detail-panel">Select a proposal.</section>;
  }
  const eligible = canVote(proposal, account);
  const expirable = canExpire(proposal);
  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <StatusBadge status={proposal.status} />
          <h1>
            {proposal.emergency ? <span className="tag danger">emergency</span> : null}
            {proposal.title}
          </h1>
          <p>
            {proposal.layer} #{proposal.proposalId} / {proposal.type}
          </p>
        </div>
        <div className="action-row">
          <button type="button" disabled={!eligible || voting} className="success" onClick={() => onVote(proposal, true)}>
            <Check size={16} /> Yes
          </button>
          <button type="button" disabled={!eligible || voting} className="danger" onClick={() => onVote(proposal, false)}>
            <X size={16} /> No
          </button>
          {expirable ? (
            <button type="button" disabled={expiring} className="ghost" onClick={() => onExpire(proposal)}>
              <Clock size={16} /> Mark expired
            </button>
          ) : null}
        </div>
      </div>

      <ViewerStatus proposal={proposal} account={account} />
      <EffectPreview proposal={proposal} />
      {actionError instanceof Error ? <div className="notice error">{actionError.message}</div> : null}

      <div className="detail-grid">
        <Metric label="Yes Weight" value={`${proposal.yesWeight}/${proposal.requiredYesWeight}`} />
        <Metric label="No Weight" value={proposal.noWeight} />
        <Metric label="Raw Votes" value={`${proposal.yesVotes} yes / ${proposal.noVotes} no`} />
        <Metric
          label="Expires"
          value={proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleString() : "unknown"}
        />
      </div>
      <ProgressBar value={proposal.yesWeight} max={proposal.requiredYesWeight} />

      <ReferenceLinks uri={proposal.uri} summary={proposal.summary} />

      <h3>Timeline</h3>
      <ProposalTimeline available={proposal.historyAvailable} events={proposal.timeline ?? []} />

      <h3>Votes</h3>
      <div className="vote-matrix">
        {proposal.votes.map((vote) => (
          <div key={vote.voter} className="vote-row">
            <span>{shortAddress(vote.voter, 8)}</span>
            <strong className={voteClass(vote)}>{voteLabel(vote)}</strong>
            <small>weight {vote.weight}</small>
            <small>{vote.votedAt ? formatDateTime(vote.votedAt) : shortHash(vote.txHash) ?? "—"}</small>
          </div>
        ))}
      </div>

      <h3>
        Payload <CopyButton value={JSON.stringify(proposal.payload, null, 2)} label="Copy" />
      </h3>
      <pre>{JSON.stringify(proposal.payload, null, 2)}</pre>
    </section>
  );
}

function ViewerStatus({ proposal, account }: { proposal: ProposalDetail; account: string | null }) {
  if (!account) {
    return <div className="viewer-status muted">Connect a wallet to check your eligibility.</div>;
  }
  const viewer = proposal.viewer;
  if (!viewer || viewer.account !== account) {
    return null;
  }
  if (viewer.hasVoted) {
    return (
      <div className="viewer-status voted">
        You voted <strong>{viewer.vote}</strong> (weight {viewer.weight})
        {viewer.isProposer ? " · proposer" : ""}.
      </div>
    );
  }
  if (viewer.eligible) {
    return <div className="viewer-status eligible">You can vote on this proposal (weight {viewer.weight}).</div>;
  }
  if (proposal.status !== "pending") {
    return <div className="viewer-status muted">Voting is closed for this proposal.</div>;
  }
  return <div className="viewer-status muted">Your account is not eligible to vote on this proposal.</div>;
}

function EffectPreview({ proposal }: { proposal: ProposalDetail }) {
  let text: string;
  if (proposal.kind === "state_patch") {
    text = proposal.activationHeight
      ? `Schedules a state patch at block ${proposal.activationHeight} once approved.`
      : "Schedules a state patch once approved.";
  } else if (proposal.kind === "contract_call") {
    text = `Executes ${proposal.targetContract ?? "contract"}.${proposal.targetFunction ?? "call"} immediately on approval.`;
  } else {
    text = "Applies a validator-set / policy change on approval.";
  }
  return <div className={`effect-note${proposal.emergency ? " danger-note" : ""}`}>{text}</div>;
}

function voteLabel(vote: VoteRecord): string {
  if (vote.vote === "yes") return "yes";
  if (vote.vote === "no") return "no";
  return vote.weight > 0 ? "not voted" : "ineligible";
}

function voteClass(vote: VoteRecord): string {
  if (vote.vote === "yes") return "vote-yes";
  if (vote.vote === "no") return "vote-no";
  return vote.weight > 0 ? "vote-pending" : "vote-ineligible";
}

function ProposalTimeline({
  available,
  events
}: {
  available?: boolean;
  events: GovernanceHistoryEvent[];
}) {
  if (available === false) {
    return <div className="empty">BDS history unavailable on this node.</div>;
  }
  if (!events.length) {
    return <div className="empty">No indexed events for this proposal.</div>;
  }
  return (
    <div className="timeline">
      {events.map((event, index) => (
        <HistoryEventRow key={eventKey(event, index)} event={event} />
      ))}
    </div>
  );
}

function HistoryEventRow({
  event,
  onOpenProposal
}: {
  event: GovernanceHistoryEvent;
  onOpenProposal?: (proposal: { layer: GovernanceLayer; proposalId: number }) => void;
}) {
  const canOpen = event.layer !== "unknown" && event.proposalId != null && onOpenProposal != null;
  const content = (
    <>
      <span className="event-dot" />
      <span className="event-copy">
        <strong>{event.title}</strong>
        <small>
          {event.layer}
          {event.proposalId == null ? "" : ` #${event.proposalId}`}
          {event.actor ? ` / ${shortAddress(event.actor, 8)}` : ""}
        </small>
      </span>
      <span className="event-meta">
        <strong>{formatDateTime(event.createdAt) ?? "unknown time"}</strong>
        <small>
          {event.blockHeight == null ? "" : `block ${event.blockHeight}`}
          {event.txHash ? ` / ${shortHash(event.txHash)}` : ""}
        </small>
      </span>
    </>
  );

  if (canOpen) {
    return (
      <button
        type="button"
        className="event-row"
        onClick={() => onOpenProposal({ layer: event.layer as GovernanceLayer, proposalId: event.proposalId! })}
      >
        {content}
      </button>
    );
  }
  return <div className="event-row">{content}</div>;
}

function ValidatorsView({
  active,
  candidates,
  loading
}: {
  active: ValidatorRecord[];
  candidates: ValidatorRecord[];
  loading: boolean;
}) {
  const [selected, setSelected] = useState<ValidatorRecord | null>(null);
  return (
    <section className="view-stack">
      {selected ? <ValidatorDetail validator={selected} onClose={() => setSelected(null)} /> : null}
      <section className="panel">
        <div className="panel-title">
          <h2>Active Validators</h2>
          <span>{active.length}</span>
        </div>
        <ValidatorTable validators={active} loading={loading} onSelect={setSelected} />
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Pending Candidates</h2>
          <span>{candidates.length}</span>
        </div>
        <ValidatorTable validators={candidates} loading={loading} onSelect={setSelected} />
      </section>
    </section>
  );
}

function ValidatorTable({
  validators,
  loading,
  onSelect
}: {
  validators: ValidatorRecord[];
  loading: boolean;
  onSelect: (validator: ValidatorRecord) => void;
}) {
  if (loading && validators.length === 0) {
    return <div className="empty">Loading validators…</div>;
  }
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
        <button
          key={validator.account}
          type="button"
          className="table-row validator-grid"
          onClick={() => onSelect(validator)}
        >
          <span>
            <strong>{validator.moniker || shortAddress(validator.account, 8)}</strong>
            <small>{shortAddress(validator.account, 10)}</small>
          </span>
          <span>{validator.jailed ? "jailed" : validator.status ?? "unknown"}</span>
          <span>{validator.power}</span>
          <span>{validator.networkEndpoint ?? "not set"}</span>
        </button>
      ))}
    </div>
  );
}

function ValidatorDetail({
  validator,
  onClose
}: {
  validator: ValidatorRecord;
  onClose: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{validator.moniker || shortAddress(validator.account, 10)}</h2>
        <button type="button" className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="detail-grid">
        <Metric label="Status" value={validator.jailed ? "jailed" : validator.status ?? "unknown"} />
        <Metric label="Active" value={validator.active ? "yes" : "no"} />
        <Metric label="Power" value={validator.power} />
        <Metric label="Requested Power" value={validator.requestedPower ?? "—"} />
        <Metric label="Self Bond" value={String(validator.selfBond ?? "—")} />
        <Metric label="Total Delegated" value={String(validator.totalDelegated ?? "—")} />
        <Metric label="Total Bond" value={String(validator.totalBond ?? "—")} />
        <Metric label="Commission (bps)" value={validator.commissionBps ?? "—"} />
        <Metric label="Delegators" value={validator.delegatorCount ?? "—"} />
        <Metric label="Reward Key" value={shortAddress(validator.rewardKey, 8)} />
      </div>
      <div className="kv-list">
        <KeyValue label="Account" value={validator.account} copy />
        <KeyValue label="Endpoint" value={validator.networkEndpoint ?? "not set"} copy={Boolean(validator.networkEndpoint)} />
        <KeyValue label="Metadata URI" value={validator.metadataUri ?? "not set"} />
        {validator.jailed ? <KeyValue label="Jail reason" value={validator.jailReason ?? "—"} /> : null}
      </div>
    </section>
  );
}

function KeyValue({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <code>{value}</code>
      {copy ? <CopyButton value={value} /> : null}
    </div>
  );
}

function PatchesView({
  patches,
  loading
}: {
  patches: StatePatchRecord[];
  loading: boolean;
}) {
  const [selected, setSelected] = useState<StatePatchRecord | null>(null);
  return (
    <section className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <h2>State Patches</h2>
          <span>{patches.length}</span>
        </div>
        {loading && patches.length === 0 ? (
          <div className="empty">Loading state patches…</div>
        ) : patches.length === 0 ? (
          <div className="empty">No state patches found.</div>
        ) : (
          <div className="table">
            <div className="table-head patch-grid">
              <span>Patch</span>
              <span>Status</span>
              <span>Activation</span>
              <span />
            </div>
            {patches.map((patch) => (
              <button
                key={patch.patchId}
                type="button"
                className="table-row patch-grid"
                onClick={() => setSelected(patch)}
              >
                <span>
                  <strong>{patch.summary || patch.patchId}</strong>
                  <small>{patch.patchId}</small>
                </span>
                <StatusBadge status={patch.status} />
                <span>{patch.activationHeight ?? "—"}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? <PatchDetail patch={selected} onClose={() => setSelected(null)} /> : null}
      <BundleVerifier expectedHash={selected?.bundleHash ?? null} patchId={selected?.patchId ?? null} />
    </section>
  );
}

function PatchDetail({ patch, onClose }: { patch: StatePatchRecord; onClose: () => void }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{patch.summary || patch.patchId}</h2>
        <button type="button" className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="detail-grid">
        <Metric label="Status" value={patch.status} />
        <Metric label="Activation Height" value={patch.activationHeight ?? "—"} />
        <Metric label="Emergency" value={patch.emergency ? "yes" : "no"} />
        <Metric label="Proposal" value={`#${patch.proposalId}`} />
        <Metric label="Applied Block" value={patch.appliedBlockHeight ?? "—"} />
        <Metric label="Approved" value={formatDateTime(patch.approvedAt) ?? "—"} />
      </div>
      <div className="kv-list">
        <KeyValue label="Patch id" value={patch.patchId} copy />
        <KeyValue label="Bundle hash" value={patch.bundleHash ?? "—"} copy={Boolean(patch.bundleHash)} />
        {patch.executionHash ? <KeyValue label="Execution hash" value={patch.executionHash} copy /> : null}
        {patch.appliedBlockHash ? <KeyValue label="Applied block hash" value={patch.appliedBlockHash} copy /> : null}
      </div>
      <ReferenceLinks uri={patch.uri} summary={patch.summary} />
    </section>
  );
}

function BundleVerifier({
  expectedHash,
  patchId
}: {
  expectedHash: string | null;
  patchId: string | null;
}) {
  const [hashResult, setHashResult] = useState<string | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);

  function verify(text: string) {
    if (!text.trim()) {
      setHashResult(null);
      setHashError(null);
      return;
    }
    try {
      const bundle = parseStatePatchBundle(JSON.parse(text));
      setHashResult(computeStatePatchBundleHash(bundle));
      setHashError(null);
    } catch (error) {
      setHashResult(null);
      setHashError(error instanceof Error ? error.message : "invalid bundle");
    }
  }

  const matches = hashResult != null && expectedHash != null && hashResult === expectedHash;
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Bundle Hash Verifier</h2>
        <span>{expectedHash ? `vs ${patchId}` : "local only"}</span>
      </div>
      {expectedHash ? (
        <div className="notice">
          Expected hash for <strong>{patchId}</strong>: <code>{shortHash(expectedHash, 10)}</code>
        </div>
      ) : null}
      <textarea
        className="json-input"
        placeholder="Paste a state patch bundle JSON file"
        onChange={(event) => verify(event.target.value)}
      />
      {hashResult ? (
        <div className={`notice ${expectedHash ? (matches ? "success" : "error") : "success"}`}>
          Hash: {hashResult}
          {expectedHash ? (matches ? " — matches the proposal bundle hash." : " — does NOT match the proposal bundle hash.") : ""}
        </div>
      ) : null}
      {hashError ? <div className="notice error">{hashError}</div> : null}
    </section>
  );
}

function SettingsView({
  policy,
  loading,
  networkName
}: {
  policy?: NetworkPolicy;
  loading: boolean;
  networkName: string;
}) {
  if (loading && !policy) {
    return <section className="panel">Loading network settings…</section>;
  }
  if (!policy) {
    return <section className="panel">Network settings unavailable.</section>;
  }
  const governanceEntries = Object.entries(policy.governance);
  const membershipEntries = policy.membership ? Object.entries(policy.membership) : [];
  return (
    <section className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <h2>{networkName}</h2>
          <span>registration fee {String(policy.registrationFee ?? "—")}</span>
        </div>
        <div className="kv-list">
          {governanceEntries.map(([key, value]) => (
            <KeyValue key={key} label={`governance.${key}`} value={String(value ?? "—")} />
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Validator-set Policy</h2>
          <span>{membershipEntries.length} keys</span>
        </div>
        {membershipEntries.length === 0 ? (
          <div className="empty">Policy config unavailable.</div>
        ) : (
          <div className="kv-list">
            {membershipEntries.map(([key, value]) => (
              <KeyValue key={key} label={key} value={String(value ?? "—")} />
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>Allowed Validator Vote Types</h2>
          <span>{policy.voteTypes.length}</span>
        </div>
        <div className="tag-list">
          {policy.voteTypes.map((type) => (
            <span key={type} className="tag">
              {type}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}

function eventKey(event: GovernanceHistoryEvent, index: number): string {
  return `${event.txHash ?? "event"}-${event.id ?? index}-${event.event}`;
}
