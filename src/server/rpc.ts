import { XianClient } from "@xian-tech/client";
import type {
  XianEventListOptions,
  XianIndexedEvent,
  XianPageOptions,
  XianRecentEventsResult
} from "@xian-tech/client";

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
    return this.client.abciValue<T>(path);
  }

  async listEvents(
    contract: string,
    event: string,
    options?: XianEventListOptions,
  ): Promise<XianIndexedEvent[]> {
    return this.client.listEvents(contract, event, options);
  }

  async recentEvents(options?: XianPageOptions): Promise<XianRecentEventsResult> {
    return this.client.getRecentEvents(options);
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
