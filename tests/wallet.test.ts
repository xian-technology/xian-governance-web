import { describe, expect, it, vi } from "vitest";

import {
  resolveGovernanceContracts,
  submitExpire,
  submitVote
} from "../src/client/wallet";
import type { ProposalDetail } from "../src/shared/types";

const contracts = {
  governanceContract: "custom_governance",
  membershipContract: "custom_members"
};

const baseProposal: ProposalDetail = {
  networkId: "custom",
  layer: "protocol",
  proposalId: 7,
  kind: "contract_call",
  type: "contract_call",
  title: "upgrade",
  summary: "upgrade",
  status: "pending",
  yesVotes: 0,
  noVotes: 0,
  yesWeight: 0,
  noWeight: 0,
  requiredYesVotes: 1,
  requiredYesWeight: 1,
  totalWeightSnapshot: 1,
  votes: [],
  payload: {}
};

describe("wallet governance calls", () => {
  it("defaults missing contract names", () => {
    expect(resolveGovernanceContracts(null)).toEqual({
      governanceContract: "governance",
      membershipContract: "masternodes"
    });
    expect(resolveGovernanceContracts({ governanceContract: "gov" })).toEqual({
      governanceContract: "gov",
      membershipContract: "masternodes"
    });
  });

  it("submits protocol votes to the configured governance contract", async () => {
    const sendCall = vi.fn(async () => ({ txHash: "abc" }));
    const wallet = { sendCall } as unknown as Parameters<typeof submitVote>[0];

    await submitVote(wallet, "chain-a", contracts, baseProposal, true);

    expect(sendCall).toHaveBeenCalledWith(
      {
        chainId: "chain-a",
        contract: "custom_governance",
        function: "vote",
        kwargs: { proposal_id: 7, support: true }
      },
      { mode: "checktx", waitForTx: true },
    );
  });

  it("submits validator expirations to the configured membership contract", async () => {
    const sendCall = vi.fn(async () => ({ txHash: "abc" }));
    const wallet = { sendCall } as unknown as Parameters<typeof submitExpire>[0];

    await submitExpire(wallet, "chain-a", contracts, "validator", 11);

    expect(sendCall).toHaveBeenCalledWith(
      {
        chainId: "chain-a",
        contract: "custom_members",
        function: "expire_vote",
        kwargs: { proposal_id: 11 }
      },
      { mode: "checktx", waitForTx: true },
    );
  });
});
