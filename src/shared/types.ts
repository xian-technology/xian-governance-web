export type GovernanceLayer = "protocol" | "validator";

export type ProposalStatus =
  | "pending"
  | "approved"
  | "executed"
  | "rejected"
  | "expired"
  | "applied"
  | "unknown";

export interface NetworkConfig {
  id: string;
  name: string;
  chainId?: string;
  rpcUrl: string;
  dashboardUrl?: string;
  governanceContract: string;
  membershipContract: string;
}

export interface ChainStatus {
  chainId: string | null;
  latestHeight: number | null;
  catchingUp: boolean | null;
  nodeMoniker: string | null;
}

export interface ValidatorRecord {
  account: string;
  moniker?: string | null;
  status?: string | null;
  active: boolean;
  jailed?: boolean;
  jailReason?: string | null;
  power: number;
  requestedPower?: number | null;
  rewardKey?: string | null;
  networkEndpoint?: string | null;
  metadataUri?: string | null;
  registrationBond?: number | string | null;
  selfBond?: number | string | null;
  totalDelegated?: number | string | null;
  totalBond?: number | string | null;
  commissionBps?: number | null;
  delegatorCount?: number | null;
}

export interface VoteRecord {
  proposalId: number;
  layer: GovernanceLayer;
  voter: string;
  vote: "yes" | "no" | null;
  weight: number;
  txHash?: string | null;
  blockHeight?: number | null;
  votedAt?: string | null;
}

export interface GovernanceHistoryEvent {
  id?: number | null;
  layer: GovernanceLayer | "unknown";
  proposalId?: number | null;
  contract: string | null;
  event: string;
  title: string;
  txHash?: string | null;
  blockHeight?: number | null;
  createdAt?: string | null;
  actor?: string | null;
  data: Record<string, unknown>;
}

export interface ProposalSummary {
  networkId: string;
  layer: GovernanceLayer;
  proposalId: number;
  kind: string;
  type: string;
  title: string;
  summary: string;
  status: ProposalStatus;
  proposer?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  yesVotes: number;
  noVotes: number;
  yesWeight: number;
  noWeight: number;
  requiredYesVotes: number;
  requiredYesWeight: number;
  totalWeightSnapshot: number;
  emergency?: boolean;
  patchId?: string | null;
  activationHeight?: number | null;
  targetContract?: string | null;
  targetFunction?: string | null;
  arg?: unknown;
  historyAvailable?: boolean;
  lastEventAt?: string | null;
  lastTxHash?: string | null;
  lastBlockHeight?: number | null;
  eventCount?: number;
}

export interface ProposalDetail extends ProposalSummary {
  votes: VoteRecord[];
  payload: unknown;
  timeline?: GovernanceHistoryEvent[];
  uri?: string | null;
  bundleHash?: string | null;
  approvedAt?: string | null;
  executedAt?: string | null;
  result?: unknown;
}

export interface StatePatchRecord {
  patchId: string;
  proposalId: number;
  status: string;
  summary?: string | null;
  uri?: string | null;
  bundleHash?: string | null;
  activationHeight?: number | null;
  emergency?: boolean;
  appliedBlockHeight?: number | null;
  appliedBlockHash?: string | null;
  executionHash?: string | null;
}

export interface GovernanceOverview {
  network: NetworkConfig;
  chain: ChainStatus;
  activeValidators: number;
  totalVotingWeight: number;
  pendingProposals: number;
  expiringSoon: number;
  scheduledPatches: number;
}

export interface ProposalListResponse {
  proposals: ProposalSummary[];
}

export interface ValidatorListResponse {
  active: ValidatorRecord[];
  candidates: ValidatorRecord[];
}

export interface StatePatchListResponse {
  patches: StatePatchRecord[];
}

export interface GovernanceHistoryResponse {
  available: boolean;
  events: GovernanceHistoryEvent[];
}
