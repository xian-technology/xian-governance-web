# Xian Governance Web - Product And Technical Proposal

## Goal

Build a governance website for Xian validators and observers that makes on-chain
governance understandable, auditable, and easy to act on.

The site should let validators:

- connect with the Xian browser wallet
- see every active governance item that needs attention
- create proposals through guided forms
- vote on proposals
- inspect exactly who voted, with weights and thresholds
- verify state-patch bundle readiness before activation
- monitor validator set status, policy, and node health

The site should let public observers:

- understand current and historical proposals
- see quorum, voting weight, status, timelines, and execution results
- inspect active validators, pending candidates, and patch activity
- link out to transactions, events, and raw chain data

This should be a governance operations console, not a marketing page.

## Existing Chain Model

The repo already has two governance surfaces that the website should unify.

### 1. Protocol Governance: `governance`

Canonical source: `xian-configs/contracts/governance.s.py`

Supported proposal kinds:

- `contract_call`
- `state_patch`

Important semantics:

- membership comes from `validators`
- current active validators can propose and vote
- validator voting weights are snapshotted at proposal creation
- proposer automatically casts the first `yes`
- approval is weight-first
- `contract_call` executes immediately once approved
- `state_patch` schedules a bundle for a future activation height
- state-patch execution requires matching local bundles on validator nodes

Useful contract exports:

- `propose_contract_call(target_contract, target_function, kwargs, summary)`
- `propose_state_patch(patch_id, bundle_hash, activation_height, summary, uri, emergency)`
- `vote(proposal_id, support)`
- `expire_proposal(proposal_id)`
- `get_proposal(proposal_id)`
- `get_patch(patch_id)`
- `get_members()`
- `required_votes_for(emergency)`
- `required_vote_weight_for(emergency)`

Individual protocol-governance votes are stored in:

- `governance.proposal_votes:<proposal_id>:<voter>`
- `governance.proposal_vote_weights:<proposal_id>:<voter>`

The contract also emits:

- `ProposalSubmitted`
- `ProposalVoted`
- `ProposalApproved`
- `ProposalExecuted`
- `StatePatchScheduled`

### 2. Validator Governance: `validators`

Canonical source: `xian-configs/contracts/validators.s.py`

Supported vote types:

- `add_member`
- `remove_member`
- `jail_member`
- `unjail_member`
- `slash_member`
- `set_member_power`
- `change_registration_fee`
- `reward_change`
- `dao_payout`
- `chi_cost_change`
- `change_types`
- `update_policy`
- `topic_vote`

Useful contract exports:

- `propose_vote(type_of_vote, arg)`
- `vote(proposal_id, vote)`
- `expire_vote(proposal_id)`
- `get_active_validators()`
- `get_pending_candidates()`
- `get_validator(account)`
- `get_policy_config()`
- `get_members()`
- `is_member(account)`
- `member_weight(account)`
- `total_member_weight()`
- `register(...)`
- `update_registration(...)`
- `update_profile(...)`
- `announce_leave()`
- `leave()`

Important gap:

- `validators.votes:<proposal_id>` stores aggregate counts and a `voters`
  list, but not each voter's yes/no choice.
- To show "what each validator voted" for validator-governance proposals, the
  site needs either transaction-history reconstruction from BDS or a small
  contract/API improvement.

## Product Shape

### Primary Sections

1. Dashboard
2. Proposals
3. Proposal Detail
4. Create Proposal
5. Validators
6. Validator Detail
7. State Patches
8. Network Settings

### Dashboard

The dashboard should be the first screen. It should show:

- current chain height and chain id
- connected wallet and validator eligibility
- active proposals needing a vote
- expiring soon proposals
- proposals that already reached final status
- current approval threshold and active validator weight
- state patches scheduled for future heights
- validator node readiness summary
- recent governance events

No hero, no marketing copy. This is a dense operational surface.

### Proposal List

Filters:

- layer: protocol governance, validator governance, all
- status: pending, approved, executed, rejected, expired, applied
- kind/type: contract call, state patch, add member, remove member, policy, topic, etc.
- needs my vote
- emergency only
- expiring soon
- created by me

Each row should show:

- proposal id
- governance layer
- type/kind
- summary or generated title
- status
- yes/no weight and count
- threshold progress
- expiry or activation height
- proposer
- user's vote state

### Proposal Detail

Every proposal page should include:

- proposal identity: layer, id, type, status
- proposer, created time, expiry time, approval/execution time
- threshold math: required yes weight, current yes/no weight, remaining weight
- voter matrix:
  - validator account
  - moniker when available
  - voting weight snapshot
  - vote: yes, no, not voted, ineligible
  - tx hash and block height when indexed
