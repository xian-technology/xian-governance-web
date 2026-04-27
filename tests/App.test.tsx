import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/client/App";

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
                totalWeightSnapshot: 20
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
                weight: 10
              }
            ]
          });
        }
        if (url === "/api/networks/local/validators") {
          return json({ active: [], candidates: [] });
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
    fireEvent.click(screen.getAllByText("topic vote")[0]);
    expect(await screen.findByRole("link", { name: /open off-chain reference/i })).toHaveAttribute(
      "href",
      "https://github.com/xian-network/governance/discussions/1",
    );
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
