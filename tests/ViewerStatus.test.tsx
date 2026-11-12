import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ViewerStatus } from "../src/client/ViewerStatus";
import type { ProposalDetail, ProposalViewerState } from "../src/shared/types";

const viewer = (patch: Partial<ProposalViewerState> = {}): ProposalViewerState => ({
  account: "me",
  eligible: false,
  hasVoted: false,
  vote: null,
  weight: 0,
  isProposer: false,
  ...patch
});

const proposal = (patch: Partial<ProposalDetail> = {}): ProposalDetail =>
  ({
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    viewer: viewer(),
    ...patch
  }) as ProposalDetail;

const statusText = (detail: ProposalDetail, account: string | null = "me") => {
  const { container } = render(<ViewerStatus proposal={detail} account={account} />);
  return container.textContent;
};

describe("viewer status", () => {
  it("asks to connect a wallet when no account is connected", () => {
    expect(statusText(proposal(), null)).toBe("Connect a wallet to check your eligibility.");
  });

  it("shows nothing until the viewer state belongs to the connected account", () => {
    expect(statusText(proposal({ viewer: null }))).toBe("");
    expect(statusText(proposal({ viewer: viewer({ account: "other" }) }))).toBe("");
  });

  it("reports the recorded vote and the proposer role", () => {
    render(<ViewerStatus proposal={proposal({ viewer: viewer({ hasVoted: true, vote: "yes", weight: 4 }) })} account="me" />);
    expect(screen.getByText("yes")).toBeInTheDocument();
    expect(statusText(proposal({ viewer: viewer({ hasVoted: true, vote: "no", weight: 2, isProposer: true }) })))
      .toBe("You voted no (weight 2) · proposer.");
    expect(statusText(proposal({ viewer: viewer({ hasVoted: true, vote: "no", weight: 2 }) })))
      .toBe("You voted no (weight 2).");
  });

  it("invites an eligible account to vote", () => {
    expect(statusText(proposal({ viewer: viewer({ eligible: true, weight: 3 }) })))
      .toBe("You can vote on this proposal (weight 3).");
  });

  it("says voting closed for decided, expired, or weighted-but-ineligible accounts", () => {
    const closed = "Voting is closed for this proposal.";
    expect(statusText(proposal({ status: "approved" }))).toBe(closed);
    expect(statusText(proposal({ expiresAt: new Date(Date.now() - 60_000).toISOString() }))).toBe(closed);
    expect(statusText(proposal({ viewer: viewer({ weight: "5" }) }))).toBe(closed);
  });

  it("says an unweighted account on an open proposal is not eligible", () => {
    expect(statusText(proposal())).toBe("Your account is not eligible to vote on this proposal.");
  });
});
