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
  lastJailedAt?: string | null;
  lastUnjailedAt?: string | null;
  totalSlashed?: number | string | null;
  lastSlashedAt?: string | null;
  lastEvidenceId?: string | null;
  lastEvidenceType?: string | null;
  lastEvidenceHeight?: number | null;
  lastEvidenceAt?: string | null;
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
  pendingUnbondCount?: number | null;
  pendingUnbondTotal?: number | string | null;
  nextUnbondUnlockAt?: string | null;
  pendingRegistration?: boolean;
  pendingLeaveAt?: string | null;
  lastRebalanceEpoch?: number | null;
  eligibleAtEpoch?: number | null;
  selectionEligibleAtLastRebalance?: boolean;
  registeredAt?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
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

/**
 * Per-account view of a proposal, computed server-side from the snapshotted
 * vote matrix when a viewer account is supplied. Lets the UI answer
 * "can this connected validator still act on this proposal?" without
 * re-deriving eligibility from raw state on the client.
 */
export interface ProposalViewerState {
  account: string;
  eligible: boolean;
  hasVoted: boolean;
  vote: "yes" | "no" | null;
  weight: number;
  isProposer: boolean;
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
  viewer?: ProposalViewerState | null;
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
  createdAt?: string | null;
  approvedAt?: string | null;
  appliedAtNanos?: number | null;
  appliedBlockHeight?: number | null;
  appliedBlockHash?: string | null;
  executionHash?: string | null;
}

/**
 * Protocol-governance parameters read from `governance.metadata`, plus the
 * derived approval ratios. Used by the create-proposal wizard to validate
 * state-patch activation heights and to display thresholds.
 */
export interface GovernanceParameters {
  approvalThresholdNumerator: number | null;
  approvalThresholdDenominator: number | null;
  emergencyThresholdNumerator: number | null;
  emergencyThresholdDenominator: number | null;
  proposalExpiryDays: number | null;
  minPatchDelayBlocks: number | null;
  emergencyPatchDelayBlocks: number | null;
}

export interface NetworkPolicy {
  membership: Record<string, unknown> | null;
  governance: GovernanceParameters;
  registrationFee: number | string | null;
  voteTypes: string[];
  recoveryVoteTypes: string[];
}

export interface GovernanceOverview {
  network: NetworkConfig;
  chain: ChainStatus;
  activeValidators: number;
  totalVotingWeight: number;
  pendingProposals: number;
  expiringSoon: number;
  scheduledPatches: number;
  governance: GovernanceParameters;
}

export interface ProposalListResponse {
  proposals: ProposalSummary[];
}

export interface ValidatorListResponse {
  active: ValidatorRecord[];
  candidates: ValidatorRecord[];
  inactive: ValidatorRecord[];
}

export interface StatePatchListResponse {
  patches: StatePatchRecord[];
}

export interface GovernanceHistoryResponse {
  available: boolean;
  events: GovernanceHistoryEvent[];
}
