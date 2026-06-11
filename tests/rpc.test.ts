import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  getStatus: vi.fn(),
  getState: vi.fn(),
  abciValue: vi.fn(),
  listEvents: vi.fn(),
  getRecentEvents: vi.fn()
}));

vi.mock("@xian-tech/client", () => ({
  XianClient: class {
    call = mocks.call;
    getStatus = mocks.getStatus;
    getState = mocks.getState;
    abciValue = mocks.abciValue;
    listEvents = mocks.listEvents;
    getRecentEvents = mocks.getRecentEvents;
  }
}));

const { XianReadClient } = await import("../src/server/rpc");

const network = {
  id: "local",
  name: "Local",
  rpcUrl: "http://127.0.0.1:26657",
  governanceContract: "governance",
  membershipContract: "validators"
};

describe("XianReadClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries transient read transport failures", async () => {
    mocks.call
      .mockRejectedValueOnce(new Error("request failed for http://127.0.0.1:26657/abci_query"))
      .mockResolvedValueOnce({ ok: true });

    const client = new XianReadClient(network);

    await expect(client.call("validators", "get_policy_config")).resolves.toEqual({
      ok: true
    });
    expect(mocks.call).toHaveBeenCalledTimes(2);
  });

  it("does not retry contract-level read errors", async () => {
    mocks.call.mockRejectedValueOnce(new Error("ABCI query failed"));

    const client = new XianReadClient(network);

    await expect(client.call("validators", "missing_view")).rejects.toThrow(
      "ABCI query failed",
    );
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
});
