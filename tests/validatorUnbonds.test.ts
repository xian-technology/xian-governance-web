import { describe, expect, it } from "vitest";

import { unbondUnlockPresentation } from "../src/client/validatorUnbonds";

describe("unbond unlock presentation", () => {
  it.each([{}, { pendingUnbondCount: 0 }, { pendingUnbondCount: "0" }])(
    "does not invent a pending anchor when there are no unbonds (%j)", (validator) => {
      expect(unbondUnlockPresentation(validator)).toEqual({ label: "—", nextStep: null });
    }
  );

  it.each([null, undefined])("waits for an unknown unlock (%s) with exact counts", (unlock) => {
    const count = "9007199254740993";
    const result = unbondUnlockPresentation({ pendingUnbondCount: count, nextUnbondUnlockAt: unlock });
    expect(result.label).toBe("Awaiting time anchor");
    expect(result.nextStep).toContain(`anchor the unlock time for ${count} pending unbond`);
    expect(result.nextStep).toContain("each record has its own unlock time");
  });

  it("shows an anchored unlock and requires each record's own time, including zero-day unbonds", () => {
    const result = unbondUnlockPresentation({ pendingUnbondCount: 2, nextUnbondUnlockAt: "2026-01-09T00:00:00Z" });
    expect(result.label).toContain("2026");
    expect(result.nextStep).toContain(`next recorded unbond unlock is ${result.label}`);
    expect(result.nextStep).toContain("each record's own unlock time");
    expect(result.nextStep).toContain("records awaiting a time anchor cannot be claimed");
  });
});
