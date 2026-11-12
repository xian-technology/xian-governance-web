import type { ProposalDetail } from "../shared/types";
import { canExpire } from "./wallet";

export function ViewerStatus({ proposal, account }: { proposal: ProposalDetail; account: string | null }) {
  if (!account) {
    return <div className="viewer-status muted">Connect a wallet to check your eligibility.</div>;
  }
  const viewer = proposal.viewer;
  if (!viewer || viewer.account !== account) {
    return null;
  }
  if (viewer.hasVoted) {
    return (
      <div className="viewer-status voted">
        You voted <strong>{viewer.vote}</strong> (weight {viewer.weight})
        {viewer.isProposer ? " · proposer" : ""}.
      </div>
    );
  }
  if (viewer.eligible) {
    return <div className="viewer-status eligible">You can vote on this proposal (weight {viewer.weight}).</div>;
  }
  // A weighted, not-yet-voted account is ineligible only because voting closed
  // (expiry passed or a state patch reached its activation height).
  if (proposal.status !== "pending" || canExpire(proposal) || BigInt(viewer.weight) > 0n) {
    return <div className="viewer-status muted">Voting is closed for this proposal.</div>;
  }
  return <div className="viewer-status muted">Your account is not eligible to vote on this proposal.</div>;
}
