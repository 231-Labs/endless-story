/**
 * Postgres-backed EventReader (node-only; imports `pg`).
 *
 * Reads reproduce the page.ts semantics via keyset pagination (see
 * `buildPageQuery`). Writes upsert idempotently on the `(tx_digest,
 * event_seq)` primary key, so a Flux replay and a backfill that touch the
 * same event converge instead of duplicating it. The SQL builder is pure
 * and unit-tested; the `pg` execution is a thin wrapper, smoke-tested
 * against a real database once `DATABASE_URL` is wired.
 */
import { Pool } from 'pg';
import type {
  CapturedEvent,
  EventPage,
  EventQuery,
  EventReader,
  EventRow,
} from './types.ts';

export interface PageSql {
  text: string;
  values: unknown[];
}

/**
 * Build one `queryEvents` page as keyset-pagination SQL. Pure: the exact
 * SQL and bind values are asserted in tests without a database. Fetches
 * `limit + 1` rows so `hasNextPage` needs no second count query, and
 * threads the `{txDigest, eventSeq}` cursor by looking its sort key up by
 * primary key (the public cursor stays opaque, as the RPC contract wants).
 */
export function buildPageQuery(query: EventQuery): PageSql {
  const desc = (query.order ?? 'descending') === 'descending';
  const dir = desc ? 'DESC' : 'ASC';
  const cmp = desc ? '<' : '>';
  const limit = query.limit ?? 50;

  const conds: string[] = [];
  const values: unknown[] = [];
  const bind = (v: unknown): string => {
    values.push(v);
    return `$${values.length}`;
  };

  if (query.moveEventType) conds.push(`e.event_type = ${bind(query.moveEventType)}`);

  if (query.cursor) {
    const tx = bind(query.cursor.txDigest);
    const seq = bind(query.cursor.eventSeq);
    // Strictly after the cursor row in canonical order. The cursor's sort
    // key is fetched by PK, so the opaque {tx,seq} cursor is enough.
    conds.push(
      `(e.timestamp_ms, e.tx_digest, e.event_seq::bigint) ${cmp} ` +
        `(SELECT c.timestamp_ms, c.tx_digest, c.event_seq::bigint FROM chain_events c ` +
        `WHERE c.tx_digest = ${tx} AND c.event_seq = ${seq})`,
    );
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const text =
    `SELECT e.tx_digest, e.event_seq, e.event_type, e.parsed_json, e.timestamp_ms ` +
    `FROM chain_events e ${where} ` +
    `ORDER BY e.timestamp_ms ${dir}, e.tx_digest ${dir}, e.event_seq::bigint ${dir} ` +
    `LIMIT ${bind(limit + 1)}`;
  return { text, values };
}

/** Split a fully-qualified `${pkg}::${module}::${struct}` into `[pkg, module]`. */
export function splitType(type: string): [string, string] {
  const parts = type.split('::');
  return [parts[0] ?? '', parts[1] ?? ''];
}

type Row = {
  tx_digest: string;
  event_seq: string;
  event_type: string;
  parsed_json: unknown;
  timestamp_ms: string;
};

export class PgEventStore implements EventReader {
  // Explicit field + assignment rather than a constructor parameter property:
  // Node's strip-only TS mode (`node --test`) rejects parameter properties.
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async queryEvents(query: EventQuery): Promise<EventPage> {
    const limit = query.limit ?? 50;
    const { text, values } = buildPageQuery(query);
    const res = await this.pool.query<Row>(text, values);
    const hasNextPage = res.rows.length > limit;
    const rows = hasNextPage ? res.rows.slice(0, limit) : res.rows;
    const data: EventRow[] = rows.map((r) => ({
      id: { txDigest: r.tx_digest, eventSeq: r.event_seq },
      type: r.event_type,
      parsedJson: r.parsed_json,
      timestampMs: String(r.timestamp_ms),
    }));
    const last = rows[rows.length - 1];
    return {
      data,
      hasNextPage,
      nextCursor: last ? { txDigest: last.tx_digest, eventSeq: last.event_seq } : null,
    };
  }

  /** Idempotent upsert on `(tx_digest, event_seq)`. Last write wins, so a
   *  re-emitted or backfilled copy refreshes the row in place. */
  async upsert(e: CapturedEvent): Promise<void> {
    const [packageId, moduleName] = splitType(e.type);
    await this.pool.query(
      `INSERT INTO chain_events
         (tx_digest, event_seq, event_type, package_id, module, sender,
          parsed_json, bcs, timestamp_ms, checkpoint, saga_id, scene_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tx_digest, event_seq) DO UPDATE SET
         parsed_json  = EXCLUDED.parsed_json,
         timestamp_ms = EXCLUDED.timestamp_ms,
         checkpoint   = EXCLUDED.checkpoint,
         saga_id      = EXCLUDED.saga_id,
         scene_id     = EXCLUDED.scene_id`,
      [
        e.txDigest,
        e.eventSeq,
        e.type,
        packageId,
        moduleName,
        e.sender ?? null,
        JSON.stringify(e.parsedJson ?? null),
        e.bcs ?? null,
        e.timestampMs,
        e.checkpoint ?? null,
        e.sagaId ?? null,
        e.sceneId ?? null,
      ],
    );
  }

  /** Last Flux SSE id processed for a stream, used as the `last-id` on resume. */
  async loadFluxCursor(streamKey: string): Promise<string | null> {
    const res = await this.pool.query<{ last_event_id: string }>(
      `SELECT last_event_id FROM flux_cursors WHERE stream_key = $1`,
      [streamKey],
    );
    return res.rows[0]?.last_event_id ?? null;
  }

  async saveFluxCursor(streamKey: string, lastEventId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO flux_cursors (stream_key, last_event_id, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (stream_key) DO UPDATE SET
         last_event_id = EXCLUDED.last_event_id, updated_at = now()`,
      [streamKey, lastEventId],
    );
  }
}

/** Construct a pooled connection from a `DATABASE_URL`-style string. */
export function makePool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

/**
 * Create the tables and indexes if they do not exist (idempotent). Mirrors
 * db/schema.sql; run on the poller and the web server boot so whichever
 * starts first provisions the store, with no manual `psql` step at deploy.
 */
export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chain_events (
      tx_digest    text        NOT NULL,
      event_seq    text        NOT NULL,
      event_type   text        NOT NULL,
      package_id   text        NOT NULL,
      module       text        NOT NULL,
      sender       text,
      parsed_json  jsonb       NOT NULL,
      bcs          text,
      timestamp_ms bigint      NOT NULL,
      checkpoint   bigint,
      saga_id      text,
      scene_id     text,
      ingested_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tx_digest, event_seq)
    );
    CREATE INDEX IF NOT EXISTS chain_events_type_desc
      ON chain_events (event_type, timestamp_ms DESC, tx_digest DESC, event_seq DESC);
    CREATE INDEX IF NOT EXISTS chain_events_type_asc
      ON chain_events (event_type, timestamp_ms ASC, tx_digest ASC, event_seq ASC);
    CREATE INDEX IF NOT EXISTS chain_events_saga
      ON chain_events (saga_id, event_type, timestamp_ms DESC);
    CREATE TABLE IF NOT EXISTS flux_cursors (
      stream_key    text        PRIMARY KEY,
      last_event_id text        NOT NULL,
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
}
