import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/client/App";
import { RECOVERY_VOTE_TYPES } from "../src/client/validatorVote";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/networks") {
          return json({ networks: [{ id: "local", name: "Local Xian" }] });
        }
        if (url === "/api/networks/local/overview") {
          return json({
            network: { id: "local", name: "Local Xian" },
            chain: {
              chainId: "test-chain",
              latestHeight: 100,
              catchingUp: false,
              nodeMoniker: "node"
            },
            activeValidators: 2,
            totalVotingWeight: 20,
            pendingProposals: 1,
            expiringSoon: 0,
            scheduledPatches: 0
          });
        }
        if (url === "/api/networks/local/proposals") {
          return json({
            proposals: [
              {
                networkId: "local",
                layer: "validator",
                proposalId: 1,
                kind: "validator_vote",
                type: "topic_vote",
                title: "topic vote",
                summary: "topic vote",
                status: "pending",
                yesVotes: 1,
                noVotes: 0,
                yesWeight: 10,
                noWeight: 0,
                requiredYesVotes: 2,
                requiredYesWeight: 20,
                totalWeightSnapshot: 20,
                historyAvailable: true,
                eventCount: 1,
                lastTxHash: "abc123",
                lastBlockHeight: 101
              }
            ]
          });
        }
        if (url === "/api/networks/local/history") {
          return json({
            available: true,
            events: [
              {
                id: 1,
                layer: "validator",
                proposalId: 1,
                contract: "validators",
                event: "ValidatorProposalVoted",
                title: "Vote cast #1",
                txHash: "abc123",
                blockHeight: 101,
                createdAt: "2026-01-01T00:00:00Z",
                actor: "abc",
                data: { proposal_id: 1, voter: "abc", vote: "yes" }
              }
            ]
          });
        }
        if (url === "/api/networks/local/proposals/validator/1") {
          return json({
            networkId: "local",
            layer: "validator",
            proposalId: 1,
            kind: "validator_vote",
            type: "topic_vote",
            title: "topic vote",
            summary: "topic vote",
            status: "pending",
            yesVotes: 1,
            noVotes: 0,
            yesWeight: 10,
            noWeight: 0,
            requiredYesVotes: 2,
            requiredYesWeight: 20,
            totalWeightSnapshot: 20,
            uri: "https://github.com/xian-network/governance/discussions/1",
            payload: { topic: "topic vote" },
            votes: [
              {
                proposalId: 1,
                layer: "validator",
                voter: "abc",
                vote: "yes",
                weight: 10,
                txHash: "abc123",
                blockHeight: 101,
                votedAt: "2026-01-01T00:00:00Z"
              }
            ],
            timeline: [
              {
                id: 1,
                layer: "validator",
                proposalId: 1,
                contract: "validators",
                event: "ValidatorProposalVoted",
                title: "Vote cast #1",
                txHash: "abc123",
                blockHeight: 101,
                createdAt: "2026-01-01T00:00:00Z",
                actor: "abc",
                data: { proposal_id: 1, voter: "abc", vote: "yes" }
              }
            ],
            historyAvailable: true,
            eventCount: 1
          });
        }
        if (url === "/api/networks/local/validators") {
          return json({
            active: [
              {
                account: "node-active",
                moniker: "active-validator",
                status: "active",
                active: true,
                power: 10,
                totalBond: 1500,
                pendingUnbondCount: 0
              }
            ],
            candidates: [
              {
                account: "node-candidate",
                moniker: "candidate-validator",
                status: "approved",
                active: false,
                power: 0,
                totalBond: 1200,
                selectionEligibleAtLastRebalance: true,
                lastRebalanceEpoch: 12,
                eligibleAtEpoch: 12
              }
            ],
            inactive: [
              {
                account: "node-retired",
                moniker: "retired-validator",
                status: "withdrawn",
                active: false,
                power: 0,
                totalBond: 0,
                totalSlashed: 25,
                pendingUnbondCount: 2,
                pendingUnbondTotal: 500,
                nextUnbondUnlockAt: "2026-01-09T00:00:00Z",
                lastEvidenceId: "evidence-77",
                lastEvidenceType: "DUPLICATE_VOTE",
                lastEvidenceHeight: 77
              }
            ]
          });
        }
        if (url === "/api/networks/local/policy") {
          return json({
            membership: { selection_mode: "manual" },
            governance: {},
            registrationFee: 1000,
            voteTypes: [...RECOVERY_VOTE_TYPES, "topic_vote"],
            recoveryVoteTypes: RECOVERY_VOTE_TYPES
          });
        }
        if (url === "/api/networks/local/state-patches") {
          return json({ patches: [] });
        }
        return json({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders dashboard metrics and proposals", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText("100")).toBeInTheDocument();
    });
    expect(screen.getByText("Active Validators")).toBeInTheDocument();
    expect(screen.getAllByText("topic vote").length).toBeGreaterThan(0);
    expect(await screen.findByText("Vote cast #1")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("topic vote")[0]);
    expect(await screen.findByRole("link", { name: /open reference/i })).toHaveAttribute(
      "href",
      "https://github.com/xian-network/governance/discussions/1",
    );
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("shows actionable validator lifecycle, evidence, and unbond state", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Validators" }));
    expect(await screen.findByText("Exited / Removed")).toBeInTheDocument();
    expect(await screen.findByText("retired-validator")).toBeInTheDocument();
    expect(screen.getByText("rebalance eligible")).toBeInTheDocument();

    fireEvent.click(screen.getByText("retired-validator"));
    expect(await screen.findByText("Operator next step:")).toBeInTheDocument();
    expect(screen.getByText("Pending Unbond Total")).toBeInTheDocument();
    expect(screen.getByText(/DUPLICATE_VOTE \/ evidence-77/)).toBeInTheDocument();
    expect(screen.getByText("Evidence height")).toBeInTheDocument();
  });

  it("identifies immutable recovery vote types in network settings", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText(/10 recovery vote types are immutable/i)).toBeInTheDocument();
    expect(screen.getByText("change_types · immutable recovery")).toBeInTheDocument();
    expect(screen.getByText("topic_vote")).toBeInTheDocument();
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
