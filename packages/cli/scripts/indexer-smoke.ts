/**
 * End-to-end smoke for the self-hosted indexer, against the live testnet
 * package via the public node (no credentials). It:
 *   1. polls once into the store and reports how many events landed,
 *   2. censuses a few event types from the store,
 *   3. proves the read seam routes to the store: it registers the store, then
 *      calls the engine's own read fn with a guard client whose queryEvents
 *      throws. No throw => the read was served by the store, not RPC.
 *
 *   DATABASE_URL=postgres://... tsx scripts/indexer-smoke.ts
 */
import { makeSuiClient, ENDLESS_STORY_DEPLOYMENT, setEventStore, read } from '@endless-story/sdk';
import { PgEventStore, makePool } from '@endless-story/indexer/pg';
import { pollOnce, graphqlExecFromUrl, DEFAULT_GRAPHQL_URL } from './lib/indexer-poll.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = makePool(url);
const store = new PgEventStore(pool);
const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;

console.log(`[smoke] package ${pkg}`);
const ingested = await pollOnce(
  store,
  graphqlExecFromUrl(process.env.SUI_GRAPHQL_URL ?? DEFAULT_GRAPHQL_URL),
  pkg,
  new Map(),
);
console.log(`[smoke] poll ingested ${ingested} events`);

for (const suffix of [
  'event::BudgetEventPushed',
  'event::CharacterJoinedEvent',
  'resource::ResourceInstantiated',
  'character::CharacterMinted',
]) {
  const page = await store.queryEvents({ moveEventType: `${pkg}::${suffix}`, limit: 1000 });
  console.log(`[smoke]   ${suffix}: ${page.data.length} in store`);
}

// Seam check: register the store, then read through the engine with a guard
// client that explodes if RPC is touched.
setEventStore(store);
const guard = makeSuiClient({ network: 'testnet' });
(guard as unknown as { queryEvents: () => never }).queryEvents = () => {
  throw new Error('RPC SHOULD NOT BE CALLED — the seam must read the store');
};
const summaries = await read.event.listBudgetEvents(guard, pkg, { maxEvents: 5 });
console.log(`[smoke] seam OK: listBudgetEvents returned ${summaries.length} via the store (RPC untouched)`);

setEventStore(null);
await pool.end();
console.log('[smoke] done');
