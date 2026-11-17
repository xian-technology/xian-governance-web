import type { ValidatorRecord } from "../shared/types";
import { formatDateTime } from "./components";

export function unbondUnlockPresentation(
  validator: Pick<ValidatorRecord, "pendingUnbondCount" | "nextUnbondUnlockAt">
): { label: string; nextStep: string | null } {
  const count = validator.pendingUnbondCount ?? 0;
  if (BigInt(count) <= 0n) return { label: "—", nextStep: null };
  const unlock = formatDateTime(validator.nextUnbondUnlockAt);
  if (!unlock) {
    return {
      label: "Awaiting time anchor",
      nextStep: `Wait for a later finalized block to anchor the unlock time for ${count} pending unbond record(s). Claim only after each record has its own unlock time and that time has arrived.`
    };
  }
  return {
    label: unlock,
    nextStep: `The next recorded unbond unlock is ${unlock}. Check each record's own unlock time before claiming; records awaiting a time anchor cannot be claimed.`
  };
}
