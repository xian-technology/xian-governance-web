import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";

import { createApiApp } from "../src/server/app";
import { GovernanceService } from "../src/server/governanceService";
import { XianReadClient } from "../src/server/rpc";

const network = {
  id: "local", name: "Local", rpcUrl: "http://localhost",
  governanceContract: "governance", membershipContract: "validators"
};
const record = (index: number) => ({ account: `node-${index}`, status: "left" });

function registry(
  count: unknown,
  page: (cursor: number) => unknown | Promise<unknown>,
  active = [record(0), record(1)],
) {
  const call = vi.spyOn(XianReadClient.prototype, "call").mockImplementation(
    async (_contract, method, kwargs = {}) => {
      if (method === "get_active_validators") return active;
      if (method === "get_pending_candidates") return [];
      if (method === "get_validator_count") return count;
      if (method === "get_validators_page") return page(Number(kwargs.cursor ?? 0));
      throw new Error("shared contract value traversal limit exceeded");
    },
  );
  return { service: new GovernanceService([network]), call };
}

afterEach(() => vi.restoreAllMocks());

it("keeps the complete inactive registry when the legacy whole view exceeds its VM limit", async () => {
  const records = Array.from({ length: 2002 }, (_, index) => record(index));
  const { service, call } = registry(records.length, (cursor) => ({
    validators: records.slice(cursor, cursor + 25),
    next_cursor: cursor + 25 < records.length ? cursor + 25 : null,
  }));

  const result = await service.validators("local");

  expect(result.active.map((validator) => validator.account)).toEqual(["node-0", "node-1"]);
  expect(result.inactive.map((validator) => validator.account)).toEqual(
    records.slice(2).map((validator) => validator.account),
  );
  expect(call.mock.calls.some((args) => args[1] === "get_validators")).toBe(false);
});

it.each([0, 0n, "0"])("returns an empty registry without reading a page for count %s", async (count) => {
  const page = vi.fn();
  const { service } = registry(count, page, []);
  expect((await service.validators("local")).inactive).toEqual([]);
  expect(page).not.toHaveBeenCalled();
});

it.each([null, -1, 1.5, NaN, {}, "invalid", Number.MAX_SAFE_INTEGER + 1, 9007199254740992n])(
  "rejects an invalid registry count %s instead of reporting no inactive validators", async (count) => {
    const { service } = registry(count, () => ({ validators: [], next_cursor: null }));
    await expect(service.validators("local")).rejects.toThrow("validator registry count");
  },
);

it.each([
  null,
  [],
  {},
  { validators: "invalid", next_cursor: null },
  { validators: [record(2)] },
  { validators: [null], next_cursor: null },
  { validators: [{}], next_cursor: null },
  { validators: [{ account: "" }], next_cursor: null },
])("rejects a malformed validator page %s", async (page) => {
  const { service } = registry(1, () => page);
  await expect(service.validators("local")).rejects.toThrow("validator registry");
});

it.each([0, -1, 1.5, 24, 26, Number.MAX_SAFE_INTEGER + 1, "invalid"])(
  "rejects a non-progressing or inconsistent cursor %s", async (next) => {
    const { service } = registry(26, () => ({
      validators: Array.from({ length: 25 }, (_, index) => record(index)),
      next_cursor: next,
    }));
    await expect(service.validators("local")).rejects.toThrow("validator registry");
  },
);

it.each([0, 24, 26])("validates cursor %s even on the captured prefix's final page", async (next) => {
  const { service } = registry(25, () => ({
    validators: Array.from({ length: 25 }, (_, index) => record(index)), next_cursor: next,
  }));
  await expect(service.validators("local")).rejects.toThrow("validator registry cursor");
});

it.each([
  { validators: [], next_cursor: null },
  { validators: [record(0)], next_cursor: 1 },
  { validators: Array.from({ length: 25 }, (_, index) => record(index)), next_cursor: null },
  { validators: Array.from({ length: 26 }, (_, index) => record(index)), next_cursor: null },
])("rejects an incomplete or oversized registry page %s", async (page) => {
  const { service } = registry(26, () => page);
  await expect(service.validators("local")).rejects.toThrow("validator registry");
});

it("rejects duplicate validator accounts within a page", async () => {
  const { service } = registry(2, () => ({
    validators: [record(2), record(2)], next_cursor: null,
  }));
  await expect(service.validators("local")).rejects.toThrow("validator registry");
});

it("rejects duplicate validator accounts across pages", async () => {
  const { service } = registry(26, (cursor) => cursor === 0
    ? { validators: Array.from({ length: 25 }, (_, index) => record(index)), next_cursor: 25 }
    : { validators: [record(0)], next_cursor: null });
  await expect(service.validators("local")).rejects.toThrow("validator registry");
});

it("propagates a later page failure without publishing a successful partial registry", async () => {
  const { service } = registry(26, (cursor) => {
    if (cursor !== 0) throw new Error("registry connection failed");
    return { validators: Array.from({ length: 25 }, (_, index) => record(index)), next_cursor: 25 };
  });
  await expect(service.validators("local")).rejects.toThrow("registry connection failed");
});

it("returns a failed API response when a complete registry cannot be read", async () => {
  const { service } = registry(1, () => { throw new Error("registry connection failed"); });
  const response = await request(createApiApp(service, { exposeErrors: false }))
    .get("/api/networks/local/validators");
  expect(response.status).toBe(502);
  expect(response.body).toEqual({ error: "upstream chain request failed" });
});

it("accepts exact bigint count and cursor values returned by the V2 client", async () => {
  const { service } = registry(26n, (cursor) => cursor === 0
    ? { validators: Array.from({ length: 25 }, (_, index) => record(index)), next_cursor: 25n }
    : { validators: [record(25)], next_cursor: null });
  expect((await service.validators("local")).inactive).toHaveLength(24);
});

it.each([null, 50])("returns the captured prefix when registration appends during the scan (%s)", async (next) => {
  const { service } = registry(27, (cursor) => ({
    validators: Array.from({ length: 25 }, (_, index) => record(cursor + index)),
    next_cursor: cursor === 0 ? 25 : next,
  }));
  const result = await service.validators("local");
  expect(result.inactive.map((validator) => validator.account)).toEqual(
    Array.from({ length: 25 }, (_, index) => `node-${index + 2}`),
  );
});
