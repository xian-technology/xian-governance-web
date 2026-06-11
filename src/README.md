# src

## Purpose

This folder contains the full-stack application code for the governance
console: a read-only Express API, a React client, and the shared types both
sides use.

## Contents

- `server/` — Express API: `app.ts` routing, `governanceService.ts`
  normalization of `governance` / `validators` reads, `rpc.ts` node access
  through `@xian-tech/client`, `config.ts` environment loading, `main.ts`
  entrypoint.
- `client/` — React console: `App.tsx` views, `CreateProposal.tsx` typed
  proposal wizard, `api.ts` API client, `wallet.ts` injected-wallet
  integration, `validatorVote.ts` vote submission helpers.
- `shared/` — types and helpers used by both sides: `types.ts` normalized
  proposal / validator / patch models, `statePatchHash.ts` canonical bundle
  hashing, `format.ts` display helpers.

## Notes

- The server is read-only for governance actions: it never holds validator
  keys or proxies signed transactions. Signing stays in the browser wallet.
- `statePatchHash.ts` must keep the exact canonical JSON ordering and hash
  format expected by the chain-side state-patch workflow; do not change it
  casually.

## Next

- Start with `server/app.ts` for the API surface or `client/App.tsx` for the
  console views.
