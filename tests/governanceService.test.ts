import { describe, expect, it } from "vitest";

import { normalizeValidator } from "../src/server/governanceService";

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
