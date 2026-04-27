import { XianClient } from "@xian-tech/client";

import { isRecord } from "../shared/format.js";
import type { ChainStatus, NetworkConfig } from "../shared/types.js";

export class XianReadClient {
  readonly client: XianClient;

  constructor(readonly network: NetworkConfig) {
    this.client = new XianClient({
      rpcUrl: network.rpcUrl,
      dashboardUrl: network.dashboardUrl
    });
  }

  async getChainStatus(): Promise<ChainStatus> {
    const status = await this.client.getStatus();
    const result = isRecord(status.result) ? status.result : {};
    const nodeInfo = isRecord(result.node_info) ? result.node_info : {};
    const syncInfo = isRecord(result.sync_info) ? result.sync_info : {};
    const height = Number(syncInfo.latest_block_height ?? NaN);

    return {
      chainId:
        typeof nodeInfo.network === "string"
          ? nodeInfo.network
          : this.network.chainId ?? null,
      latestHeight: Number.isFinite(height) ? height : null,
      catchingUp:
        typeof syncInfo.catching_up === "boolean" ? syncInfo.catching_up : null,
      nodeMoniker:
        typeof nodeInfo.moniker === "string" ? nodeInfo.moniker : null
    };
  }

  async call<T = unknown>(
    contract: string,
    method: string,
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    return this.client.call({
      sender: "governance-web",
      contract,
      function: method,
      kwargs
    }) as Promise<T>;
  }

  async getState<T = unknown>(
    contract: string,
    variable: string,
    keys: string[] = [],
  ): Promise<T | null> {
    try {
      return (await this.client.getState(contract, variable, keys)) as T | null;
    } catch {
      return null;
    }
  }

  async abciValue<T = unknown>(path: string): Promise<T | null> {
    const url = new URL(`${this.network.rpcUrl}/abci_query`);
    url.searchParams.set("path", `"${path}"`);
    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      throw new Error(`ABCI query failed with ${response.status}`);
    }
    const body = (await response.json()) as unknown;
    if (!isRecord(body)) {
      return null;
    }
    const result = isRecord(body.result) ? body.result : {};
    const abciResponse = isRecord(result.response) ? result.response : {};
    const value = abciResponse.value;
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }
    const decoded = Buffer.from(value, "base64").toString("utf8");
    try {
      return JSON.parse(decoded) as T;
    } catch {
      return decoded as T;
    }
  }

  async scanKeySuffixes(prefix: string, limit = 200): Promise<string[]> {
    const suffixes: string[] = [];
    let after: string | null = null;
    for (;;) {
      const parts = [`/keys/${prefix}`, `limit=${limit}`];
      if (after) {
        parts.push(`after=${after}`);
      }
      const result = await this.abciValue<{
        items?: string[];
        next_after?: string | null;
        has_more?: boolean;
      }>(parts.join("/"));
      const items = Array.isArray(result?.items) ? result.items : [];
      suffixes.push(...items.filter((item): item is string => typeof item === "string"));
      if (!result?.has_more || !result.next_after) {
        return suffixes;
      }
      after = result.next_after;
    }
  }
}
