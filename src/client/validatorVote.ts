// Typed schema + argument builder for `masternodes.propose_vote`.
//
// Each validator-governance vote type expects a differently-shaped `arg`.
// Encoding that shape here lets the create wizard render typed inputs and
// validate locally before a wallet signature, instead of forcing operators to
// hand-write raw JSON that only fails once it reverts on chain.

export type FieldKind = "account" | "int" | "bps" | "text" | "bool" | "enum";

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  hint?: string;
  options?: string[];
}

export type VoteArgShape = "account" | "int" | "fields" | "raw";

export interface VoteTypeSpec {
  value: string;
  label: string;
  description: string;
  /** Whether finalization changes the validator set / policy (UI danger cue). */
  dangerous?: boolean;
  shape: VoteArgShape;
  /** For `account` / `int` shapes: the single scalar field. */
  scalar?: FieldSpec;
  /** For `fields` shape: typed object members. */
  fields?: FieldSpec[];
  /** For `raw` shape: placeholder JSON shown in the escape-hatch editor. */
  rawPlaceholder?: string;
}

const SELECTION_MODES = ["manual", "auto_top_n", "hybrid"];
const POWER_MODES = ["equal", "requested", "stake_weighted"];

export const VOTE_TYPE_SPECS: VoteTypeSpec[] = [
  {
    value: "topic_vote",
    label: "Topic vote",
    description: "Signal-only vote on a free-form topic. No chain state changes.",
    shape: "fields",
    fields: [{ name: "topic", label: "Topic", kind: "text", required: true }]
  },
  {
    value: "add_member",
    label: "Add validator",
    description: "Promote a pending/approved candidate into the active set.",
    dangerous: true,
    shape: "account",
    scalar: {
      name: "account",
      label: "Validator account",
      kind: "account",
      required: true,
      hint: "Account with a pending registration."
    }
  },
  {
    value: "remove_member",
    label: "Remove validator",
    description: "Remove an active validator and unbond its stake.",
    dangerous: true,
    shape: "account",
    scalar: {
      name: "account",
      label: "Validator account",
      kind: "account",
      required: true,
      hint: "Must currently be active."
    }
  },
  {
    value: "jail_member",
    label: "Jail validator",
    description: "Jail a validator, removing it from the active set.",
    dangerous: true,
    shape: "fields",
    fields: [
      { name: "member", label: "Validator account", kind: "account", required: true },
      { name: "reason", label: "Reason", kind: "text" }
    ]
  },
  {
    value: "unjail_member",
    label: "Unjail validator",
    description: "Clear a validator's jailed flag.",
    shape: "account",
    scalar: { name: "account", label: "Validator account", kind: "account", required: true }
  },
  {
    value: "slash_member",
    label: "Slash validator",
    description: "Slash a validator's bonded stake by a basis-point fraction.",
    dangerous: true,
    shape: "fields",
    fields: [
      { name: "member", label: "Validator account", kind: "account", required: true },
      { name: "slash_bps", label: "Slash (bps)", kind: "bps", required: true, hint: "1–10000" },
      { name: "reason", label: "Reason", kind: "text" },
      { name: "infraction_height", label: "Infraction height", kind: "int" }
    ]
  },
  {
    value: "set_member_power",
    label: "Set validator power",
    description: "Override an active validator's voting power.",
    dangerous: true,
    shape: "fields",
    fields: [
      { name: "member", label: "Validator account", kind: "account", required: true },
      { name: "power", label: "Power", kind: "int", required: true, hint: "> 0" }
    ]
  },
  {
    value: "change_registration_fee",
    label: "Change registration fee",
    description: "Set the validator registration fee.",
    shape: "int",
    scalar: { name: "fee", label: "Registration fee", kind: "int", required: true }
  },
  {
    value: "update_policy",
    label: "Update policy",
    description: "Change validator-set selection and bonding policy. Only filled fields are applied.",
    dangerous: true,
    shape: "fields",
    fields: [
      { name: "selection_mode", label: "Selection mode", kind: "enum", options: SELECTION_MODES },
      { name: "max_validators", label: "Max validators", kind: "int" },
      { name: "power_mode", label: "Power mode", kind: "enum", options: POWER_MODES },
      { name: "rebalance_interval", label: "Rebalance interval", kind: "int" },
      { name: "activation_delay_epochs", label: "Activation delay (epochs)", kind: "int" },
      { name: "unbonding_period_days", label: "Unbonding period (days)", kind: "int" },
      { name: "min_self_bond", label: "Min self bond", kind: "int" },
      { name: "min_total_bond", label: "Min total bond", kind: "int" },
      { name: "max_commission_bps", label: "Max commission (bps)", kind: "bps" },
      { name: "max_active_set_churn", label: "Max active-set churn", kind: "int" },
      { name: "min_bond_margin_bps", label: "Min bond margin (bps)", kind: "bps" },
      { name: "manual_override_enabled", label: "Manual override enabled", kind: "bool" },
      { name: "slash_destination", label: "Slash destination", kind: "text" },
      { name: "duplicate_vote_slash_bps", label: "Duplicate-vote slash (bps)", kind: "bps" },
      { name: "duplicate_vote_jail", label: "Duplicate-vote jail", kind: "bool" },
      { name: "light_client_attack_slash_bps", label: "Light-client-attack slash (bps)", kind: "bps" },
      { name: "light_client_attack_jail", label: "Light-client-attack jail", kind: "bool" }
    ]
  },
  {
    value: "reward_change",
    label: "Reward change",
    description: "Update the rewards split configuration (raw payload).",
    shape: "raw",
    rawPlaceholder: '{"masternodes": 0.5, "foundation": 0.5}'
  },
  {
    value: "dao_payout",
    label: "DAO payout",
    description: "Transfer funds out of the DAO (raw payload).",
    dangerous: true,
    shape: "raw",
    rawPlaceholder: '{"amount": 1000, "to": "<account>"}'
  },
  {
    value: "chi_cost_change",
    label: "Chi cost change",
    description: "Update the chi (gas) cost (raw payload).",
    shape: "raw",
    rawPlaceholder: "0.0001"
  },
  {
    value: "change_types",
    label: "Change vote types",
    description: "Replace the list of allowed validator vote types (raw payload).",
    dangerous: true,
    shape: "raw",
    rawPlaceholder: '["add_member", "remove_member", "topic_vote"]'
  }
];

