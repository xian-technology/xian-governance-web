import { chiToSupply } from "@xian-tech/client";
import type { ProposalDetail } from "../shared/types";
import { getProposal, simulate } from "./api";
import { canVote, voteCallFor, type GovernanceContracts } from "./wallet";

/** Check current eligibility and price the same vote against current chain state. */
export async function prepareVoteRetry(
  networkId: string,
  account: string,
  proposal: ProposalDetail,
  support: boolean,
  contracts: GovernanceContracts,
) {
  const current = await getProposal(networkId, proposal.layer, proposal.proposalId, account);
  if (!canVote(current, account)) {
    throw new Error("You are no longer eligible to vote on this proposal. Refresh the proposal to review its state.");
  }
  const call = voteCallFor(current.layer, current.proposalId, support, contracts);
  const simulation = await simulate(networkId, { sender: account, ...call });
  return { ...call, chiSupplied: retryChi(simulation) };
}

function retryChi(simulation: unknown): number {
  if (typeof simulation !== "object" || simulation === null) {
    throw new Error("Vote simulation returned an invalid response.");
  }
  const result = simulation as Record<string, unknown>;
  if (result.status !== 0) {
    throw new Error(String(result.result ?? "Vote simulation failed."));
  }
  const chi = result.chi_used;
  if (typeof chi !== "number" || !Number.isSafeInteger(chi) || chi < 0) {
    throw new Error("Vote simulation returned an invalid chi estimate.");
  }
  return chiToSupply(chi);
}
