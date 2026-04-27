import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApiApp } from "../src/server/app";
import type { GovernanceService } from "../src/server/governanceService";

const network = {
  id: "local",
  name: "Local",
  rpcUrl: "http://127.0.0.1:26657",
  governanceContract: "governance",
  membershipContract: "masternodes"
};

function fakeService(): GovernanceService {
  return {
    listNetworks: () => [network],
    overview: async () => ({
      network,
      chain: {
        chainId: "test-chain",
        latestHeight: 42,
        catchingUp: false,
        nodeMoniker: "node"
      },
      activeValidators: 2,
      totalVotingWeight: 20,
      pendingProposals: 1,
      expiringSoon: 0,
      scheduledPatches: 0
    }),
    proposals: async () => ({
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
    }),
    proposal: async () => ({
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
      votes: [
        {
          proposalId: 1,
          layer: "validator",
          voter: "node1",
          vote: "yes",
          weight: 10
        }
      ],
      payload: { type: "topic_vote" }
    }),
    proposalVotes: async () => [
      {
        proposalId: 1,
        layer: "validator",
        voter: "node1",
        vote: "yes",
        weight: 10
      }
    ],
    validators: async () => ({
      active: [{ account: "node1", active: true, power: 10 }],
      candidates: []
    }),
    statePatches: async () => ({ patches: [] }),
    simulate: async () => ({ result: "ok" })
  } as unknown as GovernanceService;
}

describe("api app", () => {
  it("serves overview, proposal detail, votes, and validators", async () => {
    const app = createApiApp(fakeService());

    await request(app).get("/api/networks").expect(200).expect(({ body }) => {
      expect(body.networks[0].id).toBe("local");
    });
    await request(app)
      .get("/api/networks/local/overview")
      .expect(200)
      .expect(({ body }) => {
        expect(body.chain.latestHeight).toBe(42);
      });
    await request(app)
      .get("/api/networks/local/proposals/validator/1")
      .expect(200)
      .expect(({ body }) => {
        expect(body.votes[0].vote).toBe("yes");
      });
    await request(app)
      .get("/api/networks/local/validators")
      .expect(200)
      .expect(({ body }) => {
        expect(body.active[0].account).toBe("node1");
      });
  });
});
