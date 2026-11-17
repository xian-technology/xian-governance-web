import { afterEach, expect, it, vi } from "vitest";

import { GovernanceService } from "../src/server/governanceService";
import { XianReadClient } from "../src/server/rpc";

const network = {
  id: "local",
  name: "Local",
  rpcUrl: "http://unused.invalid",
  governanceContract: "governance",
  membershipContract: "validators"
};

const dates: [unknown, string | null][] = [
  ["2026-12-01 13:39:14.585702", "2026-12-01T13:39:14.585702Z"],
  ["2026-12-01 13:39:14", "2026-12-01T13:39:14Z"],
  ["2026-12-01 13:39:14.000001", "2026-12-01T13:39:14.000001Z"],
  ["2026-12-01 13:39:14.000000", "2026-12-01T13:39:14.000000Z"],
  ["2026-12-01T13:39:14.585702", "2026-12-01T13:39:14.585702Z"],
  ["2026-12-01T13:39:14.585702Z", "2026-12-01T13:39:14.585702Z"],
  ["2026-12-01T13:39:14.585702+02:30", "2026-12-01T13:39:14.585702+02:30"],
  ["2026-12-01T13:39:14.585702-08:00", "2026-12-01T13:39:14.585702-08:00"],
  [{ __time__: [2026, 12, 1, 13, 39, 14, 585702] }, "2026-12-01T13:39:14.585702Z"],
  [{ __time__: [2026, 12, 1, 13, 39, 14, 0] }, "2026-12-01T13:39:14Z"],
  [null, null],
  [undefined, null],
  ["2026-12-01", "2026-12-01"],
  ["unknown-date", "unknown-date"]
];

afterEach(() => vi.restoreAllMocks());

it.each(dates)(
  "normalizes public validator contract time %j without losing precision",
  async (raw, expected) => {
    vi.spyOn(XianReadClient.prototype, "call").mockImplementation(async (_contract, method) => {
      if (method === "get_active_validators") {
        return [{
          account: "validator",
          next_unbond_unlock_at: raw,
          last_evidence_at: raw,
          registered_at: raw,
          pending_unbond_count: 1
        }];
      }
      return method === "get_validator_count" ? 0 : [];
    });
    const response = await new GovernanceService([network]).validators("local");
    expect(response.active[0]).toMatchObject({
      nextUnbondUnlockAt: expected,
      lastEvidenceAt: expected,
      registeredAt: expected
    });
    if (expected?.includes("T")) {
      expect(Date.parse(response.active[0]!.nextUnbondUnlockAt!)).toBe(Date.parse(expected));
    }
  }
);

it.each([
  ["2026-12-01T13:00:00Z", true],
  ["2026-12-01T14:00:00Z", false]
])("keeps UTC proposal expiry and voting eligibility at %s", async (now, eligible) => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(String(now)));
  vi.spyOn(XianReadClient.prototype, "getChainStatus").mockResolvedValue({
    chainId: "local",
    latestHeight: 1,
    catchingUp: false,
    nodeMoniker: "local"
  });
  vi.spyOn(XianReadClient.prototype, "scanKeySuffixes").mockResolvedValue(["validator"]);
  vi.spyOn(XianReadClient.prototype, "listEvents").mockRejectedValue(new Error("no BDS"));
  vi.spyOn(XianReadClient.prototype, "getState").mockImplementation(async (_contract, name) =>
    name === "proposal_vote_weights" ? 5 : null);
  vi.spyOn(XianReadClient.prototype, "call").mockImplementation(async (_contract, method) => {
    if (method === "get_proposal") {
      return {
        kind: "contract_call",
        status: "pending",
        created_at: "2026-12-01 12:00:00.000001",
        expires_at: "2026-12-01 13:39:14.585702"
      };
    }
    return [];
  });
  const response = await new GovernanceService([network]).proposal("local", "protocol", 1, "validator");
  expect(response?.viewer).toMatchObject({ eligible, hasVoted: false, weight: 5 });
  expect(response?.createdAt).toBe("2026-12-01T12:00:00.000001Z");
  expect(response?.expiresAt).toBe("2026-12-01T13:39:14.585702Z");
});
