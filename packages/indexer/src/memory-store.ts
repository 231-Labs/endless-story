/**
 * In-memory `EventReader`, backed by a plain array. Used by tests and as a
 * drop-in fake for the sdk seam (the same role the settlement harness's
 * fake-chain plays for the write path). Not for production reads: the
 * Postgres-backed store is authoritative.
 */
import type { EventPage, EventQuery, EventReader, StoredEvent } from './types.ts';
import { pageEvents } from './page.ts';

export class MemoryEventStore implements EventReader {
  private rows: StoredEvent[] = [];

  constructor(seed: readonly StoredEvent[] = []) {
    for (const e of seed) this.insert(e);
  }

  /**
   * Idempotent upsert keyed on `(txDigest, eventSeq)`, matching the
   * Postgres primary key. Re-inserting the same id overwrites in place, so
   * Flux stream replays and backfill overlap are safe (the same property
   * `ON CONFLICT DO UPDATE` gives the real store).
   */
  insert(e: StoredEvent): void {
    const i = this.rows.findIndex(
      (r) => r.txDigest === e.txDigest && r.eventSeq === e.eventSeq,
    );
    if (i >= 0) this.rows[i] = e;
    else this.rows.push(e);
  }

  get size(): number {
    return this.rows.length;
  }

  async queryEvents(query: EventQuery): Promise<EventPage> {
    return pageEvents(this.rows, query);
  }
}
