import { useXianWallet, type WalletState } from "@xian-tech/web-kit";
import type { InjectedXianWallet } from "@xian-tech/provider";

import type { GovernanceLayer, ProposalDetail } from "../shared/types";

export { useXianWallet };
export type { WalletState };

export function canVote(proposal: ProposalDetail, account: string | null): boolean {
  if (!account || proposal.status !== "pending") {
    return false;
  }
  const record = proposal.votes.find((vote) => vote.voter === account);
  return Boolean(record && record.weight > 0 && record.vote === null);
}

export async function submitVote(
  wallet: InjectedXianWallet,
  chainId: string,
  proposal: ProposalDetail,
  support: boolean,
) {
  const call = voteCallFor(proposal.layer, proposal.proposalId, support);
  return wallet.sendCall(
    {
      chainId,
      contract: call.contract,
      function: call.function,
      kwargs: call.kwargs
    },
    { mode: "checktx", waitForTx: true },
  );
}

function voteCallFor(layer: GovernanceLayer, proposalId: number, support: boolean) {
  if (layer === "protocol") {
    return {
      contract: "governance",
      function: "vote",
      kwargs: { proposal_id: proposalId, support }
    };
  }
  return {
    contract: "masternodes",
    function: "vote",
    kwargs: { proposal_id: proposalId, vote: support ? "yes" : "no" }
  };
}
