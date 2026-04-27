import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { isRecord } from "./format.js";

export interface StatePatchChange {
  key: string;
  value: unknown;
  comment?: string;
}

export interface StatePatchBundle {
  version: number;
  patch_id: string;
  activation_height: number;
  governance_contract?: string;
  chain_id?: string;
  summary?: string;
  uri?: string;
  changes: StatePatchChange[];
}

export function canonicalStatePatchPayload(bundle: StatePatchBundle): Record<string, unknown> {
  const canonicalChanges = [...bundle.changes]
    .map((change) => ({
      comment: change.comment ?? "",
      key: change.key,
      value: change.value
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    activation_height: bundle.activation_height,
    chain_id: bundle.chain_id,
    changes: canonicalChanges,
    governance_contract: bundle.governance_contract ?? "governance",
    patch_id: bundle.patch_id,
    summary: bundle.summary ?? "",
    uri: bundle.uri ?? "",
    version: bundle.version
  };
}

export function computeStatePatchBundleHash(bundle: StatePatchBundle): string {
  const canonical = canonicalStatePatchPayload(bundle);
  const serialized = JSON.stringify(sortKeysDeep(canonical));
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

export function parseStatePatchBundle(value: unknown): StatePatchBundle {
  if (!isRecord(value)) {
    throw new Error("bundle must be a JSON object");
  }
  if (value.version !== 1) {
    throw new Error("bundle version must be 1");
  }
  if (typeof value.patch_id !== "string" || value.patch_id.length === 0) {
    throw new Error("patch_id is required");
  }
  if (typeof value.activation_height !== "number") {
    throw new Error("activation_height must be a number");
  }
  if (!Array.isArray(value.changes) || value.changes.length === 0) {
    throw new Error("changes must be a non-empty array");
  }
  const changes = value.changes.map((change) => {
    if (!isRecord(change) || typeof change.key !== "string") {
      throw new Error("each change requires a key");
    }
    return {
      key: change.key,
      value: change.value,
      comment: typeof change.comment === "string" ? change.comment : undefined
    };
  });
  return {
    version: value.version,
    patch_id: value.patch_id,
    activation_height: value.activation_height,
    governance_contract:
      typeof value.governance_contract === "string"
        ? value.governance_contract
        : undefined,
    chain_id: typeof value.chain_id === "string" ? value.chain_id : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    uri: typeof value.uri === "string" ? value.uri : undefined,
    changes
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}
