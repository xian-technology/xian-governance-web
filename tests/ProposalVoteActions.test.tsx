import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalVoteActions } from "../src/client/ProposalVoteActions";
import type { ProposalDetail } from "../src/shared/types";
import type { InjectedXianWallet } from "@xian-tech/provider";

const proposal: ProposalDetail = {
  networkId: "local", layer: "validator", proposalId: 3, kind: "validator_vote",
  type: "update_policy", title: "Policy", summary: "Policy", status: "pending",
  yesVotes: 1, noVotes: 0, yesWeight: 1, noWeight: 0, requiredYesVotes: 2,
  requiredYesWeight: 2, totalWeightSnapshot: 2, payload: {}, votes: [],
  viewer: { account: "me", eligible: true, hasVoted: false, vote: null, weight: 1, isProposer: false }
};
const exhausted = {
  submitted: true, accepted: true, finalized: true, txHash: "failed-vote",
  receipt: { success: false, message: "'Out of chi.'" }
};
const contracts = { governanceContract: "governance", membershipContract: "validators" };

function setup(firstResult: unknown = exhausted) {
  const sendCall = vi.fn().mockResolvedValueOnce(firstResult).mockResolvedValue({
    submitted: true, accepted: true, finalized: true, receipt: { success: true }, txHash: "retry-vote"
  });
  const props: ComponentProps<typeof ProposalVoteActions> = {
    proposal, networkId: "local", networkChainId: "chain-a", contracts,
    session: { wallet: { sendCall } as unknown as InjectedXianWallet, account: "me", chainId: "chain-a" },
    onSuccess: vi.fn()
  };
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ProposalVoteActions {...props} /></QueryClientProvider>);
  return { ...view, sendCall, props, rerenderActions: (changes: Partial<typeof props>) =>
    view.rerender(<QueryClientProvider client={client}><ProposalVoteActions {...props} {...changes} /></QueryClientProvider>) };
}

async function failVote(support = true) {
  fireEvent.click(screen.getByRole("button", { name: support ? "Yes" : "No" }));
  return screen.findByRole("button", { name: /vote again/i });
}

describe("governance vote retry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("/simulate") ? { status: 0, chi_used: 8539 } : proposal
    ), { status: 200, headers: { "content-type": "application/json" } })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers an explicit retry for a confirmed exhausted vote and supplies the new estimate plus two", async () => {
    const { sendCall, props } = setup();
    const retry = await failVote(false);
    expect(sendCall).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/failed vote.*fee.*charged/i)).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(sendCall).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledWith("/api/networks/local/proposals/validator/3?account=me");
    expect(fetch).toHaveBeenCalledWith("/api/networks/local/simulate", expect.objectContaining({
      method: "POST", body: JSON.stringify({ sender: "me", contract: "validators", function: "vote", kwargs: { proposal_id: 3, vote: "no" } })
    }));
    expect(sendCall).toHaveBeenLastCalledWith({ chainId: "chain-a", contract: "validators", function: "vote",
      kwargs: { proposal_id: 3, vote: "no" }, chiSupplied: 8541 }, { mode: "checktx", waitForTx: true });
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: /vote again/i })).not.toBeInTheDocument();
  });

  it.each([
    { submitted: true, accepted: true, finalized: false, message: "Out of chi" },
    { submitted: true, accepted: false, finalized: false, message: "Out of chi" },
    { submitted: true, accepted: true, finalized: true, receipt: { success: false, message: "Proposal expired" } }
  ])("does not offer replay for uncertain, rejected or other failed outcomes: %j", async (result) => {
    const { sendCall } = setup(result);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /vote again/i })).not.toBeInTheDocument();
    expect(sendCall).toHaveBeenCalledOnce();
  });

  it("refuses a retry when the latest proposal is no longer votable", async () => {
    const { sendCall } = setup();
    const retry = await failVote();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...proposal, status: "approved" })));
    fireEvent.click(retry);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer eligible/i);
    expect(sendCall).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{ status: 1, result: "Proposal expired" }, { status: 0, chi_used: -1 }, { status: 0, chi_used: "bad" }, { status: 0, chi_used: 200001 }])(
    "refuses a failed or invalid fresh estimate: %j", async (simulation) => {
      const { sendCall } = setup();
      const retry = await failVote();
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(proposal)))
        .mockResolvedValueOnce(new Response(JSON.stringify(simulation)));
      fireEvent.click(retry);
      await waitFor(() => expect(screen.getByRole("alert")).not.toHaveTextContent(/chain state changed/i));
      expect(sendCall).toHaveBeenCalledOnce();
    }
  );

  it("clears retry state when the account changes", async () => {
    const { rerenderActions, props } = setup();
    await failVote();
    rerenderActions({ session: { ...props.session, account: null, wallet: null } });
    expect(screen.queryByRole("button", { name: /vote again/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
  });

  it("does not sign after disconnecting while a retry estimate is in flight", async () => {
    const { sendCall, rerenderActions, props } = setup();
    const retry = await failVote();
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(proposal)))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(retry);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    rerenderActions({ session: { ...props.session, account: null, wallet: null } });
    await act(async () => { finish(new Response(JSON.stringify({ status: 0, chi_used: 18000 }))); });
    expect(sendCall).toHaveBeenCalledOnce();
  });

  it("refuses signing on a wallet/console chain mismatch", async () => {
    const { sendCall, props, rerenderActions } = setup();
    rerenderActions({ session: { ...props.session, chainId: "other-chain" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/switch the wallet network/i);
    expect(sendCall).not.toHaveBeenCalled();
  });
});
