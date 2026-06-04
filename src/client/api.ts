import type {
  GovernanceLayer,
  GovernanceHistoryResponse,
  GovernanceOverview,
  NetworkConfig,
  NetworkPolicy,
  ProposalDetail,
  ProposalListResponse,
  StatePatchListResponse,
  ValidatorListResponse,
  VoteRecord
} from "../shared/types";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getNetworks() {
  return apiGet<{ networks: NetworkConfig[] }>("/api/networks");
}

export function getOverview(networkId: string) {
  return apiGet<GovernanceOverview>(`/api/networks/${networkId}/overview`);
}

export function getProposals(networkId: string, account?: string | null) {
  return apiGet<ProposalListResponse>(
    `/api/networks/${networkId}/proposals${accountQuery(account)}`,
  );
}

export function getPolicy(networkId: string) {
  return apiGet<NetworkPolicy>(`/api/networks/${networkId}/policy`);
}

export function getHistory(networkId: string) {
  return apiGet<GovernanceHistoryResponse>(`/api/networks/${networkId}/history`);
}

export function getProposal(
  networkId: string,
  layer: GovernanceLayer,
  proposalId: number,
  account?: string | null,
) {
  return apiGet<ProposalDetail>(
    `/api/networks/${networkId}/proposals/${layer}/${proposalId}${accountQuery(account)}`,
  );
}

function accountQuery(account?: string | null): string {
  return account ? `?account=${encodeURIComponent(account)}` : "";
}

export function getProposalVotes(
  networkId: string,
  layer: GovernanceLayer,
  proposalId: number,
) {
  return apiGet<{ votes: VoteRecord[] }>(
    `/api/networks/${networkId}/proposals/${layer}/${proposalId}/votes`,
  );
}

export function getValidators(networkId: string) {
  return apiGet<ValidatorListResponse>(`/api/networks/${networkId}/validators`);
}

export function getStatePatches(networkId: string) {
  return apiGet<StatePatchListResponse>(`/api/networks/${networkId}/state-patches`);
}

export function simulate(networkId: string, body: unknown) {
  return apiPost<unknown>(`/api/networks/${networkId}/simulate`, body);
}
