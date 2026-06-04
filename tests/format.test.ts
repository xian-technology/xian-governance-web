import { describe, expect, it } from "vitest";

import { extractUrls, titleFromPayload } from "../src/shared/format";

describe("titleFromPayload", () => {
  it("describes contract calls", () => {
    expect(
      titleFromPayload("contract_call", "contract_call", {
        target_contract: "currency",
        target_function: "transfer"
      }),
    ).toBe("currency.transfer");
  });

  it("describes state patches", () => {
    expect(
      titleFromPayload("state_patch", "state_patch", { patch_id: "fix-balances" }),
    ).toBe("State patch fix-balances");
  });

  it("describes a slash_member validator vote from its arg", () => {
    const title = titleFromPayload("validator_vote", "slash_member", {
      member: "abcdef0123456789",
      slash_bps: 500
    });
    expect(title).toContain("Slash validator");
    expect(title).toContain("500 bps");
  });

  it("summarizes update_policy fields", () => {
    const title = titleFromPayload("validator_vote", "update_policy", {
      max_validators: 12,
      power_mode: "requested"
    });
    expect(title.startsWith("Update policy")).toBe(true);
    expect(title).toContain("max_validators=12");
  });

  it("renders a topic vote", () => {
    expect(
      titleFromPayload("validator_vote", "topic_vote", { topic: "Increase rewards" }),
    ).toBe("Topic: Increase rewards");
  });
});

describe("extractUrls", () => {
  it("pulls http(s) links from free text and trims trailing punctuation", () => {
    expect(
      extractUrls("See https://github.com/xian/governance/pull/12, and http://example.com."),
    ).toEqual([
      "https://github.com/xian/governance/pull/12",
      "http://example.com/"
    ]);
  });

  it("ignores non-http URIs", () => {
    expect(extractUrls("ipfs://abc and ftp://host/file")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractUrls(null)).toEqual([]);
    expect(extractUrls("")).toEqual([]);
  });
});
