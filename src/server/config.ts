import type { NetworkConfig } from "../shared/types.js";

export interface AppConfig {
  host: string;
  port: number;
  networks: NetworkConfig[];
  corsOrigins: string[];
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rpcUrl = env.XIAN_RPC_URL ?? "http://127.0.0.1:26657";
  const dashboardUrl = env.XIAN_DASHBOARD_URL ?? "http://127.0.0.1:8080";
  const chainId = env.XIAN_CHAIN_ID;
  const networkId = env.XIAN_NETWORK_ID ?? "local";
  const networkName = env.XIAN_NETWORK_NAME ?? "Local Xian";
  const host = normalizeBindHost(
    env.XIAN_GOVERNANCE_HOST ?? env.HOST ?? DEFAULT_HOST,
  );
  const corsOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    host,
    port: Number(env.PORT ?? DEFAULT_PORT),
    corsOrigins,
    networks: [
      {
        id: networkId,
        name: networkName,
        chainId,
        rpcUrl,
        dashboardUrl,
        governanceContract: env.XIAN_GOVERNANCE_CONTRACT ?? "governance",
        membershipContract: env.XIAN_MEMBERSHIP_CONTRACT ?? "validators"
      }
    ]
  };
}

export function formatListenUrl(host: string, port: number): string {
  const normalizedHost = normalizeBindHost(host);
  const urlHost = normalizedHost.includes(":")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `http://${urlHost}:${port}`;
}

function normalizeBindHost(host: string): string {
  const trimmed = host.trim();
  if (trimmed.length === 0) {
    return DEFAULT_HOST;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
