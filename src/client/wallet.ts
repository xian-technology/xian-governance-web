import { useXianWallet, type WalletState } from "@xian-tech/web-kit";
import type { InjectedXianWallet } from "@xian-tech/provider";

import type { GovernanceLayer, ProposalDetail, ProposalSummary } from "../shared/types";

export { useXianWallet };
export type { WalletState };

export function canVote(
  proposal: Pick<ProposalSummary, "status" | "viewer"> & Partial<Pick<ProposalDetail, "votes">>,
  account: string | null,
): boolean {
  if (!account || proposal.status !== "pending") {
    return false;
  }
  // Prefer the server-computed viewer state; fall back to the vote matrix
  // when present (proposal detail) for resilience.
  if (proposal.viewer && proposal.viewer.account === account) {
    return proposal.viewer.eligible;
  }
  const record = proposal.votes?.find((vote) => vote.voter === account);
  return Boolean(record && record.weight > 0 && record.vote === null);
}

/**
 * A pending proposal whose expiry has passed can be finalized to `expired`
 * on-chain by anyone via `expire_proposal` / `expire_vote`.
 */
export function canExpire(
  proposal: Pick<ProposalSummary, "status" | "expiresAt">,
): boolean {
  if (proposal.status !== "pending" || !proposal.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(proposal.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export class ChainMismatchError extends Error {
  constructor(readonly walletChainId: string, readonly networkChainId: string) {
    super(
      `Wallet is connected to chain "${walletChainId}", but this network is ` +
        `"${networkChainId}". Switch the wallet network before signing.`,
    );
    this.name = "ChainMismatchError";
  }
}

/**
 * Pin the chain id before any signing flow. If the connected wallet's chain
 * differs from the network the user is viewing, refuse to build the call so a
 * vote/proposal can never land on the wrong chain.
 */
export function resolveSigningChainId(
  walletChainId: string | null,
  networkChainId: string | null | undefined,
): string {
  if (!walletChainId) {
    throw new Error("connect wallet first");
  }
  if (networkChainId && walletChainId !== networkChainId) {
    throw new ChainMismatchError(walletChainId, networkChainId);
  }
  return networkChainId ?? walletChainId;
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

export async function submitExpire(
  wallet: InjectedXianWallet,
  chainId: string,
  layer: GovernanceLayer,
  proposalId: number,
) {
  const call = expireCallFor(layer, proposalId);
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

function expireCallFor(layer: GovernanceLayer, proposalId: number) {
  if (layer === "protocol") {
    return {
      contract: "governance",
      function: "expire_proposal",
      kwargs: { proposal_id: proposalId }
    };
  }
  return {
    contract: "masternodes",
    function: "expire_vote",
    kwargs: { proposal_id: proposalId }
  };
}
