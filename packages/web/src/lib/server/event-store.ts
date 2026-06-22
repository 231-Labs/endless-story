/**
 * Server-only (nodejs) registration of the durable event store.
 *
 * Called from runTickLoopAction so settlement / feed reads come from Postgres
 * instead of the rate-limited, pruning public node. Deliberately NOT in
 * instrumentation.ts: that compiles for the edge runtime too, where `pg`
 * (node builtins) cannot be bundled. Here it only enters the nodejs bundle.
 *
 * Best-effort and gated on DATABASE_URL:
 *   - no DATABASE_URL  -> no-op, reads stay on the live-RPC fallback.
 *   - registration throws (DB unreachable) -> swallowed, reads stay on RPC, and
 *     the next tick retries. A store problem must NEVER break a tick or the
 *     world's pause/resume control.
 */
import { setEventStore } from '@endless-story/sdk';

let registered = false;

export async function ensureEventStoreRegistered(): Promise<void> {
  if (registered) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    registered = true; // nothing to wire up; don't re-check every tick
    return;
  }

  try {
    const { PgEventStore, makePool, ensureSchema } = await import('@endless-story/indexer/pg');
    const pool = makePool(databaseUrl);
    await ensureSchema(pool);
    setEventStore(new PgEventStore(pool));
    registered = true;
    console.log('[event-store] registered (reads now served from Postgres)');
  } catch (err) {
    // Leave it unregistered so reads fall back to live RPC and the next tick
    // retries. Never rethrow: the tick (and the world switch) must keep working.
    console.error('[event-store] registration failed; staying on RPC, will retry next tick', err);
  }
}
