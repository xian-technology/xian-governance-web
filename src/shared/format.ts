export function shortAddress(value: string | null | undefined, size = 6): string {
  if (!value) {
    return "unknown";
  }
  if (value.length <= size * 2 + 3) {
    return value;
  }
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function titleFromPayload(kind: string, type: string, payload: unknown): string {
  if (kind === "state_patch" && isRecord(payload)) {
    return `State patch ${String(payload.patch_id ?? "")}`.trim();
  }
  if (kind === "contract_call" && isRecord(payload)) {
    return `${String(payload.target_contract ?? "contract")}.${String(
      payload.target_function ?? "call",
    )}`;
  }
  if (kind === "validator_vote" || isValidatorVoteType(type)) {
    return validatorVoteTitle(type, payload);
  }
  if (type) {
    return type.replaceAll("_", " ");
  }
  return kind.replaceAll("_", " ");
}

const VALIDATOR_VOTE_TYPES = new Set([
  "add_member",
  "remove_member",
  "jail_member",
  "unjail_member",
  "slash_member",
  "set_member_power",
  "change_registration_fee",
  "reward_change",
  "dao_payout",
  "chi_cost_change",
  "change_types",
  "update_policy",
  "topic_vote"
]);

function isValidatorVoteType(type: string): boolean {
  return VALIDATOR_VOTE_TYPES.has(type);
}

/**
 * Build a human-scannable title for a `validators` vote from its type and
 * raw `arg`. `validators` proposals carry no on-chain summary, so without
 * this every `slash_member` / `update_policy` row would look identical.
 */
function validatorVoteTitle(type: string, arg: unknown): string {
  switch (type) {
    case "add_member":
      return `Add validator ${shortAddress(asAccount(arg), 6)}`;
    case "remove_member":
      return `Remove validator ${shortAddress(asAccount(arg), 6)}`;
    case "unjail_member":
      return `Unjail validator ${shortAddress(asAccount(arg), 6)}`;
    case "jail_member":
      return `Jail validator ${shortAddress(argMember(arg), 6)}`;
    case "slash_member": {
      const bps = isRecord(arg) ? asNumber(arg.slash_bps) : 0;
      return `Slash validator ${shortAddress(argMember(arg), 6)} (${bps} bps)`;
    }
    case "set_member_power": {
      const power = isRecord(arg) ? asNumber(arg.power) : 0;
      return `Set power of ${shortAddress(argMember(arg), 6)} to ${power}`;
    }
    case "change_registration_fee":
      return `Change registration fee to ${asScalar(arg)}`;
    case "reward_change":
      return "Change reward split";
    case "chi_cost_change":
      return `Change chi cost to ${asScalar(arg)}`;
    case "dao_payout":
      return "DAO payout";
    case "change_types":
      return "Change validator vote types";
    case "update_policy":
      return `Update policy${policySummary(arg)}`;
    case "topic_vote": {
      const topic = isRecord(arg) ? asString(arg.topic) ?? "" : asString(arg) ?? "";
      return topic ? `Topic: ${topic}` : "Topic vote";
    }
    default:
      return type.replaceAll("_", " ");
  }
}

function policySummary(arg: unknown): string {
  if (!isRecord(arg)) {
    return "";
  }
  const parts = Object.keys(arg)
    .slice(0, 3)
    .map((key) => `${key}=${asScalar(arg[key])}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function argMember(arg: unknown): string | null {
  if (isRecord(arg)) {
    return asString(arg.member);
  }
  return null;
}

function asAccount(arg: unknown): string | null {
  if (typeof arg === "string") {
    return arg;
  }
  return argMember(arg);
}

function asScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return Array.isArray(value) ? `[${value.length}]` : "{…}";
  }
  return String(value);
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;

/**
 * Extract safe http(s) URLs embedded in free text (e.g. proposal summaries),
 * so the UI can surface discussion / PR links without an off-chain store.
 */
export function extractUrls(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  const matches = value.match(URL_PATTERN);
  if (!matches) {
    return [];
  }
  const seen = new Set<string>();
  for (const match of matches) {
    const trimmed = match.replace(/[.,;]+$/, "");
    try {
      const url = new URL(trimmed);
      if (url.protocol === "http:" || url.protocol === "https:") {
        seen.add(url.toString());
      }
    } catch {
      // ignore malformed URLs
    }
  }
  return [...seen];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}
