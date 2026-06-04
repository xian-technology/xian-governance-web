import { XianClient } from "@xian-tech/client";
import type {
  XianEventListOptions,
  XianIndexedEvent,
  XianPageOptions,
  XianRecentEventsResult
} from "@xian-tech/client";

import { isRecord } from "../shared/format.js";
import type { ChainStatus, NetworkConfig } from "../shared/types.js";

const READ_RETRY_DELAYS_MS = [250, 750];

export class XianReadClient {
  readonly client: XianClient;

  constructor(readonly network: NetworkConfig) {
    this.client = new XianClient({
      rpcUrl: network.rpcUrl,
      dashboardUrl: network.dashboardUrl
    });
  }

  async getChainStatus(): Promise<ChainStatus> {
    const status = await withReadRetry(() => this.client.getStatus());
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
    return withReadRetry(
      () =>
        this.client.call({
          sender: "governance-web",
          contract,
          function: method,
          kwargs
        }) as Promise<T>,
    );
  }

  async getState<T = unknown>(
    contract: string,
    variable: string,
    keys: string[] = [],
  ): Promise<T | null> {
    try {
      return (await withReadRetry(() =>
        this.client.getState(contract, variable, keys),
      )) as T | null;
    } catch {
      return null;
    }
  }

  async abciValue<T = unknown>(path: string): Promise<T | null> {
    return withReadRetry(() => this.client.abciValue<T>(path));
  }

  async listEvents(
    contract: string,
    event: string,
    options?: XianEventListOptions,
  ): Promise<XianIndexedEvent[]> {
    return withReadRetry(() => this.client.listEvents(contract, event, options));
  }

  async recentEvents(options?: XianPageOptions): Promise<XianRecentEventsResult> {
    return withReadRetry(() => this.client.getRecentEvents(options));
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

async function withReadRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= READ_RETRY_DELAYS_MS.length || !isRetryableReadError(error)) {
        throw error;
      }
      await sleep(READ_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
  throw lastError;
}

function isRetryableReadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  return (
    name.includes("transport") ||
    name.includes("timeout") ||
    message.includes("request failed") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("returned 502") ||
    message.includes("returned 503") ||
    message.includes("returned 504")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
