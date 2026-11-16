import { useMutation } from "@tanstack/react-query";
import type { InjectedXianWallet } from "@xian-tech/provider";
import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ProposalDetail } from "../shared/types";
import {
  canVote, isConfirmedOutOfChi, resolveSigningChainId, sendGovernanceCall,
  voteCallFor, type GovernanceContracts
} from "./wallet";
import { prepareVoteRetry } from "./voteRetry";

type Props = {
  proposal: ProposalDetail;
  networkId: string;
  networkChainId: string | null | undefined;
  contracts: GovernanceContracts;
  session: { wallet: InjectedXianWallet | null; account: string | null; chainId: string | null };
  onSuccess: () => unknown;
};

/** A new signing context starts with no pending retry or stale error. */
export function ProposalVoteActions(props: Props) {
  const { networkId, networkChainId, proposal, session, contracts } = props;
  const scope = JSON.stringify([networkId, networkChainId, proposal.layer, proposal.proposalId,
    session.account, session.chainId, contracts.governanceContract, contracts.membershipContract]);
  return <VoteActions key={scope} {...props} />;
}

function useVoteSubmission({ proposal, networkId, networkChainId, contracts, session, onSuccess }: Props) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return useMutation({
    mutationFn: async ({ support, retry = false }: { support: boolean; retry?: boolean }) => {
      if (!session.wallet || !session.account) throw new Error("connect wallet first");
      const chainId = resolveSigningChainId(session.chainId, networkChainId);
      const call = retry
        ? await prepareVoteRetry(networkId, session.account, proposal, support, contracts)
        : voteCallFor(proposal.layer, proposal.proposalId, support, contracts);
      if (!active.current) throw new Error("Wallet or proposal changed; review the vote again.");
      return sendGovernanceCall(session.wallet, { chainId, ...call });
    },
    onSuccess: () => { if (active.current) onSuccess(); }
  });
}

function VoteActions(props: Props) {
  const mutation = useVoteSubmission(props);
  const disabled = !canVote(props.proposal, props.session.account) || mutation.isPending;
  const retry = isConfirmedOutOfChi(mutation.error) && !disabled && mutation.variables;
  return <div className="vote-actions">
    <div className="action-row">
      <button type="button" disabled={disabled} className="success" onClick={() => mutation.mutate({ support: true })}>
        <Check size={16} /> Yes
      </button>
      <button type="button" disabled={disabled} className="danger" onClick={() => mutation.mutate({ support: false })}>
        <X size={16} /> No
      </button>
    </div>
    {mutation.error ? <div role="alert" className="notice error">{mutation.error.message}</div> : null}
    {retry ? <div className="notice warning">
      <p>The failed vote was not recorded. Its transaction fee was charged.
        Vote again checks eligibility, re-estimates chi, and asks for a new wallet approval.</p>
      <button type="button" className="primary" onClick={() => mutation.mutate({ support: retry.support, retry: true })}>
        Vote again ({retry.support ? "Yes" : "No"})
      </button>
    </div> : null}
  </div>;
}
