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
  if (filters.layer !== "all" && proposal.layer !== filters.layer) return false;
  if (filters.status !== "all" && proposal.status !== filters.status) return false;
  if (filters.type !== "all" && proposal.type !== filters.type) return false;
  if (filters.needsVote && !proposal.viewer?.eligible) return false;
  if (filters.emergency && !proposal.emergency) return false;
  if (filters.expiringSoon && !(proposal.status === "pending" && isExpiringSoon(proposal.expiresAt))) {
    return false;
  }
  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = [
      proposal.title,
      proposal.type,
      proposal.proposer ?? "",
      `#${proposal.proposalId}`,
      proposal.layer
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}
