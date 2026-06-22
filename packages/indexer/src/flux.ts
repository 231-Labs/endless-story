/**
 * Surflux Flux Streams wire decoding (pure, browser-safe).
 *
 * Flux delivers package events as SSE over HTTP. Each message carries an
 * `id:` line (the resumable `last-id`, formatted `<ms>-<n>`) and a `data:`
 * JSON body:
 *
 *   { type: "package_event", timestamp_ms, checkpoint_id, tx_hash,
 *     data: { event_type, sender, contents } }
 *
 * Identity note (the load-bearing decision): the payload has no on-chain
 * `event_seq`. We derive `eventSeq` from the numeric suffix of the SSE id.
 * Within one transaction every event shares `timestamp_ms` and the suffix
 * increments, so the suffix is unique per `txDigest` and monotonic in
 * on-chain order; it is also stable across Flux's `last-id` replay. That
 * keeps the `(txDigest, eventSeq)` primary key idempotent on both replay
 * and the live tail. It is deliberately NOT the real on-chain `eventSeq`:
 * the engine only round-trips the cursor, it never matches `eventSeq`
 * against the chain. (This is also why Flux must be the single capture
 * source: a JSON-RPC backfill would assign the real seq and collide.)
 */
import type { CapturedEvent } from './types.ts';

export interface SseFrame {
  id?: string;
  event?: string;
  data: string;
}

/**
 * Incremental SSE line decoder. Feed it raw text chunks; it emits one
 * `SseFrame` per blank-line-terminated message, buffering partial frames
 * across chunk boundaries. Comment lines (`:` heartbeats) are ignored.
 */
export class SseDecoder {
  private buf = '';
  private cur: { id?: string; event?: string; data: string[] } = { data: [] };

  push(chunk: string): SseFrame[] {
    this.buf += chunk;
    const frames: SseFrame[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      let line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);

      if (line === '') {
        if (this.cur.id !== undefined || this.cur.event !== undefined || this.cur.data.length) {
          frames.push({ id: this.cur.id, event: this.cur.event, data: this.cur.data.join('\n') });
        }
        this.cur = { data: [] };
        continue;
      }
      if (line.startsWith(':')) continue; // comment / keepalive

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'id') this.cur.id = value;
      else if (field === 'event') this.cur.event = value;
      else if (field === 'data') this.cur.data.push(value);
    }
    return frames;
  }
}

/** The numeric suffix of a Flux SSE id (`<ms>-<n>` -> `<n>`), used as the
 *  store's `eventSeq`. Throws on a shape we did not expect, so a wire change
 *  surfaces immediately instead of silently corrupting identity. */
export function fluxSeqFromId(id: string): string {
  const dash = id.lastIndexOf('-');
  const suffix = dash >= 0 ? id.slice(dash + 1) : id;
  if (!/^\d+$/.test(suffix)) {
    throw new Error(`Flux SSE id "${id}" has no numeric suffix to use as eventSeq`);
  }
  return suffix;
}

interface FluxPayload {
  type?: string;
  timestamp_ms?: number;
  checkpoint_id?: number;
  tx_hash?: string;
  data?: { event_type?: string; sender?: string; contents?: unknown };
}

function pickId(contents: unknown, key: string): string | undefined {
  if (contents && typeof contents === 'object' && key in contents) {
    const v = (contents as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/**
 * Decode one SSE frame into a `CapturedEvent` plus its Flux id (the next
 * `last-id` to persist). Returns null for frames we cannot key as an event
 * (missing id, missing tx_hash/event_type) so the caller can skip them.
 * Throws only on a malformed id, by design (see `fluxSeqFromId`).
 */
export function parseFluxMessage(frame: SseFrame): { event: CapturedEvent; fluxId: string } | null {
  if (!frame.id) return null;
  const payload = JSON.parse(frame.data) as FluxPayload;
  const txDigest = payload.tx_hash;
  const type = payload.data?.event_type;
  if (!txDigest || !type) return null;

  const contents = payload.data?.contents ?? null;
  const event: CapturedEvent = {
    txDigest,
    eventSeq: fluxSeqFromId(frame.id),
    type,
    parsedJson: contents,
    timestampMs: payload.timestamp_ms ?? 0,
    sender: payload.data?.sender,
    checkpoint: payload.checkpoint_id,
    sagaId: pickId(contents, 'saga_id'),
    sceneId: pickId(contents, 'scene_id'),
  };
  return { event, fluxId: frame.id };
}
