import { afterEach, describe, expect, it, vi } from "vitest";

import { XianReadClient } from "../src/server/rpc";
import { GovernanceService, normalizeValidator } from "../src/server/governanceService";

describe("validator read model", () => {
  it("normalizes lifecycle, slash, evidence, selection, and unbond fields", () => {
    const validator = normalizeValidator(
      {
        account: "node1",
        status: "leaving",
        active: true,
        jailed: true,
        jail_reason: "duplicate_vote",
        last_jailed_at: { __time__: [2026, 1, 2, 3, 4, 5] },
        total_slashed: "125.5",
        last_slashed_at: "2026-01-02T03:04:05Z",
        last_evidence_id: "evidence-1",
        last_evidence_type: "DUPLICATE_VOTE",
        last_evidence_height: 42,
        pending_unbond_count: 2,
        pending_unbond_total: "500",
        next_unbond_unlock_at: { __time__: [2026, 1, 9, 3, 4, 5] },
        pending_leave_at: { __time__: [2026, 1, 8, 3, 4, 5] },
        last_rebalance_epoch: 12,
        eligible_at_epoch: 13,
        selection_eligible_at_last_rebalance: false,
        registered_at: { __time__: [2025, 12, 1, 0, 0, 0] },
        power: 10
      },
      false,
    );

    expect(validator).toMatchObject({
      account: "node1",
      status: "leaving",
      active: true,
      jailed: true,
      jailReason: "duplicate_vote",
      lastJailedAt: "2026-01-02T03:04:05Z",
      totalSlashed: "125.5",
      lastEvidenceId: "evidence-1",
      lastEvidenceType: "DUPLICATE_VOTE",
      lastEvidenceHeight: 42,
      pendingUnbondCount: 2,
      pendingUnbondTotal: "500",
      nextUnbondUnlockAt: "2026-01-09T03:04:05Z",
      pendingLeaveAt: "2026-01-08T03:04:05Z",
      lastRebalanceEpoch: 12,
      eligibleAtEpoch: 13,
      selectionEligibleAtLastRebalance: false,
      registeredAt: "2025-12-01T00:00:00Z"
    });
  });
});

it("keeps exact validator powers, bonds and slashed amounts through the API model", () => {
  const units = 9007199254740993n;
  const fraction = "0.000000000000000000000000000001";
  const record = normalizeValidator({
    account: "validator", power: units, self_bond: units, registration_bond: fraction,
    pending_unbond_total: units + 1n, total_slashed: fraction
  }, true);
  expect(JSON.parse(JSON.stringify(record))).toMatchObject({
    power: String(units), selfBond: String(units), registrationBond: fraction,
    pendingUnbondTotal: String(units + 1n), totalSlashed: fraction
  });
});


afterEach(() => { vi.restoreAllMocks(); });

it("returns the full consensus timestamp and sums validator weights as integers", async () => {
  const network = { id: "local", name: "Local", rpcUrl: "http://localhost",
    governanceContract: "governance", membershipContract: "validators" };
  const service = new GovernanceService([network]);
  const nanos = 1787956394123456789n;
  vi.spyOn(XianReadClient.prototype, "getState").mockImplementation(async (_contract, name) =>
    name === "proposal_count" ? 1 : 0);
  vi.spyOn(XianReadClient.prototype, "getChainStatus").mockResolvedValue({
    chainId: "local", latestHeight: 1, catchingUp: false, nodeMoniker: "local"
  });
  vi.spyOn(XianReadClient.prototype, "call").mockImplementation(async (_contract, method) => {
    if (method === "get_proposal") return { kind: "state_patch", patch_id: "patch-1" };
    if (method === "get_patch") return { patch_id: "patch-1", applied_at_nanos: nanos };
    if (method === "get_active_validators") return [
      { account: "one", power: 9007199254740992n }, { account: "two", power: 1 }
    ];
    return [];
  });
  expect((await service.statePatches("local")).patches[0].appliedAtNanos).toBe(String(nanos));
  expect((await service.overview("local")).totalVotingWeight).toBe("9007199254740993");
});