- timeline:
  - submitted
  - votes
  - approval/rejection/expiry
  - execution or patch schedule
  - patch application metadata when applicable
- payload preview:
  - contract and function for contract calls
  - JSON kwargs, formatted and validated
  - state-patch patch id, bundle hash, activation height, URI
  - validator vote type and argument for `validators`
- risk and effect preview:
  - "Executes immediately on approval" for contract calls
  - "Schedules patch at block N" for state patches
  - "Changes validator set/policy/rewards" for validator-governance proposals

Actions:

- connect wallet
- vote yes
- vote no
- expire proposal when allowed
- copy proposal link
- copy raw payload
- open transaction/event details

Voting buttons should only be enabled when:

- wallet is connected
- chain id matches selected network
- account is eligible for the proposal snapshot
- proposal is still pending
- account has not already voted

### Create Proposal

Use a wizard with templates and a raw JSON escape hatch.

Step 1: choose governance layer.

- Protocol governance
- Validator governance

Step 2: choose proposal type.

Protocol governance:

- contract call
- state patch

Validator governance:

- add validator
- remove validator
- jail / unjail
- slash
- set validator power
- update validator policy
- change registration fee
- reward split change
- DAO payout
- chi cost change
- topic vote
- raw vote type

Step 3: fill typed form.

Examples:

- contract call: target contract, target function, kwargs, summary
- state patch: patch id, bundle file/hash, activation height, URI, emergency flag, summary
- add member: validator account, expected profile, registration status
- update policy: mode, max validators, power mode, churn, bond gates, overrides

Step 4: preflight.

- simulate call when possible
- validate membership eligibility
- validate target contract/function existence
- validate required fields
- show chain id and current block height
- for state patches, verify activation height against configured delay
- for state patches, compute local JSON bundle hash in the browser and compare
- show exact wallet call that will be signed

Step 5: sign and submit.

Use the Xian browser wallet:

```ts
await wallet.sendCall(
  {
    chainId,
    contract: "governance",
    function: "propose_contract_call",
    kwargs: {
      target_contract,
      target_function,
      kwargs,
      summary,
    },
  },
  { mode: "checktx", waitForTx: true },
);
```

For validator governance:

```ts
await wallet.sendCall(
  {
    chainId,
    contract: "validators",
    function: "propose_vote",
    kwargs: { type_of_vote, arg },
  },
  { mode: "checktx", waitForTx: true },
);
```

### Validators

Show active validators and pending candidates.

Columns:

- account
- moniker
- status
- active flag
- jailed flag
- voting weight
- requested power
- commission
- self bond
- delegated bond
- reward key
- endpoint
- last node check
- open proposals not voted
- patch bundle readiness

Use `validators.get_active_validators()`, `validators.get_pending_candidates()`,
and `/validators_validator/<account>`.

### State Patches

State patch proposals need special handling because governance approval is only
half the job. Validators must also have the exact local bundle.

Show:

- proposed/approved/applied patch list
- patch id
- bundle hash
- URI
- emergency flag
- activation height
- current block distance to activation
- approved status
- applied metadata:
  - applied block height
  - applied block hash
  - applied at nanos
  - execution hash
- readiness matrix by validator/node:
  - node reachable
  - local bundle present
  - local bundle hash matches
  - scheduled patch visible

Use:

- `governance.get_patch(patch_id)`
- `/state_patch_bundles`
- `/scheduled_state_patches/<height>`
- BDS `/state_patches`, `/state_patches_for_block/<height>`,
  `/state_patch/<execution_hash>` when available

Add a browser-side bundle verifier:

- validator drops a JSON bundle into the page
- app computes the canonical hash locally
- app compares it with the proposal bundle hash
- file does not need to leave the browser

## Wallet And Node Connection Model

The website should not connect to validator private keys or CometBFT validator
keys.

Signing model:

- validators connect their Xian account through the browser wallet
- the connected account signs on-chain governance calls
- the app checks whether that account is an active member or part of a proposal
  snapshot
- private keys stay inside the wallet

Node model:

- the node is linked through public validator metadata and optional read-only
  health endpoints
- validator identity comes from the on-chain account, not from a raw node key
- the app can probe public RPC/dashboard endpoints for status and state-patch
  inventory
- private/local node deployments can use an optional companion agent

Recommended node-linking levels:

1. Wallet only
   - enough to create proposals and vote
   - no node health checks

