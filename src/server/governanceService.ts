import type { XianIndexedEvent } from "@xian-tech/client";

import { asNumber, asString, isRecord, titleFromPayload } from "../shared/format.js";
import type {
  GovernanceHistoryEvent,
  GovernanceHistoryResponse,
  GovernanceLayer,
  GovernanceOverview,
  NetworkConfig,
  ProposalDetail,
  ProposalListResponse,
  ProposalStatus,
  ProposalSummary,
  StatePatchListResponse,
  StatePatchRecord,
  ValidatorListResponse,
  ValidatorRecord,
  VoteRecord
} from "../shared/types.js";
import { XianReadClient } from "./rpc.js";

const PROTOCOL_EVENTS = [
  "ProposalSubmitted",
  "ProposalVoted",
  "ProposalApproved",
  "ProposalExecuted",
  "StatePatchScheduled"
] as const;

const VALIDATOR_EVENTS = [
  "ValidatorProposalSubmitted",
  "ValidatorProposalVoted",
  "ValidatorProposalApproved",
  "ValidatorProposalRejected",
  "ValidatorProposalExpired"
] as const;

export class GovernanceService {
  private readonly clients = new Map<string, XianReadClient>();

  constructor(readonly networks: NetworkConfig[]) {
    for (const network of networks) {
      this.clients.set(network.id, new XianReadClient(network));
    }
  }

  listNetworks(): NetworkConfig[] {
    return this.networks;
  }

  async overview(networkId: string): Promise<GovernanceOverview> {
    const network = this.networkById(networkId);
    const client = this.clientFor(networkId);
    const [chain, validators, proposals, patches] = await Promise.all([
      client.getChainStatus(),
      this.validators(networkId),
      this.proposals(networkId),
      this.statePatches(networkId)
    ]);
    const activeValidators = validators.active.length;
    const totalVotingWeight = validators.active.reduce(
      (sum, validator) => sum + validator.power,
      0,
    );
    const pending = proposals.proposals.filter(
      (proposal) => proposal.status === "pending",
    );

    return {
      network,
      chain,
      activeValidators,
      totalVotingWeight,
      pendingProposals: pending.length,
      expiringSoon: pending.filter((proposal) => expiresSoon(proposal.expiresAt)).length,
      scheduledPatches: patches.patches.filter((patch) => patch.status === "approved")
        .length
    };
  }

  async proposals(networkId: string): Promise<ProposalListResponse> {
    const [protocol, validator] = await Promise.all([
      this.protocolProposals(networkId),
      this.validatorProposals(networkId)
    ]);
    const proposals = await this.enrichSummariesWithRecentHistory(
      networkId,
      [...protocol, ...validator],
    );
    return {
      proposals: proposals.sort((left, right) => {
        const leftTime = Date.parse(left.createdAt ?? "") || 0;
        const rightTime = Date.parse(right.createdAt ?? "") || 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return right.proposalId - left.proposalId;
      })
    };
  }

  async history(networkId: string): Promise<GovernanceHistoryResponse> {
    return this.recentGovernanceHistory(networkId);
  }

  async proposal(
    networkId: string,
    layer: GovernanceLayer,
    proposalId: number,
  ): Promise<ProposalDetail | null> {
    if (layer === "protocol") {
      return this.protocolProposal(networkId, proposalId);
    }
    return this.validatorProposal(networkId, proposalId);
  }

  async proposalVotes(
    networkId: string,
    layer: GovernanceLayer,
    proposalId: number,
  ): Promise<VoteRecord[]> {
    const proposal = await this.proposal(networkId, layer, proposalId);
    return proposal?.votes ?? [];
  }

  async validators(networkId: string): Promise<ValidatorListResponse> {
    const client = this.clientFor(networkId);
    const [activeRaw, candidatesRaw] = await Promise.all([
      client.abciValue<unknown[]>("/masternodes_active").catch(() => []),
      client.abciValue<unknown[]>("/masternodes_candidates").catch(() => [])
    ]);
    return {
      active: Array.isArray(activeRaw)
        ? activeRaw.map((record) => normalizeValidator(record, true))
        : [],
      candidates: Array.isArray(candidatesRaw)
        ? candidatesRaw.map((record) => normalizeValidator(record, false))
        : []
    };
  }

