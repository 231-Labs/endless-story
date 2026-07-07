/**
 * Adapters between the Sui JSON-RPC `queryEvents` shape and the store's
 * `EventQuery` / `EventPage`. Pure and structurally typed (no `@mysten/sui`
 * dependency), so the sdk read seam can translate in a couple of lines and the
 * mapping itself is unit-tested here rather than inside the sdk.
 */
import type { EventCursor, EventPage, EventQuery } from './types.ts';

/** Structural subset of the RPC `queryEvents` params we read. */
export interface RpcQueryEventsParams {
  query: unknown;
  cursor?: EventCursor | null;
  limit?: number | null;
  order?: 'ascending' | 'descending' | null;
}

/**
 * Map RPC params to a store `EventQuery`, or return null when the filter is
 * not a `MoveEventType` the store can answer (the caller then falls back to
 * live RPC). `MoveEventType` is the only filter the engine uses for events.
 */
export function rpcParamsToQuery(params: RpcQueryEventsParams): EventQuery | null {
  const q = params.query;
  if (!q || typeof q !== 'object' || !('MoveEventType' in q)) return null;
  const moveEventType = (q as { MoveEventType: unknown }).MoveEventType;
  if (typeof moveEventType !== 'string') return null;
  return {
    moveEventType,
    cursor: params.cursor ?? null,
    limit: params.limit ?? undefined,
    order: params.order ?? undefined,
  };
}

/** The RPC `PaginatedEvents` subset that `queryEvents` callers actually read. */
export interface RpcEventsPage {
  data: Array<{ id: EventCursor; type: string; parsedJson: unknown; timestampMs: string }>;
  hasNextPage: boolean;
  nextCursor: EventCursor | null;
}

/** Shape a store page like the RPC result so it drops into callers unchanged. */
export function eventPageToRpc(page: EventPage): RpcEventsPage {
  return {
    data: page.data.map((r) => ({
      id: r.id,
      type: r.type,
      parsedJson: r.parsedJson,
      timestampMs: r.timestampMs,
    })),
    hasNextPage: page.hasNextPage,
    nextCursor: page.nextCursor,
  };
}
