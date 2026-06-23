/**
 * Registered durable event source.
 *
 * A server-only bootstrap injects a `PgEventStore` here via `setEventStore`.
 * The sdk imports only the `EventReader` TYPE from `@endless-story/indexer`,
 * so no `pg` / node dependency leaks into browser bundles. When a store is
 * registered, `queryEventsWithRetry` reads it instead of live RPC; when it is
 * null (the default), behavior is exactly as before.
 */
import type { EventReader } from '@endless-story/indexer';

let registered: EventReader | null = null;

export function setEventStore(store: EventReader | null): void {
  registered = store;
}

export function getEventStore(): EventReader | null {
  return registered;
}