  async statePatches(networkId: string): Promise<StatePatchListResponse> {
    const protocol = await this.protocolProposals(networkId);
    const client = this.clientFor(networkId);
    const patchIds = protocol
      .map((proposal) => proposal.patchId)
      .filter((patchId): patchId is string => Boolean(patchId));
    const patches = await Promise.all(
      patchIds.map(async (patchId) => {
        try {
          const patch = await client.call<unknown>(
            this.networkById(networkId).governanceContract,
            "get_patch",
            { patch_id: patchId },
          );
          return normalizePatch(patch);
        } catch {
          return null;
        }
      }),
    );
    return {
      patches: patches.filter((patch): patch is StatePatchRecord => patch !== null)
    };
  }

  async simulate(
    networkId: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const client = this.clientFor(networkId);
    return client.client.simulate({
      sender: String(payload.sender ?? "governance-web"),
      contract: String(payload.contract),
      function: String(payload.function),
      kwargs: isRecord(payload.kwargs) ? payload.kwargs : {}
    });
  }

  private async protocolProposals(networkId: string): Promise<ProposalDetail[]> {
    const client = this.clientFor(networkId);
    const network = this.networkById(networkId);
    const count = asNumber(
      await client.getState(network.governanceContract, "proposal_count"),
    );
    const proposals: ProposalDetail[] = [];
    for (let proposalId = 1; proposalId <= count; proposalId += 1) {
      const proposal = await this.protocolProposal(networkId, proposalId);
      if (proposal) {
        proposals.push(proposal);
      }
    }
    return proposals;
  }

  private async protocolProposal(
    networkId: string,
    proposalId: number,
  ): Promise<ProposalDetail | null> {
    const client = this.clientFor(networkId);
    const network = this.networkById(networkId);
    let raw: unknown;
    try {
      raw = await client.call(network.governanceContract, "get_proposal", {
        proposal_id: proposalId
      });
    } catch {
      return null;
    }
    if (!isRecord(raw)) {
      return null;
    }
    const kind = String(raw.kind ?? "unknown");
    const payload = {
      patch_id: raw.patch_id,
      bundle_hash: raw.bundle_hash,
      activation_height: raw.activation_height,
      uri: raw.uri,
      target_contract: raw.target_contract,
      target_function: raw.target_function,
      kwargs: raw.kwargs
    };
    const votes = await this.protocolVoteRecords(networkId, proposalId);
    const summary = normalizeProposal({
      networkId,
      layer: "protocol",
      proposalId,
      kind,
      type: kind,
      summary: asString(raw.summary) ?? "",
      proposer: asString(raw.proposer),
      status: normalizeStatus(raw.status),
      createdAt: normalizeDate(raw.created_at),
      expiresAt: normalizeDate(raw.expires_at),
      yesVotes: asNumber(raw.yes_votes),
      noVotes: asNumber(raw.no_votes),
      yesWeight: asNumber(raw.yes_weight),
      noWeight: asNumber(raw.no_weight),
      requiredYesVotes: asNumber(raw.required_yes_votes),
      requiredYesWeight: asNumber(raw.required_yes_weight),
      totalWeightSnapshot: asNumber(raw.total_weight_snapshot),
      emergency: raw.emergency === true,
      patchId: asString(raw.patch_id),
      activationHeight: maybeNumber(raw.activation_height),
      targetContract: asString(raw.target_contract),
      targetFunction: asString(raw.target_function),
      payload
    });
    const history = await this.proposalHistory(networkId, "protocol", proposalId);
    const historySummary = proposalHistorySummary(history.events, history.available);
    return {
      ...summary,
      ...historySummary,
      votes: mergeVoteHistory(votes, history.events, "protocol", proposalId),
      timeline: history.events,
      payload,
      uri: asString(raw.uri),
      bundleHash: asString(raw.bundle_hash),
      approvedAt: normalizeDate(raw.approved_at),
      executedAt: normalizeDate(raw.executed_at)
    };
  }

