/**
 * Long-running self-hosted event poller. Fills the durable store the read
 * seam reads from, so settlement / feeds stop hitting the rate-limited,
 * pruning public node.
 *
 *   pnpm --filter @endless-story/cli indexer-poll
 *
 * Env: DATABASE_URL (required), SUI_GRAPHQL_URL (optional, defaults to the
 * official testnet GraphQL endpoint), POLL_INTERVAL_MS (optional, default 30000).
 *
 * Events are pulled over GraphQL — JSON-RPC (the old source) is being
 * decommissioned, and gRPC has no `queryEvents` equivalent.
 */
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { PgEventStore, makePool, ensureSchema } from '@endless-story/indexer/pg';
import {
  eventTypes,
  loadMarks,
  pollOnce,
  graphqlExecFromUrl,
  DEFAULT_GRAPHQL_URL,
} from './lib/indexer-poll.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[indexer-poll] DATABASE_URL is required');
  process.exit(1);
}
const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 30000);

const pool = makePool(databaseUrl);
const store = new PgEventStore(pool);
await ensureSchema(pool);
const graphqlUrl = process.env.SUI_GRAPHQL_URL ?? DEFAULT_GRAPHQL_URL;
const exec = graphqlExecFromUrl(graphqlUrl);
const packageId = ENDLESS_STORY_DEPLOYMENT.packageId;
const types = eventTypes(packageId);
const marks = await loadMarks(store, types);

let stop = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.error(`[indexer-poll] ${sig}, stopping after this cycle`);
    stop = true;
  });
}

console.error(
  `[indexer-poll] polling ${types.length} event types every ${intervalMs}ms via ${graphqlUrl}`,
);
while (!stop) {
  try {
    const n = await pollOnce(store, exec, packageId, marks);
    if (n > 0) console.error(`[indexer-poll] ingested ${n} new events`);
  } catch (err) {
    console.error('[indexer-poll] cycle error', err);
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}
process.exit(0);
