import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, matchesFilters, type ProposalFilters } from "../src/client/proposalFilters";
import type { ProposalSummary } from "../src/shared/types";

const soon = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const later = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const proposal = (patch: Partial<ProposalSummary> = {}): ProposalSummary =>
  ({
    networkId: "local",
    layer: "protocol",
    proposalId: 12,
    kind: "contract_call",
    type: "contract_call",
    title: "Raise the gas limit",
    summary: "",
    status: "pending",
    proposer: "alice",
    emergency: false,
    expiresAt: later(),
    viewer: null,
    ...patch
  }) as ProposalSummary;

const shows = (filters: Partial<ProposalFilters>, patch: Partial<ProposalSummary> = {}) =>
  matchesFilters(proposal(patch), { ...DEFAULT_FILTERS, ...filters });

describe("proposal list filters", () => {
  it("shows every proposal with the default filters", () => {
    expect(shows({})).toBe(true);
    expect(shows({}, { status: "executed", layer: "validator" })).toBe(true);
  });

  it("filters by layer, status and type", () => {
    expect(shows({ layer: "protocol" })).toBe(true);
    expect(shows({ layer: "validator" })).toBe(false);
    expect(shows({ status: "pending" })).toBe(true);
    expect(shows({ status: "approved" })).toBe(false);
    expect(shows({ type: "contract_call" })).toBe(true);
    expect(shows({ type: "state_patch" })).toBe(false);
  });

  it("keeps only proposals the connected account can vote on when asked", () => {
    const viewer = { account: "me", eligible: true, hasVoted: false, vote: null, weight: 1, isProposer: false };
    expect(shows({ needsVote: true }, { viewer })).toBe(true);
    expect(shows({ needsVote: true }, { viewer: { ...viewer, eligible: false } })).toBe(false);
    expect(shows({ needsVote: true })).toBe(false);
  });

  it("keeps only emergency proposals when asked", () => {
    expect(shows({ emergency: true }, { emergency: true })).toBe(true);
    expect(shows({ emergency: true })).toBe(false);
  });

  it("keeps only pending proposals expiring within the window when asked", () => {
    expect(shows({ expiringSoon: true }, { expiresAt: soon() })).toBe(true);
    expect(shows({ expiringSoon: true }, { expiresAt: later() })).toBe(false);
    expect(shows({ expiringSoon: true }, { expiresAt: soon(), status: "approved" })).toBe(false);
  });

  it("searches title, type, proposer, number and layer case-insensitively", () => {
    for (const search of ["gas LIMIT", "contract_call", "ALICE", "#12", "protocol", "  gas  "]) {
      expect(shows({ search })).toBe(true);
    }
    expect(shows({ search: "#13" })).toBe(false);
    expect(shows({ search: "bob" })).toBe(false);
    expect(shows({ search: "   " })).toBe(true);
    expect(shows({ search: "bob" }, { proposer: null })).toBe(false);
  });
});
