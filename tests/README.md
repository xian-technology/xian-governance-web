# Tests

## Purpose

Vitest coverage for the governance console: API routes, RPC normalization,
client helpers, wallet integration, and the canonical state-patch hash.

## Contents

- `api.test.ts`, `rpc.test.ts` — server API and node-read behavior.
- `App.test.tsx` — client rendering and view behavior.
- `wallet.test.ts`, `validatorVote.test.ts` — injected-wallet flows and vote
  submission payloads.
- `statePatchHash.test.ts` — canonical bundle hashing; guards the chain-side
  hash contract.
- `format.test.ts` — shared display helpers.
- `setup.ts` — shared test environment setup.

## Notes

- `statePatchHash.test.ts` pins a cross-repo contract; update it only together
  with the chain-side state-patch workflow.

## Next

- Run `npm run test` from the repo root.
