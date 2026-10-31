import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { JsonNumber, parseLosslessJson } from "./losslessJson.js";

import { isRecord } from "./format.js";

export interface StatePatchChange {
  key: string;
  value: unknown;
  comment?: unknown;
}

export interface StatePatchBundle {
  version: number | JsonNumber;
  patch_id: string;
  activation_height: number | JsonNumber;
  governance_contract?: string;
  chain_id?: string | null;
  summary?: unknown;
  uri?: unknown;
  changes: StatePatchChange[];
}

export function canonicalStatePatchPayload(bundle: StatePatchBundle): Record<string, unknown> {
  const canonicalChanges = [...bundle.changes]
    .map((change) => ({
      comment: change.comment === undefined ? "" : change.comment,
      key: change.key,
      value: change.value
    }))
    .sort((left, right) => compareCodePoints(left.key, right.key));

  // `chain_id` must be emitted as an explicit `null` when absent so the
  // serialized payload matches the chain-side canonical form
  // (`json.dumps(..., sort_keys=True)` keeps the key with a `null` value).
  // Using `undefined` here would drop the key from `JSON.stringify` and
  // produce a different hash for any bundle that omits `chain_id`.
  return {
    activation_height: bundle.activation_height,
    chain_id: bundle.chain_id ?? null,
    changes: canonicalChanges,
    governance_contract: bundle.governance_contract ?? "governance",
    patch_id: bundle.patch_id,
    summary: bundle.summary === undefined ? "" : bundle.summary,
    uri: bundle.uri === undefined ? "" : bundle.uri,
    version: bundle.version
  };
}

export function computeStatePatchBundleHash(bundle: StatePatchBundle): string {
  const canonical = canonicalStatePatchPayload(bundle);
  const serialized = canonicalJson(canonical);
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

export function parseStatePatchBundle(input: unknown): StatePatchBundle {
  const value = typeof input === "string" ? parseLosslessJson(input) : input;
  if (!isRecord(value)) throw new Error("bundle must be a JSON object");
  const version = bundleVersion(value.version);
  if (typeof value.patch_id !== "string" || !/^[a-z0-9][a-z0-9_-]{2,127}$/.test(value.patch_id)) {
    throw new Error("patch_id is required and must be a valid patch identifier");
  }
  const activation_height = positiveInteger(value.activation_height);
  const governance_contract = requiredText(value.governance_contract === undefined ? "governance" : value.governance_contract, "governance_contract");
  const chain_id = value.chain_id == null ? null : requiredText(value.chain_id, "chain_id");
  if (!Array.isArray(value.changes) || !value.changes.length) throw new Error("changes must be a non-empty array");
  const seen = new Set<string>();
  const changes = value.changes.map(change => parseChange(change, seen));
  return {version, patch_id: value.patch_id, activation_height,
    governance_contract, chain_id, summary: value.summary, uri: value.uri, changes};
}

function bundleVersion(value: unknown): number | JsonNumber {
  if (value === 1 || value instanceof JsonNumber && Number(value.source) === 1) return value;
  throw new Error("bundle version must be 1");
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`invalid ${name}`);
  return value;
}

function positiveInteger(value: unknown): number | JsonNumber {
  if (value instanceof JsonNumber && value.integer && BigInt(value.source) > 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  throw new Error("activation_height must be a positive integer; paste original JSON for large integers");
}

function parseChange(change: unknown, seen: Set<string>): StatePatchChange {
  if (!isRecord(change) || typeof change.key !== "string" || !change.key) throw new Error("each change requires a key");
  if (seen.has(change.key)) throw new Error(`duplicate change key: ${change.key}`);
  if (change.key.endsWith(".__code__") || change.key.endsWith(".__xian_ir_v1__")) {
    throw new Error("patch contract source instead of generated artifacts");
  }
  seen.add(change.key);
  return {key: change.key, value: change.value ?? null, comment: change.comment};
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function canonicalJson(value: unknown): string {
  if (value instanceof JsonNumber) return value.canonical();
  if (typeof value === "number" && (!Number.isSafeInteger(value) || Object.is(value, -0))) {
    throw new Error("paste original bundle JSON to preserve numeric types and precision");
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    // Emit pairs directly: JS object enumeration reorders integer-index keys.
    const pairs = Object.keys(value).sort(compareCodePoints).map(
      (key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`,
    );
    return `{${pairs.join(",")}}`;
  }
  // Python's node-side json.dumps uses ensure_ascii=True, including surrogate
  // pairs for non-BMP characters. Replace UTF-16 units, not Unicode code points.
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
