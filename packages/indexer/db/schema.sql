-- Durable chain-event store. Design reference for the Postgres-backed
-- EventStore (PgEventStore lands in the next increment); kept in sync with
-- packages/indexer/src/page.ts, which is the semantics oracle.
--
-- Identity + ordering mirror the JSON-RPC queryEvents contract:
--   * primary key (tx_digest, event_seq)  -> idempotent capture + backfill
--   * canonical order (timestamp_ms, tx_digest, event_seq) -> stable keyset
--     pagination, since Sui tx digests are content hashes, not chronological.

CREATE TABLE IF NOT EXISTS chain_events (
    tx_digest    text        NOT NULL,
    event_seq    text        NOT NULL,            -- string: event_seq can exceed JS safe int
    event_type   text        NOT NULL,            -- fully-qualified ${pkg}::module::Struct
    package_id   text        NOT NULL,
    module       text        NOT NULL,
    sender       text,
    parsed_json  jsonb       NOT NULL,
    bcs          text,                            -- base64, optional
    timestamp_ms bigint      NOT NULL,            -- emit time; canonical sort key
    checkpoint   bigint,                          -- optional, for backfill bookkeeping
    saga_id      text,                            -- denormalized from parsed_json for cheap filters
    scene_id     text,
    ingested_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_digest, event_seq)
);

-- Keyset pagination per event type, both directions. The descending index
-- backs the default newest-first scans; ascending backs the runner replay.
CREATE INDEX IF NOT EXISTS chain_events_type_desc
    ON chain_events (event_type, timestamp_ms DESC, tx_digest DESC, event_seq DESC);
CREATE INDEX IF NOT EXISTS chain_events_type_asc
    ON chain_events (event_type, timestamp_ms ASC, tx_digest ASC, event_seq ASC);

-- Cheap saga-scoped feed reads without a parsed_json probe.
CREATE INDEX IF NOT EXISTS chain_events_saga
    ON chain_events (saga_id, event_type, timestamp_ms DESC);

-- Flux Streams resume points. One row per logical stream (package x network).
-- last_event_id is the SSE `last-id` we replay from after a restart.
CREATE TABLE IF NOT EXISTS flux_cursors (
    stream_key    text        PRIMARY KEY,        -- e.g. "testnet:0xpkg:package-events"
    last_event_id text        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