  private async protocolVoteRecords(
    networkId: string,
    proposalId: number,
  ): Promise<VoteRecord[]> {
    const client = this.clientFor(networkId);
    const network = this.networkById(networkId);
    const weightSuffixes = await client
      .scanKeySuffixes(
        `${network.governanceContract}.proposal_vote_weights:${proposalId}:`,
      )
      .catch(() => []);
    const currentMembers = await client
      .call<string[]>(network.governanceContract, "get_members", {})
      .catch(() => []);
    const voters = Array.from(new Set([...currentMembers, ...weightSuffixes]));
    const records = await Promise.all(
      voters.map(async (voter): Promise<VoteRecord> => {
        const [vote, weight] = await Promise.all([
          client.getState<string | null>(
            network.governanceContract,
            "proposal_votes",
            [String(proposalId), voter],
          ),
          client.getState<number | string | null>(
            network.governanceContract,
            "proposal_vote_weights",
            [String(proposalId), voter],
          )
        ]);
        return {
          proposalId,
          layer: "protocol",
          voter,
          vote: vote === "yes" || vote === "no" ? vote : null,
          weight: asNumber(weight)
        };
      }),
    );
    return records.filter((record) => record.weight > 0 || record.vote !== null);
  }

  private async validatorProposals(networkId: string): Promise<ProposalDetail[]> {
    const client = this.clientFor(networkId);
    const network = this.networkById(networkId);
    const count = asNumber(
      await client.getState(network.membershipContract, "total_votes"),
    );
    const proposals: ProposalDetail[] = [];
    for (let proposalId = 1; proposalId <= count; proposalId += 1) {
      const proposal = await this.validatorProposal(networkId, proposalId);
      if (proposal) {
        proposals.push(proposal);
      }
    }
    return proposals;
  }

  private async validatorProposal(
    networkId: string,
    proposalId: number,
  ): Promise<ProposalDetail | null> {
    const client = this.clientFor(networkId);
    const raw = await client
      .abciValue<unknown>(`/masternodes_vote/${proposalId}`)
      .catch(() => null);
    if (!isRecord(raw)) {
      return null;
    }
    const type = String(raw.type ?? "unknown");
    const votesRaw = await client
      .abciValue<unknown[]>(`/masternodes_vote_records/${proposalId}`)
      .catch(() => []);
    const votes = Array.isArray(votesRaw)
      ? votesRaw.map((record) => normalizeVoteRecord(record, "validator", proposalId))
      : [];
    const summary = normalizeProposal({
      networkId,
      layer: "validator",
      proposalId,
      kind: "validator_vote",
      type,
      summary: type.replaceAll("_", " "),
      proposer: Array.isArray(raw.voters) ? asString(raw.voters[0]) : null,
      status: normalizeStatus(raw.status),
      createdAt: normalizeDate(raw.created_at),
      expiresAt: normalizeDate(raw.expiry),
      yesVotes: asNumber(raw.yes),
      noVotes: asNumber(raw.no),
      yesWeight: asNumber(raw.yes_weight),
      noWeight: asNumber(raw.no_weight),
      requiredYesVotes: asNumber(raw.required_yes_votes),
      requiredYesWeight: asNumber(raw.required_yes_weight),
      totalWeightSnapshot: asNumber(raw.total_weight_snapshot),
      arg: raw.arg,
      payload: raw
    });
    const history = await this.proposalHistory(networkId, "validator", proposalId);
    const historySummary = proposalHistorySummary(history.events, history.available);
    return {
      ...summary,
      ...historySummary,
      votes: mergeVoteHistory(votes, history.events, "validator", proposalId),
      timeline: history.events,
      payload: raw,
      result: raw.result
    };
  }

