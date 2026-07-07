/**
 * @endless-story/indexer — durable chain-event store.
 *
 * Captures Sui events into Postgres (via Surflux Flux Streams) and serves
 * them back through the same page/cursor/MoveEventType contract the sdk's
 * `queryEvents` calls already speak. This is the read path that survives
 * the 2026-07-31 JSON-RPC deactivation, the public-node 429 fan-out, and
 * the ~3-day event-pruning window.
 *
 * Surface shipped so far: the contract types, the pure pagination core,
 * and the in-memory store. The Postgres store and the Flux capture service
 * land next.
 */
export type {
  CapturedEvent,
  EventCursor,
  EventOrder,
  EventPage,
  EventQuery,
  EventReader,
  EventRow,
  StoredEvent,
} from './types.ts';
export { compareEvents, pageEvents } from './page.ts';
export { MemoryEventStore } from './memory-store.ts';
export { SseDecoder, parseFluxMessage, fluxSeqFromId } from './flux.ts';
export type { SseFrame } from './flux.ts';
export { pollType, pollAllOnce, jsonRpcFetchPage, graphqlFetchPage } from './poll.ts';
export type {
  FetchPage,
  EventPageResult,
  HighWater,
  QueryEventsClient,
  GraphqlExec,
  SourceCursor,
} from './poll.ts';
export { rpcParamsToQuery, eventPageToRpc } from './adapt.ts';
export type { RpcQueryEventsParams, RpcEventsPage } from './adapt.ts';

// The Postgres store imports `pg` (node-only); reach it via the
// `@endless-story/indexer/pg` subpath so browser bundles keep using the
// pure root entry. Mirrors the `@endless-story/sdk` vs `/node` split.