2. Wallet plus profile endpoint
   - validator updates `validators.update_profile(network_endpoint=...)`
   - app probes read-only endpoints
   - works for public RPC/dashboard nodes

3. Wallet plus signed node readiness attestations
   - validator signs "I have bundle hash X for patch Y" with wallet
   - app stores the attestation off-chain
   - useful when validator nodes are private

4. Optional validator companion agent
   - small read-only service running beside a node
   - reports local patch inventory, chain height, app version, and health
   - protected by allowlist or signed challenge
   - never exposes keys or mutating RPC

The MVP should implement levels 1 and 2. Level 3 is valuable for state-patch
coordination. Level 4 is optional for serious validator operations.

## Technical Architecture

### Components

1. Web frontend
   - TypeScript, React, Vite or Next.js
   - `@xian-tech/client` for reads
   - `@xian-tech/provider` for injected wallet discovery and signing
   - TanStack Query or equivalent for cached reads
   - WebSocket subscriptions for blocks/state/events where available

2. Governance API and indexer
   - small backend service with Postgres
   - polls current state and BDS/history endpoints
   - normalizes both governance layers into one proposal model
   - reconstructs individual vote records where possible
   - probes validator endpoints
   - exposes clean app-specific REST/WebSocket API

3. Optional companion agent
   - read-only node-side process for private validators
   - reports local health and state-patch inventory
   - not required for MVP voting flows

### Why An Indexer Is Needed

The frontend can read current state directly, but a complete governance site
needs more than direct reads:

- fast proposal lists
- historical proposal status
- event timelines
- per-validator vote matrices
- transaction hashes for votes
- validator readiness checks
- BDS-enabled history when available
- fallback reconciliation when events are missed

Direct RPC-only mode can exist as a degraded fallback, but the complete product
should use an indexer.

### Data Sources

Core RPC and ABCI:

- `/status`
- `/abci_query?path="/get/<state-key>"`
- `/abci_query?path="/keys/<prefix>/limit=<n>/after=<cursor>"`
- `/abci_query?path="/validators_policy"`
- `/abci_query?path="/validators_active"`
- `/abci_query?path="/validators_candidates"`
- `/abci_query?path="/validators_validator/<account>"`
- `/abci_query?path="/validators_open_votes/limit=<n>/offset=<n>"`
- `/abci_query?path="/state_patch_bundles"`
- `/abci_query?path="/scheduled_state_patches/<height>"`
- `/abci_query?path="/simulate_tx/<encoded_payload>"`

BDS when available:

- `/events`
- `/recent_events`
- `/events_for_tx/<hash>`
- `/tx/<hash>`
- `/txs_by_contract/<contract>`
- `/txs_by_sender/<address>`
- `/state_patches`
- `/state_patches_for_block/<height>`
- `/state_patch/<execution_hash>`
- `/state_changes_for_patch/<execution_hash>`

Contract calls through `XianClient.call(...)`:

- `governance.get_proposal`
- `governance.get_patch`
- `governance.get_members`
- `validators.get_active_validators`
- `validators.get_pending_candidates`
- `validators.get_validator`
- `validators.get_policy_config`

### Normalized Data Model

Tables:

- `networks`
  - id, chain_id, name, rpc_url, dashboard_url, bds_enabled

- `validators`
  - network_id, account, moniker, status, active, jailed, power,
    requested_power, reward_key, endpoint, metadata_uri, bond, self_bond,
    total_delegated, commission_bps, last_seen_height, last_checked_at

- `proposals`
  - network_id, layer, proposal_id, kind, type, summary, status, proposer,
    created_at, expires_at, approved_at, executed_at, expired_at, emergency,
    yes_votes, no_votes, yes_weight, no_weight, required_yes_votes,
    required_yes_weight, total_weight_snapshot, payload_json,
    patch_id, bundle_hash, activation_height, uri, tx_hash, block_height

- `proposal_votes`
  - network_id, layer, proposal_id, voter, vote, weight, tx_hash,
    block_height, voted_at, source

- `proposal_events`
  - network_id, layer, proposal_id, event_name, tx_hash, block_height,
    event_index, payload_json, observed_at

- `state_patches`
  - network_id, patch_id, proposal_id, bundle_hash, activation_height,
    summary, uri, emergency, status, applied_block_height,
    applied_block_hash, execution_hash, applied_at_nanos

- `node_checks`
  - network_id, validator_account, endpoint, checked_at, reachable,
    height, catching_up, app_version, patch_inventory_json, error

- `readiness_attestations`
  - network_id, patch_id, validator_account, bundle_hash, readiness,
    signed_message, signature, created_at