  private async enrichSummariesWithRecentHistory(
    networkId: string,
    proposals: ProposalSummary[],
  ): Promise<ProposalSummary[]> {
    const history = await this.recentGovernanceHistory(networkId);
    if (!history.available || history.events.length === 0) {
      return proposals;
    }
    const byProposal = new Map<string, GovernanceHistoryEvent[]>();
    for (const event of history.events) {
      if (event.proposalId == null || event.layer === "unknown") {
        continue;
      }
      const key = `${event.layer}-${event.proposalId}`;
      const current = byProposal.get(key) ?? [];
      current.push(event);
      byProposal.set(key, current);
    }
    return proposals.map((proposal) => {
      const events = byProposal.get(`${proposal.layer}-${proposal.proposalId}`) ?? [];
      return events.length
        ? { ...proposal, ...proposalHistorySummary(events, true) }
        : proposal;
    });
  }

  private async recentGovernanceHistory(
    networkId: string,
  ): Promise<GovernanceHistoryResponse> {
    const client = this.clientFor(networkId);
    const network = this.networkById(networkId);
    try {
      const recent = await client.recentEvents({ limit: 100 });
      if (!recent.available) {
        return { available: false, events: [] };
      }
      const events = recent.items
        .filter((event) =>
          event.contract === network.governanceContract ||
          event.contract === network.membershipContract
        )
        .map((event) =>
          normalizeHistoryEvent(
            event,
            event.contract === network.governanceContract ? "protocol" : "validator",
          )
        )
        .sort(compareHistoryEventsDesc)
        .slice(0, 30);
      return { available: true, events };
    } catch {
      return { available: false, events: [] };
    }
  }

  private async proposalHistory(
    networkId: string,
    layer: GovernanceLayer,
    proposalId: number,
  ): Promise<{ available: boolean; events: GovernanceHistoryEvent[] }> {
    const client = this.clientFor(networkId);
    const network = this.networkById(networkId);
    const contract =
      layer === "protocol"
        ? network.governanceContract
        : network.membershipContract;
    const eventNames = layer === "protocol" ? PROTOCOL_EVENTS : VALIDATOR_EVENTS;
    let available = false;
    const events: GovernanceHistoryEvent[] = [];
    for (const eventName of eventNames) {
      try {
        const rawEvents = await client.listEvents(contract, eventName, { limit: 200 });
        available = true;
        for (const rawEvent of rawEvents) {
          const event = normalizeHistoryEvent(rawEvent, layer);
          if (event.proposalId === proposalId) {
            events.push(event);
          }
        }
      } catch {
        // Direct RPC mode still works without BDS; history stays unavailable.
      }
    }
    return {
      available,
      events: events.sort(compareHistoryEventsAsc)
    };
  }

  private clientFor(networkId: string): XianReadClient {
    const client = this.clients.get(networkId);
    if (!client) {
      throw new Error(`unknown network ${networkId}`);
    }
    return client;
  }

  private networkById(networkId: string): NetworkConfig {
    const network = this.networks.find((candidate) => candidate.id === networkId);
    if (!network) {
      throw new Error(`unknown network ${networkId}`);
    }
    return network;
  }
}

function normalizeHistoryEvent(
  event: XianIndexedEvent,
  layer: GovernanceLayer,
): GovernanceHistoryEvent {
  const data = {
    ...(event.dataIndexed ?? {}),
    ...(event.data ?? {})
  };
  const eventName = event.event ?? "UnknownEvent";
  return {
    id: event.id,
    layer,
    proposalId: maybeNumber(data.proposal_id),
    contract: event.contract,
    event: eventName,
    title: historyEventTitle(eventName, data),
    txHash: event.txHash,
    blockHeight: maybeNumber(event.blockHeight),
    createdAt: event.createdAt,
    actor: eventActor(data, event),
    data
  };
}