export function getVoteTypeSpec(value: string): VoteTypeSpec | undefined {
  return VOTE_TYPE_SPECS.find((spec) => spec.value === value);
}

/**
 * Build and validate the `arg` for a validator vote from typed field values.
 * Throws an Error with a human-readable message on validation failure.
 */
export function buildValidatorArg(
  spec: VoteTypeSpec,
  values: Record<string, string>,
  rawJson: string,
): unknown {
  if (spec.shape === "raw") {
    return parseJson(rawJson);
  }
  if (spec.shape === "account") {
    return coerceField(spec.scalar!, values[spec.scalar!.name] ?? "");
  }
  if (spec.shape === "int") {
    return coerceField(spec.scalar!, values[spec.scalar!.name] ?? "");
  }
  const arg: Record<string, unknown> = {};
  for (const field of spec.fields ?? []) {
    const raw = (values[field.name] ?? "").trim();
    if (raw === "") {
      if (field.required) {
        throw new Error(`${field.label} is required`);
      }
      continue;
    }
    arg[field.name] = coerceField(field, raw);
  }
  if (Object.keys(arg).length === 0) {
    throw new Error("Provide at least one field");
  }
  return arg;
}

function coerceField(field: FieldSpec, rawValue: string): unknown {
  const value = rawValue.trim();
  if (value === "" && field.required) {
    throw new Error(`${field.label} is required`);
  }
  switch (field.kind) {
    case "int": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`${field.label} must be an integer`);
      }
      return parsed;
    }
    case "bps": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
        throw new Error(`${field.label} must be an integer between 0 and 10000`);
      }
      return parsed;
    }
    case "bool":
      if (value !== "true" && value !== "false") {
        throw new Error(`${field.label} must be true or false`);
      }
      return value === "true";
    case "enum":
      if (field.options && !field.options.includes(value)) {
        throw new Error(`${field.label} must be one of ${field.options.join(", ")}`);
      }
      return value;
    case "account":
      if (value.length < 3) {
        throw new Error(`${field.label} looks too short`);
      }
      return value;
    case "text":
    default:
      return value;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Argument JSON is not valid JSON");
  }
}
