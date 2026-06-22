/**
 * Flux Streams capture loop (node-only).
 *
 * Connects to the Flux SSE endpoint, decodes each event, upserts it into the
 * store, and advances the persisted `last-id` cursor. On disconnect it
 * reconnects with a small backoff, resuming from the saved cursor so no
 * event is missed or double-counted (upsert is idempotent regardless).
 *
 * The decoding is pure (`./flux.ts`); this file is the thin I/O shell.
 */
import { PgEventStore } from './pg.ts';
import { SseDecoder, parseFluxMessage } from './flux.ts';

export interface CaptureConfig {
  /** e.g. https://testnet-flux.surflux.dev/events */
  baseUrl: string;
  apiKey: string;
  /** Identifies this stream's resume cursor, e.g. "testnet:0xpkg:package". */
  streamKey: string;
  store: PgEventStore;
  signal?: AbortSignal;
  /** `last-id` when no cursor is saved yet: "$" = live only, "0" = replay
   *  Flux's retained window (the seed). Defaults to "$". */
  startFrom?: string;
  /** Reconnect backoff in ms. Default 2000. */
  reconnectMs?: number;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

export async function runCapture(cfg: CaptureConfig): Promise<void> {
  const decoder = new SseDecoder();
  const td = new TextDecoder();

  while (!cfg.signal?.aborted) {
    const saved = await cfg.store.loadFluxCursor(cfg.streamKey);
    const lastId = saved ?? cfg.startFrom ?? '$';
    const url =
      `${cfg.baseUrl}?api-key=${encodeURIComponent(cfg.apiKey)}` +
      `&last-id=${encodeURIComponent(lastId)}`;

    try {
      const res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: cfg.signal });
      if (!res.ok || !res.body) throw new Error(`flux connect failed: ${res.status}`);

      const reader = res.body.getReader();
      while (!cfg.signal?.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const frame of decoder.push(td.decode(value, { stream: true }))) {
          let parsed: ReturnType<typeof parseFluxMessage>;
          try {
            parsed = parseFluxMessage(frame);
          } catch {
            continue; // a single malformed frame must not kill the stream
          }
          if (!parsed) continue;
          await cfg.store.upsert(parsed.event);
          await cfg.store.saveFluxCursor(cfg.streamKey, parsed.fluxId);
        }
      }
    } catch (err) {
      if (cfg.signal?.aborted) return;
      await sleep(cfg.reconnectMs ?? 2000, cfg.signal);
    }
  }
}
