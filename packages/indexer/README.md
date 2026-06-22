# @endless-story/indexer

Durable chain-event store. Captures Sui events into Postgres and serves them
back through the same `queryEvents` page/cursor/`MoveEventType` contract the
sdk read layer already speaks, so the swap is invisible to callers.

## Why

The engine is event-driven: every read in `packages/sdk/src/read/*.ts` and the
runner event-bus funnels through `queryEvents`. That call is JSON-RPC only, and:

- **JSON-RPC deactivates 2026-07-31.** `queryEvents` has no gRPC equivalent
  (Sui routes event discovery to GraphQL or a custom indexer), so this path
  must move regardless.
- **The public fullnode 429s** under a tick's read fan-out, which collapses the
  resource ledger to empty and switches the drama/chapter pipeline off (dry,
  repeating stories).
- **Testnet prunes events after ~3 days**, so historical settlement can never
  find its events.

Capturing events as they finalize (via Surflux Flux Streams) into Postgres
makes reads durable, un-throttled, and prune-proof. The store is the read path;
the chain is only the write path.

## Shape

```
src/types.ts        contract types (EventQuery / EventPage / EventReader / StoredEvent)
src/page.ts         pure pagination core — the semantics oracle
src/memory-store.ts in-memory EventReader (tests + sdk-seam fake)
db/schema.sql       Postgres schema (chain_events + flux_cursors)
```

`EventReader.queryEvents(query)` returns the same envelope the SuiClient does
(`{ data, hasNextPage, nextCursor }`), so `query-retry.ts` can read from here
instead of RPC without changing a single caller.

## Status

- [x] Contract types + pure pagination core + in-memory store + tests
- [ ] `PgEventStore` (keyset SQL over `chain_events`)
- [ ] Flux Streams capture service (SSE -> Postgres, resumable)
- [ ] JSON-RPC backfill (current window -> Postgres, before cutover)
- [ ] sdk seam: `queryEventsWithRetry` reads the store when `DATABASE_URL` is set

## Test

```bash
pnpm --filter @endless-story/indexer test        # node --test, native TS
pnpm --filter @endless-story/indexer type-check
```
