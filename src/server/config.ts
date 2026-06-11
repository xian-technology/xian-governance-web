import type { NetworkConfig } from "../shared/types.js";

export interface AppConfig {
  port: number;
  networks: NetworkConfig[];
  corsOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rpcUrl = env.XIAN_RPC_URL ?? "http://127.0.0.1:26657";
  const dashboardUrl = env.XIAN_DASHBOARD_URL ?? "http://127.0.0.1:8080";
  const chainId = env.XIAN_CHAIN_ID;
  const networkId = env.XIAN_NETWORK_ID ?? "local";
  const networkName = env.XIAN_NETWORK_NAME ?? "Local Xian";
  const corsOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    port: Number(env.PORT ?? 4173),
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