function historyEventTitle(
  eventName: string,
  data: Record<string, unknown>,
): string {
  const proposalId = maybeNumber(data.proposal_id);
  const suffix = proposalId == null ? "" : ` #${proposalId}`;
  switch (eventName) {
    case "ProposalSubmitted":
    case "ValidatorProposalSubmitted":
      return `Submitted${suffix}`;
    case "ProposalVoted":
    case "ValidatorProposalVoted":
      return `Vote cast${suffix}`;
    case "ProposalApproved":
    case "ValidatorProposalApproved":
      return `Approved${suffix}`;
    case "ValidatorProposalRejected":
      return `Rejected${suffix}`;
    case "ValidatorProposalExpired":
      return `Expired${suffix}`;
    case "ProposalExecuted":
      return `Executed${suffix}`;
    case "StatePatchScheduled":
      return `State patch scheduled${suffix}`;
    default:
      return eventName.replace(/([a-z])([A-Z])/g, "$1 $2") + suffix;
  }
}

function eventActor(
  data: Record<string, unknown>,
  event: XianIndexedEvent,
): string | null {
  return (
    asString(data.voter) ??
    asString(data.proposer) ??
    asString(data.approver) ??
    asString(data.rejector) ??
    asString(data.expirer) ??
    asString(data.executor) ??
    event.signer ??
    event.caller ??
    null
  );
}

function proposalHistorySummary(
  events: GovernanceHistoryEvent[],
  available: boolean,
): Pick<
  ProposalSummary,
  "historyAvailable" | "lastEventAt" | "lastTxHash" | "lastBlockHeight" | "eventCount"
> {
  const latest = [...events].sort(compareHistoryEventsDesc)[0];
  return {
    historyAvailable: available,
    lastEventAt: latest?.createdAt ?? null,
    lastTxHash: latest?.txHash ?? null,
    lastBlockHeight: latest?.blockHeight ?? null,
    eventCount: events.length
  };
}

function mergeVoteHistory(
  votes: VoteRecord[],
  events: GovernanceHistoryEvent[],
  layer: GovernanceLayer,
  proposalId: number,
): VoteRecord[] {
  const byVoter = new Map(votes.map((vote) => [vote.voter, { ...vote }]));
  const voteEventName = layer === "protocol" ? "ProposalVoted" : "ValidatorProposalVoted";
  for (const event of events) {
    if (event.event !== voteEventName || event.proposalId !== proposalId) {
      continue;
    }
    const voter = asString(event.data.voter) ?? event.actor;
    if (!voter) {
      continue;
    }
    const existing =
      byVoter.get(voter) ??
      ({
        proposalId,
        layer,
        voter,
        vote: null,
        weight: 0
      } satisfies VoteRecord);
    const vote = event.data.vote === "yes" || event.data.vote === "no"
      ? event.data.vote
      : existing.vote;
    byVoter.set(voter, {
      ...existing,
      vote,
      weight: existing.weight || asNumber(event.data.weight),
      txHash: existing.txHash ?? event.txHash ?? null,
      blockHeight: existing.blockHeight ?? event.blockHeight ?? null,
      votedAt: existing.votedAt ?? event.createdAt ?? null
    });
  }
  return [...byVoter.values()].sort((left, right) => {
    if (right.weight !== left.weight) {
      return right.weight - left.weight;
    }
    return left.voter.localeCompare(right.voter);
  });
}

function compareHistoryEventsAsc(
  left: GovernanceHistoryEvent,
  right: GovernanceHistoryEvent,
): number {
  const leftHeight = left.blockHeight ?? Number.MAX_SAFE_INTEGER;
  const rightHeight = right.blockHeight ?? Number.MAX_SAFE_INTEGER;
  if (leftHeight !== rightHeight) {
    return leftHeight - rightHeight;
  }
  const leftId = left.id ?? Number.MAX_SAFE_INTEGER;
  const rightId = right.id ?? Number.MAX_SAFE_INTEGER;
  if (leftId !== rightId) {
    return leftId - rightId;
  }
  return sortableTimestamp(left.createdAt) - sortableTimestamp(right.createdAt);
}

function compareHistoryEventsDesc(
  left: GovernanceHistoryEvent,
  right: GovernanceHistoryEvent,
): number {
  return -compareHistoryEventsAsc(left, right);
}

