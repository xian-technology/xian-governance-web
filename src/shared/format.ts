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
  if (type) {
    return type.replaceAll("_", " ");
  }
  return kind.replaceAll("_", " ");
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
