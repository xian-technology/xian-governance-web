import { describe, expect, it } from "vitest";

import { formatListenUrl, loadConfig } from "../src/server/config";

describe("loadConfig", () => {
  it("defaults to the local IPv4 loopback bind host", () => {
    const config = loadConfig({});

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4173);
  });

  it("uses the app-specific bind host before the generic host", () => {
    const config = loadConfig({
      HOST: "0.0.0.0",
      XIAN_GOVERNANCE_HOST: "::1"
    });

    expect(config.host).toBe("::1");
  });

  it("normalizes bracketed IPv6 bind hosts for Node listen", () => {
    const config = loadConfig({ XIAN_GOVERNANCE_HOST: "[::1]" });

    expect(config.host).toBe("::1");
  });

  it("preserves bracketed IPv6 RPC and dashboard URLs", () => {
    const config = loadConfig({
      XIAN_RPC_URL: "http://[::1]:26657",
      XIAN_DASHBOARD_URL: "http://[2001:db8::1]:8080"
    });

    expect(config.networks[0]?.rpcUrl).toBe("http://[::1]:26657");
    expect(config.networks[0]?.dashboardUrl).toBe(
      "http://[2001:db8::1]:8080",
    );
  });
});

describe("formatListenUrl", () => {
  it("formats IPv4 and DNS bind hosts without brackets", () => {
    expect(formatListenUrl("127.0.0.1", 4173)).toBe(
      "http://127.0.0.1:4173",
    );
    expect(formatListenUrl("localhost", 4173)).toBe(
      "http://localhost:4173",
    );
  });

  it("formats IPv6 bind hosts with brackets", () => {
    expect(formatListenUrl("::1", 4173)).toBe("http://[::1]:4173");
    expect(formatListenUrl("[2001:db8::1]", 4173)).toBe(
      "http://[2001:db8::1]:4173",
    );
  });
});
