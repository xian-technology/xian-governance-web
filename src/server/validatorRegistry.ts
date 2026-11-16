import { exactInteger, isRecord } from "../shared/format.js";
import type { XianReadClient } from "./rpc.js";

const VALIDATOR_PAGE_SIZE = 25;

function registryInteger(value: unknown, field: string): number {
  const integer = exactInteger(value);
  if (typeof integer !== "number" || integer < 0) {
    throw new Error(`invalid validator registry ${field}`);
  }
  return integer;
}

function registryRecord(value: unknown, seen: Set<string>): Record<string, unknown> {
  if (!isRecord(value) || typeof value.account !== "string" || !value.account || seen.has(value.account)) {
    throw new Error("invalid or duplicate validator registry account");
  }
  seen.add(value.account);
  return value;
}

function registryPage(value: unknown, cursor: number, seen: Set<string>) {
  if (!isRecord(value) || !Array.isArray(value.validators) ||
      value.validators.length === 0 || value.validators.length > VALIDATOR_PAGE_SIZE) {
    throw new Error("invalid validator registry page");
  }
  const records = value.validators.map((record) => registryRecord(record, seen));
  const next = value.next_cursor === null ? null : registryInteger(value.next_cursor, "cursor");
  if (next !== null && (records.length !== VALIDATOR_PAGE_SIZE || next !== cursor + records.length)) {
    throw new Error("inconsistent validator registry cursor");
  }
  return { records, next };
}

/** Read the registry prefix captured at the initial count. Registration only appends. */
export async function readValidatorRegistry(client: XianReadClient, contract: string) {
  const total = registryInteger(await client.call(contract, "get_validator_count"), "count");
  const records: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  while (cursor < total) {
    const page = registryPage(await client.call(contract, "get_validators_page", {
      cursor, limit: VALIDATOR_PAGE_SIZE,
    }), cursor, seen);
    if (page.next === null && cursor + page.records.length < total) {
      throw new Error("incomplete validator registry page");
    }
    records.push(...page.records.slice(0, total - cursor));
    cursor += page.records.length;
  }
  return records;
}
