// Typed schema + argument builder for `validators.propose_vote`.
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
  min?: number;
  max?: number;
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

export const RECOVERY_VOTE_TYPES = [
  "add_member",
  "remove_member",
  "jail_member",
  "unjail_member",
  "slash_member",
  "set_member_power",
  "change_registration_fee",
  "chi_cost_change",
  "change_types",
  "update_policy"
] as const;

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
      {
        name: "slash_bps",
        label: "Slash (bps)",
        kind: "bps",
        required: true,
        min: 1,
        max: 10000,
        hint: "1-10000"
      },
      { name: "reason", label: "Reason", kind: "text" },
      { name: "infraction_height", label: "Infraction height", kind: "int", min: 0 }
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
      { name: "power", label: "Power", kind: "int", required: true, min: 1, hint: "> 0" }
    ]
  },
  {
    value: "change_registration_fee",
    label: "Change registration fee",
    description: "Set the validator registration fee.",
    shape: "int",
    scalar: {
      name: "fee",
      label: "Registration fee",
      kind: "int",
      required: true,
      min: 1
    }
  },
  {
    value: "update_policy",
    label: "Update policy",
    description: "Change validator-set selection and bonding policy. Only filled fields are applied.",
    dangerous: true,
    shape: "fields",
    fields: [
      { name: "selection_mode", label: "Selection mode", kind: "enum", options: SELECTION_MODES },
      { name: "max_validators", label: "Max validators", kind: "int", min: 1 },
      { name: "power_mode", label: "Power mode", kind: "enum", options: POWER_MODES },
      { name: "rebalance_interval", label: "Rebalance interval", kind: "int", min: 1 },
      { name: "activation_delay_epochs", label: "Activation delay (epochs)", kind: "int", min: 0 },
      { name: "unbonding_period_days", label: "Unbonding period (days)", kind: "int", min: 0 },
      { name: "min_self_bond", label: "Min self bond", kind: "int", min: 0 },
      { name: "min_total_bond", label: "Min total bond", kind: "int", min: 0 },
      { name: "max_commission_bps", label: "Max commission (bps)", kind: "bps", min: 0, max: 10000 },
      { name: "max_active_set_churn", label: "Max active-set churn", kind: "int", min: 0 },
      { name: "min_bond_margin_bps", label: "Min bond margin (bps)", kind: "bps", min: 0, max: 10000 },
      { name: "manual_override_enabled", label: "Manual override enabled", kind: "bool" },
      { name: "slash_destination", label: "Slash destination", kind: "text" },
      { name: "duplicate_vote_slash_bps", label: "Duplicate-vote slash (bps)", kind: "bps", min: 0, max: 10000 },
      { name: "duplicate_vote_jail", label: "Duplicate-vote jail", kind: "bool" },
      {
        name: "light_client_attack_slash_bps",
        label: "Light-client-attack slash (bps)",
        kind: "bps",
        min: 0,
        max: 10000
      },
      { name: "light_client_attack_jail", label: "Light-client-attack jail", kind: "bool" }
    ]
  },
  {
    value: "reward_change",
    label: "Reward change",
    description:
      "Update the rewards split configuration (raw payload): " +
      "[validators, burn, foundation, developer], four ratios summing to 1.",
    shape: "raw",
    rawPlaceholder: "[0.30, 0.01, 0.01, 0.68]"
  },
  {
    value: "dao_payout",
    label: "DAO payout",
    description: "Transfer funds out of the DAO (raw payload).",
    dangerous: true,
    shape: "raw",
    rawPlaceholder: '{"contract_name": "currency", "amount": 1000, "to": "<account>"}'
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
    description:
      "Replace configurable vote types. Membership, safety, power, fee, chi-cost, vote-surface, and policy recovery types are immutable.",
    dangerous: true,
    shape: "raw",
    rawPlaceholder:
      '["add_member","remove_member","jail_member","unjail_member","slash_member","set_member_power","change_registration_fee","chi_cost_change","change_types","update_policy","topic_vote"]'
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
    const arg = parseJson(rawJson);
    validateRawArgument(spec.value, arg);
    return arg;
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
      validateRange(field, parsed);
      return parsed;
    }
    case "bps": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`${field.label} must be an integer`);
      }
      validateRange({ min: 0, max: 10000, ...field }, parsed);
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

function validateRange(field: FieldSpec, value: number): void {
  const { min, max } = field;
  if (min != null && value < min) {
    throw new Error(`${field.label} must be ${rangeLabel(min, max)}`);
  }
  if (max != null && value > max) {
    throw new Error(`${field.label} must be ${rangeLabel(min, max)}`);
  }
}

function rangeLabel(min?: number, max?: number): string {
  if (min != null && max != null) {
    return `an integer between ${min} and ${max}`;
  }
  if (min != null) {
    return `an integer >= ${min}`;
  }
  if (max != null) {
    return `an integer <= ${max}`;
  }
  return "an integer";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Argument JSON is not valid JSON");
  }
}

function validateRawArgument(type: string, arg: unknown): void {
  if (type === "reward_change") {
    if (!Array.isArray(arg) || arg.length !== 4) {
      throw new Error("Reward split must contain exactly four values");
    }
    if (arg.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
      throw new Error("Reward split values must be positive numbers");
    }
    const total = arg.reduce<number>((sum, value) => sum + Number(value), 0);
    if (Math.abs(total - 1) > 1e-12) {
      throw new Error("Reward split values must sum to 1");
    }
    return;
  }

  if (type === "dao_payout") {
    if (!isPlainRecord(arg)) {
      throw new Error("DAO payout must be an object");
    }
    const allowedKeys = new Set(["contract_name", "amount", "to"]);
    if (Object.keys(arg).some((key) => !allowedKeys.has(key))) {
      throw new Error("DAO payout contains an unexpected field");
    }
    requireNonEmptyString(arg.contract_name, "Contract name");
    requireNonEmptyString(arg.to, "DAO recipient");
    if (typeof arg.amount !== "number" || !Number.isFinite(arg.amount) || arg.amount <= 0) {
      throw new Error("DAO amount must be a positive number");
    }
    return;
  }

  if (type === "chi_cost_change") {
    if (typeof arg !== "number" || !Number.isFinite(arg) || arg <= 0) {
      throw new Error("Chi cost must be a positive number");
    }
    return;
  }

  if (type === "change_types") {
    if (!Array.isArray(arg) || arg.length === 0) {
      throw new Error("Vote types must be a non-empty list");
    }
    const values = arg.map((value) => {
      requireNonEmptyString(value, "Vote type");
      return value as string;
    });
    if (new Set(values).size !== values.length) {
      throw new Error("Vote types must not contain duplicates");
    }
    for (const recoveryType of RECOVERY_VOTE_TYPES) {
      if (!values.includes(recoveryType)) {
        throw new Error(`Vote types must retain recovery type ${recoveryType}`);
      }
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}
