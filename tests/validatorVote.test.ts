import { describe, expect, it } from "vitest";

import {
  buildValidatorArg,
  getVoteTypeSpec,
  VOTE_TYPE_SPECS
} from "../src/client/validatorVote";

describe("validator vote arg builder", () => {
  it("returns a bare account string for account-shaped votes", () => {
    const spec = getVoteTypeSpec("add_member")!;
    expect(buildValidatorArg(spec, { account: "abc123def456" }, "")).toBe("abc123def456");
  });

  it("requires the account field", () => {
    const spec = getVoteTypeSpec("remove_member")!;
    expect(() => buildValidatorArg(spec, {}, "")).toThrow(/required/i);
  });

  it("builds and validates a slash_member object", () => {
    const spec = getVoteTypeSpec("slash_member")!;
    expect(
      buildValidatorArg(spec, { member: "node-1-account", slash_bps: "500" }, ""),
    ).toEqual({ member: "node-1-account", slash_bps: 500 });
  });

  it("rejects out-of-range basis points", () => {
    const spec = getVoteTypeSpec("slash_member")!;
    expect(() =>
      buildValidatorArg(spec, { member: "node-1-account", slash_bps: "20000" }, ""),
    ).toThrow(/between 1 and 10000/);
  });

  it("rejects zero for slash_member basis points", () => {
    const spec = getVoteTypeSpec("slash_member")!;
    expect(() =>
      buildValidatorArg(spec, { member: "node-1-account", slash_bps: "0" }, ""),
    ).toThrow(/between 1 and 10000/);
  });

  it("rejects non-positive validator power", () => {
    const spec = getVoteTypeSpec("set_member_power")!;
    expect(() =>
      buildValidatorArg(spec, { member: "node-1-account", power: "0" }, ""),
    ).toThrow(/>= 1/);
  });

  it("rejects non-positive update_policy fields that must be positive", () => {
    const spec = getVoteTypeSpec("update_policy")!;
    expect(() => buildValidatorArg(spec, { max_validators: "0" }, "")).toThrow(
      />= 1/,
    );
  });

  it("only includes filled update_policy fields and coerces types", () => {
    const spec = getVoteTypeSpec("update_policy")!;
    const arg = buildValidatorArg(
      spec,
      { max_validators: "12", manual_override_enabled: "true", power_mode: "requested" },
      "",
    );
    expect(arg).toEqual({
      max_validators: 12,
      manual_override_enabled: true,
      power_mode: "requested"
    });
  });

  it("parses raw JSON for raw-shaped votes", () => {
    const spec = getVoteTypeSpec("change_types")!;
    expect(buildValidatorArg(spec, {}, '["add_member","topic_vote"]')).toEqual([
      "add_member",
      "topic_vote"
    ]);
  });

  it("covers every chain-supported vote type", () => {
    const supported = [
      "add_member",
      "remove_member",
      "jail_member",
      "unjail_member",
      "slash_member",
      "set_member_power",
      "change_registration_fee",
      "reward_change",
      "dao_payout",
      "chi_cost_change",
      "change_types",
      "update_policy",
      "topic_vote"
    ];
    const present = new Set(VOTE_TYPE_SPECS.map((spec) => spec.value));
    for (const type of supported) {
      expect(present.has(type)).toBe(true);
    }
  });
});
