import { useMemo, useState } from "react";

import { simulate } from "./api";
import { CopyButton } from "./components";
import {
  ChainMismatchError,
  resolveGovernanceContracts,
  resolveSigningChainId,
  type useXianWallet
} from "./wallet";
import {
  buildValidatorArg,
  getVoteTypeSpec,
  VOTE_TYPE_SPECS,
  type FieldSpec,
  type VoteTypeSpec
} from "./validatorVote";
import {
  computeStatePatchBundleHash,
  parseStatePatchBundle
} from "../shared/statePatchHash";
import type { GovernanceOverview } from "../shared/types";

type Template = "contract_call" | "state_patch" | "validator_vote";

interface CallIntent {
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
}

export function CreateProposal({
  networkId,
  overview,
  wallet,
  onSubmitted
}: {
  networkId: string;
  overview?: GovernanceOverview;
  wallet: ReturnType<typeof useXianWallet>;
  onSubmitted: () => void;
}) {
  const chainId = overview?.chain.chainId ?? wallet.chainId;
  const contracts = resolveGovernanceContracts(overview?.network);
  const [template, setTemplate] = useState<Template>("contract_call");

  // contract_call
  const [targetContract, setTargetContract] = useState("");
  const [targetFunction, setTargetFunction] = useState("");
  const [summary, setSummary] = useState("");
  const [kwargsJson, setKwargsJson] = useState("{}");

  // state_patch
  const [patchId, setPatchId] = useState("");
  const [bundleHash, setBundleHash] = useState("");
  const [activationHeight, setActivationHeight] = useState("");
  const [uri, setUri] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [bundleJson, setBundleJson] = useState("");

  // validator_vote
  const [voteType, setVoteType] = useState(VOTE_TYPE_SPECS[0]!.value);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [rawArgJson, setRawArgJson] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const voteSpec = useMemo(() => getVoteTypeSpec(voteType), [voteType]);

  const latestHeight = overview?.chain.latestHeight ?? null;
  const minDelay = emergency
    ? overview?.governance.emergencyPatchDelayBlocks ?? null
    : overview?.governance.minPatchDelayBlocks ?? null;
  const minActivationHeight =
    latestHeight != null && minDelay != null ? latestHeight + minDelay : null;

  function buildIntent(): CallIntent {
    if (template === "contract_call") {
      if (!targetContract.trim()) throw new Error("Target contract is required");
      if (!targetFunction.trim()) throw new Error("Target function is required");
      return {
        contract: contracts.governanceContract,
        function: "propose_contract_call",
        kwargs: {
          target_contract: targetContract.trim(),
          target_function: targetFunction.trim(),
          kwargs: parseJsonObject(kwargsJson),
          summary
        }
      };
    }
    if (template === "state_patch") {
      if (!patchId.trim()) throw new Error("Patch id is required");
      if (!bundleHash.trim()) throw new Error("Bundle hash is required");
      const height = Number(activationHeight);
      if (!Number.isInteger(height) || height <= 0) {
        throw new Error("Activation height must be a positive integer");
      }
      if (minActivationHeight != null && height < minActivationHeight) {
        throw new Error(
          `Activation height must be ≥ ${minActivationHeight} ` +
            `(current height ${latestHeight} + min delay ${minDelay})`,
        );
      }
      return {
        contract: contracts.governanceContract,
        function: "propose_state_patch",
        kwargs: {
          patch_id: patchId.trim(),
          bundle_hash: bundleHash.trim(),
          activation_height: height,
          summary,
          uri,
          emergency
        }
      };
    }
    if (!voteSpec) throw new Error("Unknown vote type");
    const arg = buildValidatorArg(voteSpec, fieldValues, rawArgJson);
    return {
      contract: contracts.membershipContract,
      function: "propose_vote",
      kwargs: { type_of_vote: voteSpec.value, arg }
    };
  }

  const preview = useMemo(() => {
    try {
      return { intent: buildIntent(), error: null as string | null };
    } catch (caught) {
      return {
        intent: null,
        error: caught instanceof Error ? caught.message : "invalid input"
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    template,
    targetContract,
    targetFunction,
    summary,
    kwargsJson,
    patchId,
    bundleHash,
    activationHeight,
    uri,
    emergency,
    voteType,
    fieldValues,
    rawArgJson,
    minActivationHeight,
    contracts.governanceContract,
    contracts.membershipContract
  ]);

  async function runSimulation() {
    setError(null);
    setSimResult(null);
    setStatus(null);
    try {
      const intent = buildIntent();
      setBusy(true);
      const result = await simulate(networkId, {
        sender: wallet.account ?? "governance-web",
        contract: intent.contract,
        function: intent.function,
        kwargs: intent.kwargs
      });
      setSimResult(JSON.stringify(result, null, 2));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "simulation failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setStatus(null);
    try {
      if (!wallet.wallet) {
        throw new Error("connect wallet first");
      }
      const signingChainId = resolveSigningChainId(wallet.chainId, overview?.chain.chainId);
      const intent = buildIntent();
      setBusy(true);
      setStatus("Waiting for wallet approval…");
      const result = await wallet.wallet.sendCall(
        { chainId: signingChainId, ...intent },
        { mode: "checktx", waitForTx: true },
      );
      setStatus(`Submitted ${result.txHash ?? "transaction"}`);
      onSubmitted();
    } catch (caught) {
      setStatus(null);
      setError(
        caught instanceof ChainMismatchError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "proposal submission failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function setField(name: string, value: string) {
    setFieldValues((current) => ({ ...current, [name]: value }));
  }

  function selectVoteType(value: string) {
    setVoteType(value);
    setFieldValues({});
    setRawArgJson(getVoteTypeSpec(value)?.rawPlaceholder ?? "");
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
          contract={contracts.governanceContract}
          fn="propose_contract_call"
          onClick={() => setTemplate("contract_call")}
        />
        <TemplateCard
          active={template === "state_patch"}
          title="Protocol State Patch"
          contract={contracts.governanceContract}
          fn="propose_state_patch"
          onClick={() => setTemplate("state_patch")}
        />
        <TemplateCard
          active={template === "validator_vote"}
          title="Validator Governance"
          contract={contracts.membershipContract}
          fn="propose_vote"
          onClick={() => setTemplate("validator_vote")}
        />
      </div>

      {template === "contract_call" ? (
        <div className="form-grid">
          <label>
            Target contract
            <input value={targetContract} onChange={(e) => setTargetContract(e.target.value)} />
          </label>
          <label>
            Target function
            <input value={targetFunction} onChange={(e) => setTargetFunction(e.target.value)} />
          </label>
          <label className="wide">
            Summary
            <input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="wide">
            Kwargs JSON
            <textarea value={kwargsJson} onChange={(e) => setKwargsJson(e.target.value)} />
          </label>
          <div className="effect-note wide">Executes immediately on approval.</div>
        </div>
      ) : null}

      {template === "state_patch" ? (
        <div className="form-grid">
          <label>
            Patch id
            <input value={patchId} onChange={(e) => setPatchId(e.target.value)} />
          </label>
          <label>
            Bundle hash
            <input value={bundleHash} onChange={(e) => setBundleHash(e.target.value)} />
          </label>
          <label>
            Activation height
            <input value={activationHeight} onChange={(e) => setActivationHeight(e.target.value)} />
          </label>
          <label>
            URI
            <input value={uri} onChange={(e) => setUri(e.target.value)} />
          </label>
          <label className="wide">
            Summary
            <input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => setEmergency(e.target.checked)}
            />
            Emergency threshold
          </label>
          {minActivationHeight != null ? (
            <div className="effect-note wide">
              Earliest activation height: {minActivationHeight} (height {latestHeight} + min delay{" "}
              {minDelay}).
            </div>
          ) : null}
          <label className="wide">
            Compute hash from bundle JSON (optional)
            <textarea
              className="json-input"
              placeholder="Paste a state patch bundle JSON to compute its hash"
              value={bundleJson}
              onChange={(e) => setBundleJson(e.target.value)}
            />
          </label>
          <div className="action-row wide">
            <button
              type="button"
              className="ghost"
              disabled={!bundleJson.trim()}
              onClick={() => {
                try {
                  const bundle = parseStatePatchBundle(JSON.parse(bundleJson));
                  const hash = computeStatePatchBundleHash(bundle);
                  setBundleHash(hash);
                  setPatchId((current) => current || bundle.patch_id);
                  setActivationHeight((current) => current || String(bundle.activation_height));
                  setError(null);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "invalid bundle");
                }
              }}
            >
              Compute &amp; use bundle hash
            </button>
          </div>
        </div>
      ) : null}

      {template === "validator_vote" ? (
        <div className="form-grid">
          <label className="wide">
            Vote type
            <select value={voteType} onChange={(e) => selectVoteType(e.target.value)}>
              {VOTE_TYPE_SPECS.map((spec) => (
                <option key={spec.value} value={spec.value}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>
          {voteSpec ? <ValidatorVoteFields spec={voteSpec} /> : null}
          {voteSpec?.shape === "account" || voteSpec?.shape === "int" ? (
            <ScalarField spec={voteSpec.scalar!} value={fieldValues[voteSpec.scalar!.name] ?? ""} onChange={setField} />
          ) : null}
          {voteSpec?.shape === "fields"
            ? voteSpec.fields!.map((field) => (
                <TypedField
                  key={field.name}
                  field={field}
                  value={fieldValues[field.name] ?? ""}
                  onChange={setField}
                />
              ))
            : null}
          {voteSpec?.shape === "raw" ? (
            <label className="wide">
              Argument JSON
              <textarea
                value={rawArgJson}
                placeholder={voteSpec.rawPlaceholder}
                onChange={(e) => setRawArgJson(e.target.value)}
              />
            </label>
          ) : null}
          {voteSpec?.dangerous ? (
            <div className="effect-note danger-note wide">
              Changes the validator set, policy, or treasury on approval.
            </div>
          ) : null}
        </div>
      ) : null}

      <h3>Exact call to sign</h3>
      {preview.error ? (
        <div className="notice error">{preview.error}</div>
      ) : (
        <pre>{JSON.stringify(preview.intent, null, 2)}</pre>
      )}

      <div className="action-row">
        <button type="button" className="ghost" onClick={runSimulation} disabled={busy || !preview.intent}>
          Simulate
        </button>
        <button type="button" className="primary" onClick={submit} disabled={busy || !preview.intent}>
          Submit with wallet
        </button>
        {preview.intent ? (
          <CopyButton value={JSON.stringify(preview.intent)} label="Copy call" />
        ) : null}
      </div>

      {simResult ? (
        <div className="notice success">
          <div>
            <strong>Simulation ok</strong>
            <pre>{simResult}</pre>
          </div>
        </div>
      ) : null}
      {status ? <div className="notice success">{status}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      <div className="notice">
        Proposal creation signs through the injected wallet. The backend never submits
        transactions or handles private keys.
      </div>
    </section>
  );
}

function ValidatorVoteFields({ spec }: { spec: VoteTypeSpec }) {
  return <div className="effect-note wide">{spec.description}</div>;
}

function ScalarField({
  spec,
  value,
  onChange
}: {
  spec: FieldSpec;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  return <TypedField field={spec} value={value} onChange={onChange} />;
}

function TypedField({
  field,
  value,
  onChange
}: {
  field: FieldSpec;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  if (field.kind === "bool") {
    return (
      <label>
        {field.label}
        <select value={value} onChange={(e) => onChange(field.name, e.target.value)}>
          <option value="">(unset)</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }
  if (field.kind === "enum") {
    return (
      <label>
        {field.label}
        <select value={value} onChange={(e) => onChange(field.name, e.target.value)}>
          <option value="">(unset)</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      {field.label}
      {field.required ? <span className="req"> *</span> : null}
      <input
        value={value}
        placeholder={field.hint}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    </label>
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

function parseJsonObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Kwargs must be valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Kwargs must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
