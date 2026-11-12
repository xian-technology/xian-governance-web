import { isExpiringSoon } from "../shared/format";
import type { GovernanceLayer, ProposalStatus, ProposalSummary } from "../shared/types";

export interface ProposalFilters {
  layer: "all" | GovernanceLayer;
  status: "all" | ProposalStatus;
  type: "all" | string;
  needsVote: boolean;
  emergency: boolean;
  expiringSoon: boolean;
  search: string;
}

export const DEFAULT_FILTERS: ProposalFilters = {
  layer: "all",
  status: "all",
  type: "all",
  needsVote: false,
  emergency: false,
  expiringSoon: false,
  search: ""
};

export function matchesFilters(proposal: ProposalSummary, filters: ProposalFilters): boolean {
  return (
    matchesFacet(filters.layer, proposal.layer) &&
    matchesFacet(filters.status, proposal.status) &&
    matchesFacet(filters.type, proposal.type) &&
    matchesToggles(proposal, filters) &&
    matchesSearch(proposal, filters.search)
  );
}

function matchesFacet<T extends string>(wanted: "all" | T, actual: T): boolean {
  return wanted === "all" || wanted === actual;
}

function matchesToggles(proposal: ProposalSummary, filters: ProposalFilters): boolean {
  return (
    (!filters.needsVote || Boolean(proposal.viewer?.eligible)) &&
    (!filters.emergency || Boolean(proposal.emergency)) &&
    (!filters.expiringSoon || (proposal.status === "pending" && isExpiringSoon(proposal.expiresAt)))
  );
}

function matchesSearch(proposal: ProposalSummary, search: string): boolean {
  const needle = search.trim().toLowerCase();
  const haystack = [
    proposal.title,
    proposal.type,
    proposal.proposer ?? "",
    `#${proposal.proposalId}`,
    proposal.layer
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
