/**
 * Server-only (nodejs) registration of the durable event store.
 *
 * Called from the nodejs tick route so settlement / feed reads come from
 * Postgres instead of the rate-limited, pruning public node. Deliberately NOT
 * in instrumentation.ts: that compiles for the edge runtime too, where `pg`
 * (which pulls node builtins) cannot be bundled. Here it only ever enters the
 * nodejs server bundle.
 *
 * Idempotent (one registration per server process) and gated on DATABASE_URL:
 * unset means unchanged behavior (live RPC fallback).
 */
import { setEventStore } from '@endless-story/sdk';

let registration: Promise<void> | null = null;

async function doRegister(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return; // no store configured: keep the live RPC path

  const { PgEventStore, makePool, ensureSchema } = await import('@endless-story/indexer/pg');
  const pool = makePool(databaseUrl);
  await ensureSchema(pool);
  setEventStore(new PgEventStore(pool));
  console.log('[event-store] registered (reads now served from Postgres)');
}

/** Register the event store once per process. Safe no-op without DATABASE_URL. */
export function ensureEventStoreRegistered(): Promise<void> {
  if (!registration) registration = doRegister();
  return registration;
}
