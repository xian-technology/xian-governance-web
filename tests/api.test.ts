import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApiApp } from "../src/server/app";
import type { GovernanceService } from "../src/server/governanceService";

const network = {
  id: "local",
  name: "Local",
  rpcUrl: "http://127.0.0.1:26657",
  governanceContract: "governance",
  membershipContract: "validators"
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
    history: async () => ({
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
          blockHeight: 42,
          createdAt: "2026-01-01T00:00:00Z",
          actor: "node1",
          data: { proposal_id: 1, voter: "node1", vote: "yes" }
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
      candidates: [],
      inactive: [{ account: "node-old", active: false, power: 0, status: "left" }]
    }),
    statePatches: async () => ({ patches: [] }),
    simulate: async () => ({ result: "ok" })
  } as unknown as GovernanceService;
}

describe("api app", () => {
  it("preserves large integers in simulation replies", async () => {
    const service = fakeService();
    const simulate = async () => ({ result: { amount: 9007199254740993n } });
    const app = createApiApp({ ...service, simulate } as unknown as GovernanceService);
    await request(app)
      .post("/api/networks/local/simulate")
      .send({ contract: "currency", function: "balance_of", kwargs: {} })
      .expect(200)
      .expect(({ body }) => {
        expect(body.result.amount).toEqual({ __big_int__: "9007199254740993" });
      });
  });

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
      .get("/api/networks/local/history")
      .expect(200)
      .expect(({ body }) => {
        expect(body.events[0].event).toBe("ValidatorProposalVoted");
      });
    await request(app)
      .get("/api/networks/local/validators")
      .expect(200)
      .expect(({ body }) => {
        expect(body.active[0].account).toBe("node1");
        expect(body.inactive[0].status).toBe("left");
      });
  });
});

it("preflights user-authored JSON without rounding nested contract numbers", async () => {
  const simulate = async (_network: string, payload: unknown) => payload;
  const app = createApiApp({ ...fakeService(), simulate } as unknown as GovernanceService);
  const amount = "9007199254740993.000000000000000000000000000001";
  await request(app).post("/api/networks/local/simulate").type("application/json")
    .send(`{"kwargs":{"args":[${amount},9007199254740993,"1e-3"]}}`).expect(200)
    .expect(({body}) => expect(body.kwargs.args).toEqual([
      {__fixed__: amount}, {__big_int__: "9007199254740993"}, "1e-3"
    ]));
  await request(app).post("/api/networks/local/simulate").type("application/json")
    .send('{"kwargs":{"value":1e-31}}').expect(400);
});
