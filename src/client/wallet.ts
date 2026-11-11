import {
  assertSendCallSucceeded,
  useXianWallet,
  type CallIntent,
  type SendCallResult,
  type WalletState
} from "@xian-tech/web-kit";
import type { InjectedXianWallet } from "@xian-tech/provider";

import { isPastExpiry } from "../shared/format";
import type {
  GovernanceLayer,
  NetworkConfig,
  ProposalDetail,
  ProposalSummary
} from "../shared/types";

export { useXianWallet };
export type { WalletState };

export type GovernanceContracts = Pick<
  NetworkConfig,
  "governanceContract" | "membershipContract"
>;

const DEFAULT_GOVERNANCE_CONTRACTS: GovernanceContracts = {
  governanceContract: "governance",
  membershipContract: "validators"
};

export function resolveGovernanceContracts(
  contracts?: Partial<GovernanceContracts> | null,
): GovernanceContracts {
  return {
    governanceContract:
      contracts?.governanceContract || DEFAULT_GOVERNANCE_CONTRACTS.governanceContract,
    membershipContract:
      contracts?.membershipContract || DEFAULT_GOVERNANCE_CONTRACTS.membershipContract
  };
}

export function canVote(
  proposal: Pick<ProposalSummary, "status" | "viewer" | "expiresAt"> &
    Partial<Pick<ProposalDetail, "votes">>,
  account: string | null,
): boolean {
  // The chain keeps an expired proposal "pending" until someone finalizes
  // it, but rejects every vote once its expiry has passed.
  if (!account || proposal.status !== "pending" || canExpire(proposal)) {
    return false;
  }
  // Prefer the server-computed viewer state; fall back to the vote matrix
  // when present (proposal detail) for resilience.
  if (proposal.viewer && proposal.viewer.account === account) {
    return proposal.viewer.eligible;
  }
  const record = proposal.votes?.find((vote) => vote.voter === account);
  return Boolean(record && BigInt(record.weight) > 0n && record.vote === null);
}

/**
 * A pending proposal whose expiry has passed can be finalized to `expired`
 * on-chain by anyone via `expire_proposal` / `expire_vote`.
 */
export function canExpire(
  proposal: Pick<ProposalSummary, "status" | "expiresAt">,
): boolean {
  return proposal.status === "pending" && isPastExpiry(proposal.expiresAt);
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
 * differs from the network the user is viewing, or that network's chain id is
 * not known yet, refuse to build the call so a vote/proposal can never land on
 * the wrong chain.
 */
export function resolveSigningChainId(
  walletChainId: string | null,
  networkChainId: string | null | undefined,
): string {
  if (!walletChainId) {
    throw new Error("connect wallet first");
  }
  if (!networkChainId) {
    throw new Error("The network chain id is not known yet; wait for chain status before signing.");
  }
  if (walletChainId !== networkChainId) {
    throw new ChainMismatchError(walletChainId, networkChainId);
  }
  return networkChainId;
}

/**
 * Submit a governance call through the injected wallet and fail unless the
 * transaction was admitted and executed successfully. The provider resolves
 * (rather than rejects) on CheckTx rejection and on failed execution.
 */
export async function sendGovernanceCall(
  wallet: InjectedXianWallet,
  intent: CallIntent,
): Promise<SendCallResult> {
  const result = (await wallet.sendCall(intent, {
    mode: "checktx",
    waitForTx: true
  })) as SendCallResult;
  assertSendCallSucceeded(result);
  return result;
}

export async function submitVote(
  wallet: InjectedXianWallet,
  chainId: string,
  contracts: GovernanceContracts,
  proposal: ProposalDetail,
  support: boolean,
) {
  const call = voteCallFor(proposal.layer, proposal.proposalId, support, contracts);
  return sendGovernanceCall(wallet, { chainId, ...call });
}

export async function submitExpire(
  wallet: InjectedXianWallet,
  chainId: string,
  contracts: GovernanceContracts,
  layer: GovernanceLayer,
  proposalId: number,
) {
  const call = expireCallFor(layer, proposalId, contracts);
  return sendGovernanceCall(wallet, { chainId, ...call });
}

function voteCallFor(
  layer: GovernanceLayer,
  proposalId: number,
  support: boolean,
  contracts: GovernanceContracts,
) {
  if (layer === "protocol") {
    return {
      contract: contracts.governanceContract,
      function: "vote",
      kwargs: { proposal_id: proposalId, support }
    };
  }
  return {
    contract: contracts.membershipContract,
    function: "vote",
    kwargs: { proposal_id: proposalId, vote: support ? "yes" : "no" }
  };
}

function expireCallFor(
  layer: GovernanceLayer,
  proposalId: number,
  contracts: GovernanceContracts,
) {
  if (layer === "protocol") {
    return {
      contract: contracts.governanceContract,
      function: "expire_proposal",
      kwargs: { proposal_id: proposalId }
    };
  }
  return {
    contract: contracts.membershipContract,
    function: "expire_vote",
    kwargs: { proposal_id: proposalId }
  };
}
