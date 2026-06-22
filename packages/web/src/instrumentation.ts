/**
 * Server-boot instrumentation (Next.js runs `register` once at startup).
 *
 * Registers the durable event store so event reads (settlement, feeds) come
 * from Postgres instead of the rate-limited, pruning public node. Gated on
 * DATABASE_URL: when it is unset, behavior is unchanged (live RPC fallback).
 * Runs only in the Node.js server runtime, never edge or client.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const { setEventStore } = await import('@endless-story/sdk');
  const { PgEventStore, makePool, ensureSchema } = await import('@endless-story/indexer/pg');

  const pool = makePool(databaseUrl);
  await ensureSchema(pool);
  setEventStore(new PgEventStore(pool));
  console.log('[instrumentation] event store registered (reads now served from Postgres)');
}
