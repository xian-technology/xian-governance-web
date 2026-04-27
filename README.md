# Xian Governance Web

Operational governance console for Xian validators. The backend is TypeScript/Express and read-only by default; transaction submission is done in the browser through the injected Xian wallet.

## Features

- Governance dashboard with chain status, active validator count, pending proposals, expiring proposals, and scheduled state patches.
- Protocol proposal overview for contract calls and state patches.
- Validator governance overview from the `masternodes` contract, including per-voter records.
- Proposal detail view with raw payload, voting weight, voter matrix, and off-chain reference links.
- Wallet-driven proposal voting and proposal creation.
- State patch bundle hash verifier that matches the chain-side canonical hash format.
- Validator and candidate tables with operator metadata where available.

## Development

```sh
npm install
npm run dev
```

The app listens on `http://127.0.0.1:4173` by default.

## Configuration

Copy `.env.example` to `.env` when local defaults are not enough.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port for the TypeScript server. |
| `XIAN_NETWORK_ID` | Stable network identifier used by the API and UI. |
| `XIAN_NETWORK_NAME` | Human-readable network name. |
| `XIAN_CHAIN_ID` | Optional chain id override for wallet calls. |
| `XIAN_RPC_URL` | Xian node RPC URL used for reads. |
| `XIAN_DASHBOARD_URL` | Optional link target for the existing node dashboard. |
| `XIAN_GOVERNANCE_CONTRACT` | Protocol governance contract name. |
| `XIAN_MEMBERSHIP_CONTRACT` | Validator governance contract name. |

## Scripts

```sh
npm run typecheck
npm run test
npm run build
npm run validate
npm run start
```

`npm run validate` runs type checks, Vitest, and the production build.

## Architecture

- `src/server` exposes the governance API and normalizes chain state for the UI.
- `src/client` contains the React operations console.
- `src/shared` contains shared API types and deterministic state patch hashing.
- `tests` covers API behavior, UI rendering, and state patch hash compatibility.

The server does not hold validator keys and does not proxy signed transactions. Validators connect the browser wallet, review the transaction locally, and sign from the wallet.
