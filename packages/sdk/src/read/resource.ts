/**
 * Drama resource ledger view queries — get object + scan event log.
 *
 * Three event types are emitted by resource.move:
 *   - `ResourceInstantiated` — a contested resource was created under a saga
 *   - `AllocationChanged`     — a batch of transfers settled (carries the new
 *                               `total_allocated` + `transfer_count`)
 *   - `ResourceRetired`       — a drained resource was destroyed
 *
 * **Off-chain SATISFACTION phase** (`@endless-story/drama`) keys on these:
 * discover the saga's live resources via `listResourceInstantiations` minus
 * `listResourceRetirements`, then replay `AllocationChanged` to rebuild the
 * allocation history it needs to recompute tension deterministically.
 *
 * Per-holder allocations live in a Move `Table` (a dynamic field collection);
 * the parsed `DramaResource` struct gives `capacity` / `total_allocated` /
 * `archetype` / `label` but NOT individual holdings. For a single holder's
 * units, devInspect the `held_by` view (tx.resource.heldBy) or replay the
 * canonical transfer log. We keep this read layer thin + event-driven, like
 * the rest of `read/`.
 */
import * as gen from '../generated/endless_story/resource.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getResource = (client: SuiClient, resourceId: string) =>
    gen.DramaResource.get({ client, objectId: resourceId });

export const getManyResources = (client: SuiClient, ids: string[]) =>
    gen.DramaResource.getMany({ client, objectIds: ids });

/** One row of the `ResourceInstantiated` event log. */
export interface ResourceInstantiatedSummary {
    resourceId: string;
    sagaId: string;
    /** structural "bone" kind (e.g. "capacity-1-slot"); narrative-facing. */
    archetype: string;
    /** human label (e.g. "partnership:<name>"); narrative-facing. */
    label: string;
    capacity: string;
    createdAtMs: string;
    txDigest: string;
    eventSeq: string;
}

/** One row of the `AllocationChanged` event log — a settled transfer batch. */
export interface AllocationChangedSummary {
    resourceId: string;
    sagaId: string;
    /** number of transfers in the settled batch. */
    transferCount: string;
    /** sum(allocations) after this batch — the conserved total. */
    totalAllocated: string;
    changedAtMs: string;
    txDigest: string;
    eventSeq: string;
}

export interface ListResourceEventsOptions {
    /** Filter: only events under this saga. Omit → all sagas. */
    sagaId?: string;
    /** Filter: only events for this resource. Omit → all resources. */
    resourceId?: string;
    /** Cap on entries returned (newest-first). Default unlimited (paginates to end). */
    maxEvents?: number;
}

/**
 * Scan `ResourceInstantiated` events for the deployed package, newest-first.
 * The off-chain engine uses this (minus `listResourceRetirements`) to discover
 * a saga's live contested-resource set without holding a Saga object ref.
 */
export async function listResourceInstantiations(
    client: SuiClient,
    packageId: string,
    opts: ListResourceEventsOptions = {},
): Promise<ResourceInstantiatedSummary[]> {
    const eventType = `${packageId}::resource::ResourceInstantiated`;
    const out: ResourceInstantiatedSummary[] = [];
    const cap = opts.maxEvents ?? Infinity;
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await client.queryEvents({
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                resource_id: string;
                saga_id: string;
                archetype: string;
                label: string;
                capacity: string | number;
                created_at_ms: string | number;
            }>;
            if (!parsed.resource_id) continue;
            const sagaId = parsed.saga_id ?? '';
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            if (opts.resourceId && parsed.resource_id !== opts.resourceId) continue;
            out.push({
                resourceId: parsed.resource_id,
                sagaId,
                archetype: parsed.archetype ?? '',
                label: parsed.label ?? '',
                capacity: String(parsed.capacity ?? '0'),
                createdAtMs: String(parsed.created_at_ms ?? '0'),
                txDigest: ev.id.txDigest,
                eventSeq: ev.id.eventSeq,
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

/** Scan `ResourceRetired` events, newest-first → resource ids no longer live. */
export async function listResourceRetirements(
    client: SuiClient,
    packageId: string,
    opts: ListResourceEventsOptions = {},
): Promise<{ resourceId: string; sagaId: string }[]> {
    const eventType = `${packageId}::resource::ResourceRetired`;
    const out: { resourceId: string; sagaId: string }[] = [];
    const cap = opts.maxEvents ?? Infinity;
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await client.queryEvents({
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{ resource_id: string; saga_id: string }>;
            if (!parsed.resource_id) continue;
            const sagaId = parsed.saga_id ?? '';
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            if (opts.resourceId && parsed.resource_id !== opts.resourceId) continue;
            out.push({ resourceId: parsed.resource_id, sagaId });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}

/**
 * Scan `AllocationChanged` events, newest-first. Each row is a settled batch
 * carrying the conserved `total_allocated` after it — the off-chain engine
 * replays these (oldest→newest) to reconstruct the allocation trajectory.
 */
export async function listAllocationChanges(
    client: SuiClient,
    packageId: string,
    opts: ListResourceEventsOptions = {},
): Promise<AllocationChangedSummary[]> {
    const eventType = `${packageId}::resource::AllocationChanged`;
    const out: AllocationChangedSummary[] = [];
    const cap = opts.maxEvents ?? Infinity;
    let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
    for (;;) {
        const page = await client.queryEvents({
            query: { MoveEventType: eventType },
            cursor,
            limit: 50,
            order: 'descending',
        });
        for (const ev of page.data) {
            const parsed = ev.parsedJson as Partial<{
                resource_id: string;
                saga_id: string;
                transfer_count: string | number;
                total_allocated: string | number;
                changed_at_ms: string | number;
            }>;
            if (!parsed.resource_id) continue;
            const sagaId = parsed.saga_id ?? '';
            if (opts.sagaId && sagaId !== opts.sagaId) continue;
            if (opts.resourceId && parsed.resource_id !== opts.resourceId) continue;
            out.push({
                resourceId: parsed.resource_id,
                sagaId,
                transferCount: String(parsed.transfer_count ?? '0'),
                totalAllocated: String(parsed.total_allocated ?? '0'),
                changedAtMs: String(parsed.changed_at_ms ?? '0'),
                txDigest: ev.id.txDigest,
                eventSeq: ev.id.eventSeq,
            });
            if (out.length >= cap) return out;
        }
        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
    }
    return out;
}