function sortableTimestamp(value?: string | null): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProposal(input: {
  networkId: string;
  layer: GovernanceLayer;
  proposalId: number;
  kind: string;
  type: string;
  summary: string;
  proposer?: string | null;
  status: ProposalStatus;
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
  payload: unknown;
}): ProposalSummary {
  return {
    networkId: input.networkId,
    layer: input.layer,
    proposalId: input.proposalId,
    kind: input.kind,
    type: input.type,
    title:
      input.summary ||
      titleFromPayload(input.kind, input.type, input.arg ?? input.payload),
    summary: input.summary,
    status: input.status,
    proposer: input.proposer ?? null,
    createdAt: input.createdAt ?? null,
    expiresAt: input.expiresAt ?? null,
    yesVotes: input.yesVotes,
    noVotes: input.noVotes,
    yesWeight: input.yesWeight,
    noWeight: input.noWeight,
    requiredYesVotes: input.requiredYesVotes,
    requiredYesWeight: input.requiredYesWeight,
    totalWeightSnapshot: input.totalWeightSnapshot,
    emergency: input.emergency,
    patchId: input.patchId,
    activationHeight: input.activationHeight,
    targetContract: input.targetContract,
    targetFunction: input.targetFunction,
    arg: input.arg
  };
}

function normalizeValidator(value: unknown, defaultActive: boolean): ValidatorRecord {
  const record = isRecord(value) ? value : {};
  return {
    account: String(record.account ?? "unknown"),
    moniker: asString(record.moniker),
    status: asString(record.status),
    active: typeof record.active === "boolean" ? record.active : defaultActive,
    jailed: record.jailed === true,
    jailReason: asString(record.jail_reason),
    power: asNumber(record.power),
    requestedPower: maybeNumber(record.requested_power),
    rewardKey: asString(record.reward_key),
    networkEndpoint: asString(record.network_endpoint),
    metadataUri: asString(record.metadata_uri),
    registrationBond: asString(record.registration_bond) ?? maybeNumber(record.registration_bond),
    selfBond: asString(record.self_bond) ?? maybeNumber(record.self_bond),
    totalDelegated: asString(record.total_delegated) ?? maybeNumber(record.total_delegated),
    totalBond: asString(record.total_bond) ?? maybeNumber(record.total_bond),
    commissionBps: maybeNumber(record.commission_bps),
    delegatorCount: maybeNumber(record.delegator_count)
  };
}

function normalizeVoteRecord(
  value: unknown,
  layer: GovernanceLayer,
  proposalId: number,
): VoteRecord {
  const record = isRecord(value) ? value : {};
  const vote = record.vote === "yes" || record.vote === "no" ? record.vote : null;
  return {
    proposalId,
    layer,
    voter: String(record.voter ?? "unknown"),
    vote,
    weight: asNumber(record.weight)
  };
}

function normalizePatch(value: unknown): StatePatchRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    patchId: String(value.patch_id ?? ""),
    proposalId: asNumber(value.proposal_id),
    status: String(value.status ?? "unknown"),
    summary: asString(value.summary),
    uri: asString(value.uri),
    bundleHash: asString(value.bundle_hash),
    activationHeight: maybeNumber(value.activation_height),
    emergency: value.emergency === true,
    appliedBlockHeight: maybeNumber(value.applied_block_height),
    appliedBlockHash: asString(value.applied_block_hash),
    executionHash: asString(value.execution_hash)
  };
}

function normalizeStatus(value: unknown): ProposalStatus {
  const status = String(value ?? "unknown");
  if (
    status === "pending" ||
    status === "approved" ||
    status === "executed" ||
    status === "rejected" ||
    status === "expired" ||
    status === "applied"
  ) {
    return status;
  }
  return "unknown";
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.__time__)) {
    const [year, month, day, hour, minute, second] = value.__time__;
    return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(
      second,
    )}Z`;
  }
  return null;
}

function maybeNumber(value: unknown): number | null {
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(value: unknown): string {
  return String(value ?? 0).padStart(2, "0");
}

function expiresSoon(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const expiresAt = Date.parse(value);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }
  return expiresAt - Date.now() <= 48 * 60 * 60 * 1000;
}