### API Shape

Frontend-facing API:

- `GET /api/networks`
- `GET /api/networks/:networkId/overview`
- `GET /api/networks/:networkId/proposals`
- `GET /api/networks/:networkId/proposals/:layer/:proposalId`
- `GET /api/networks/:networkId/proposals/:layer/:proposalId/votes`
- `GET /api/networks/:networkId/validators`
- `GET /api/networks/:networkId/validators/:account`
- `GET /api/networks/:networkId/state-patches`
- `GET /api/networks/:networkId/state-patches/:patchId`
- `GET /api/networks/:networkId/readiness/:patchId`
- `POST /api/networks/:networkId/simulate`
- `POST /api/networks/:networkId/readiness-attestations`

The backend should not submit governance transactions in the default path.
Transaction submission should happen through the browser wallet so the user sees
the exact call they are signing.

### Indexer Strategy

Protocol governance:

1. Poll `governance.proposal_count`.
2. For each id, call `governance.get_proposal(id)`.
3. For vote records:
   - preferred: consume `ProposalVoted` events from BDS
   - fallback: scan keys under `governance.proposal_vote_weights:<id>:`
     and read matching `governance.proposal_votes:<id>:<account>`
4. Reconcile aggregate counts with contract state.
5. For state patches, call `governance.get_patch(patch_id)` and query runtime
   patch endpoints.

Validator governance:

1. Poll `validators.total_votes`.
2. Read `validators.votes:<id>` for each proposal.
3. For individual yes/no votes:
   - preferred for new proposals: read `validators.vote_records:<id>:<voter>`
     and `validators.vote_weights:<id>:<voter>`, or use
     `/validators_vote_records/<id>`
   - fallback for old proposals: reconstruct from BDS transaction payloads to
     `validators.propose_vote` and `validators.vote`
4. Reconcile aggregate counts with contract state.

Validator state:

1. Poll `/validators_active` and `/validators_candidates`.
2. Poll `/validators_policy`.
3. Refresh individual `/validators_validator/<account>` records.
4. Probe validator endpoints on a slower cadence.

## Contract/API Improvements

The validator-governance read surface now has the missing per-voter state and
events needed by the governance website. Protocol-governance read helpers would
still reduce raw-state scans, but protocol votes were already recoverable from
current state.

### Protocol Governance

Useful additions to `governance.s.py`:

- `get_proposal_vote(proposal_id, voter)`
- `get_proposal_vote_weight(proposal_id, voter)`
- `get_proposal_voter_snapshot(proposal_id)` for new proposals
- `get_open_proposals(limit, offset)` or a query handler equivalent

### Validator Governance

Added target additions to `validators.s.py`:

- `vote_records = Hash(default_value=None)`
- store `vote_records[proposal_id, voter] = "yes" | "no"`
- store proposal member snapshot list for new proposals
- emit events:
  - `ValidatorProposalSubmitted`
  - `ValidatorProposalVoted`
  - `ValidatorProposalApproved`
  - `ValidatorProposalRejected`
  - `ValidatorProposalExpired`

Useful exports:

- `get_vote(proposal_id)`
- `get_vote_record(proposal_id, voter)`
- `get_vote_weight(proposal_id, voter)`
- `get_vote_voter_snapshot(proposal_id)`
- `get_vote_records(proposal_id)`

Added useful query endpoints:

- `/validators_vote/<id>`
- `/validators_vote_records/<id>`

Potential future protocol-governance query endpoints:

- `/governance_open_proposals`
- `/governance_proposal/<id>`
- `/governance_proposal_votes/<id>`

## Security And Safety Requirements

- Never ask for or store private keys.
- Never connect to CometBFT validator signing keys.
- Pin chain id before signing.
- Display exact contract, function, kwargs, chi, and broadcast mode before the
  wallet prompt.
- Simulate proposal creation and votes when possible.
- Treat proposal summaries, metadata URIs, and contract kwargs as untrusted
  content.
- Render JSON and source diffs safely, without executing embedded content.
- Do not proxy arbitrary user-provided URLs from the backend without allowlists
  or strict timeouts.
- Node probes must be read-only.
- Off-chain readiness attestations must include chain id, patch id, bundle
  hash, validator account, and timestamp in the signed message.

## UX Principles

- The primary UI is an operations dashboard.
- Use compact tables, filters, badges, timelines, and detail panels.
- Use clear status language: pending, approved, executed, rejected, expired,
  scheduled, applied.
- Always show weight and raw vote count.
- Always show whether the connected validator can still act.
- Separate "proposal approved" from "patch applied"; they are different states.
- Make dangerous proposals visibly distinct, especially emergency patches,
  slashing, policy updates, and contract calls.
