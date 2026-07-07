/**
 * Self-hosted event poller wiring for Endless Story.
 *
 * Lives in cli (not packages/indexer) so it can pull both @endless-story/sdk
 * and @endless-story/indexer without the sdk<->indexer cycle the indexer
 * package forbids. The registry is the set of event types the engine actually
 * reads, so the store can serve every MoveEventType the read seam asks for.
 */
import type { PgEventStore } from '@endless-story/indexer/pg';
import type { HighWater, GraphqlExec } from '@endless-story/indexer';
import { pollAllOnce, graphqlFetchPage } from '@endless-story/indexer';

/** Public Sui testnet GraphQL endpoint (rate-limited; override with SUI_GRAPHQL_URL). */
export const DEFAULT_GRAPHQL_URL = 'https://graphql.testnet.sui.io/graphql';

/**
 * A `GraphqlExec` over plain `fetch` against a Sui GraphQL endpoint. Kept
 * dependency-light (no SDK GraphQL client) — the poller only needs the `events`
 * query, which this posts directly and unwraps to `data` (throwing on errors).
 */
export function graphqlExecFromUrl(url: string): GraphqlExec {
  return async (query, variables) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`[indexer-poll] GraphQL HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown; errors?: unknown };
    if (json.errors) {
      throw new Error(`[indexer-poll] GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
    }
    return json.data;
  };
}

/** `module::Struct` suffixes the engine reads (read/*.ts MoveEventType filters). */
export const EVENT_TYPE_SUFFIXES = [
  'event::BudgetEventPushed',
  'event::BudgetEventResolved',
  'event::CharacterJoinedEvent',
  'resource::ResourceInstantiated',
  'resource::ResourceRetired',
  'resource::AllocationChanged',
  'character::CharacterMinted',
  'commitment::CommitmentCreated',
  'director::RelationshipSeeded',
  'dream::DreamInjected',
  'reflection::ReflectionCommitted',
  'recruit::GenesisVoucherRedeemed',
] as const;

export const eventTypes = (packageId: string): string[] =>
  EVENT_TYPE_SUFFIXES.map((s) => `${packageId}::${s}`);

const markKey = (type: string): string => `poll:${type}`;

/** Per-type high-water marks survive restarts in the flux_cursors table. */
export async function loadMarks(
  store: PgEventStore,
  types: string[],
): Promise<Map<string, HighWater | null>> {
  const marks = new Map<string, HighWater | null>();
  for (const t of types) {
    const raw = await store.loadFluxCursor(markKey(t));
    marks.set(t, raw ? (JSON.parse(raw) as HighWater) : null);
  }
  return marks;
}

async function saveMarks(store: PgEventStore, marks: Map<string, HighWater | null>): Promise<void> {
  for (const [t, hwm] of marks) {
    if (hwm) await store.saveFluxCursor(markKey(t), JSON.stringify(hwm));
  }
}

/** One poll pass over every tracked type, persisting the marks afterward. */
export async function pollOnce(
  store: PgEventStore,
  exec: GraphqlExec,
  packageId: string,
  marks: Map<string, HighWater | null>,
): Promise<number> {
  const fetchPage = graphqlFetchPage(exec);
  const ingested = await pollAllOnce(
    fetchPage,
    (e) => store.upsert(e),
    eventTypes(packageId),
    marks,
  );
  await saveMarks(store, marks);
  return ingested;
}
