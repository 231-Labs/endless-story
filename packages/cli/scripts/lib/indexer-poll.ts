/**
 * Self-hosted event poller wiring for Endless Story.
 *
 * Lives in cli (not packages/indexer) so it can pull both @endless-story/sdk
 * and @endless-story/indexer without the sdk<->indexer cycle the indexer
 * package forbids. The registry is the set of event types the engine actually
 * reads, so the store can serve every MoveEventType the read seam asks for.
 */
import type { PgEventStore } from '@endless-story/indexer/pg';
import type { HighWater, QueryEventsClient } from '@endless-story/indexer';
import { pollAllOnce, jsonRpcFetchPage } from '@endless-story/indexer';

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
  client: QueryEventsClient,
  packageId: string,
  marks: Map<string, HighWater | null>,
): Promise<number> {
  const fetchPage = jsonRpcFetchPage(client);
  const ingested = await pollAllOnce(
    fetchPage,
    (e) => store.upsert(e),
    eventTypes(packageId),
    marks,
  );
  await saveMarks(store, marks);
  return ingested;
}