- Provide generated human-readable titles for raw proposal payloads.
- Keep raw JSON available for auditability.

## MVP Scope

MVP should include:

- network selector and chain status
- browser wallet connect via `@xian-tech/provider`
- active validator detection for connected account
- proposal dashboard
- protocol-governance proposal list and detail
- validator-governance proposal list and detail
- vote yes/no for both governance layers
- create proposal wizard for:
  - protocol `contract_call`
  - protocol `state_patch`
  - validator `topic_vote`
  - validator `add_member`
  - validator `remove_member`
  - raw validator vote type
- voter matrix for protocol governance from state/events
- voter matrix for validator governance through `validators.s.py` vote records
- validators list
- state-patch list and detail
- local patch bundle hash verifier
- transaction status and error handling

MVP can defer:

- private validator companion agent
- signed readiness attestations
- notification subscriptions
- rich off-chain discussion/comments
- full historical backfill for old validator-governance proposals when BDS data
  is incomplete

## Implementation Phases

### Phase 1 - Foundations

- create governance web app package
- integrate `@xian-tech/client` and `@xian-tech/provider`
- implement network config and chain-id checks
- implement wallet connect/disconnect and account eligibility state
- implement basic reads for active validators, policy, proposal counts, and
  direct proposal lookup

### Phase 2 - Indexer/API

- create normalized database schema
- index protocol-governance proposals and votes
- index validator-governance proposals
- integrate BDS event/tx reads when available
- expose frontend API endpoints
- add reconciliation jobs against current contract state

### Phase 3 - Governance UI

- build dashboard
- build proposal list and detail pages
- build vote actions through wallet `sendCall`
- build proposal creation wizard
- add simulation/preflight
- add transaction status tracking

### Phase 4 - Validators And State Patches

- build validators directory/detail
- build state-patch pages
- add local bundle hash verifier
- probe public validator endpoints
- show patch readiness matrix

### Phase 5 - Hardening

- add tests for data normalization and proposal state transitions
- add browser tests for wallet flows with mocked provider
- add e2e tests against localnet governance harness
- add error-state UX for wallet rejection, wrong chain, failed simulation, and
  failed transaction
- add deployment docs and monitoring

### Phase 6 - Optional Node And History Improvements

- add optional private validator companion agent
- add signed state-patch readiness attestations
- backfill historical validator-governance votes when BDS data is available
- add notifications for proposals needing a validator's vote

## Resolved Decisions

1. The governance website should live in its own repo:
   `xian-governance-web`.

2. The frontend should use `@xian-tech/client` and `@xian-tech/provider`.
   Backend language is independent of that frontend decision. Recommended
   backend: TypeScript, because this app is mostly a web/indexing product and
   can share Xian client code, validation helpers, and proposal types with the
   frontend. A Python FastAPI backend remains viable if operator tooling and
   team preference matter more than full-stack type sharing.

3. BDS should not be required for core current-governance functionality. The
   contract/API improvement adds future per-voter `validators` vote records.
   BDS is still useful for historical backfills, transaction hashes, event
   timelines, and block-level audit detail.

4. Rich proposal metadata stays off-chain in the governance app/indexer. The
   on-chain contracts remain the source of truth for executable payloads,
   status, votes, and thresholds.

5. Validator node endpoints are not required for creating proposals or voting.
   Wallet signatures are enough for governance actions. Endpoints are only for
   optional observability: node health, reported height, version, and local
   state-patch bundle readiness. Private validators can skip endpoint probing
   or use signed readiness attestations later.

6. Proposal discussion should link out to GitHub issues, pull requests, or
   discussions. Do not build comments directly into the governance website.

## Recommended Build Decision

Build this as a dedicated `xian-governance-web` app with a small indexer/API.
Use wallet-first signing through the browser wallet, direct RPC reads for
freshness, and indexed data for history, vote matrices, and dashboards. A
TypeScript backend is the best default for sharing `xian-js` usage and proposal
types across the stack; Python is still acceptable if deployment conventions or
team preference outweigh that benefit.

Do not make validators "connect their node" for voting. Validators should
connect the wallet/account that is in the active validator set. Node connection
should be a separate read-only health/readiness feature tied to the validator's
on-chain profile endpoint or optional signed attestations.

Per-voter `validators` vote records and events are now part of the target chain
interface for new proposals. For proposals created before that interface exists
on a live network, the indexer can still use BDS transaction reconstruction as a
historical best-effort fallback.
