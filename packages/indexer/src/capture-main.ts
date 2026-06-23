/**
 * Capture entrypoint. Run as a long-lived service:
 *
 *   DATABASE_URL=postgres://...  SURFLUX_API_KEY=...  node src/capture-main.ts
 *
 * Optional env:
 *   FLUX_URL         override the SSE endpoint (default testnet package events)
 *   FLUX_STREAM_KEY  resume-cursor key (default "testnet:package-events")
 *   FLUX_START       initial last-id when no cursor is saved ("$" live, "0" replay)
 *
 * Event filters (which package / events) are configured in the Surflux
 * dashboard, not here.
 */
import { makePool, PgEventStore } from './pg.ts';
import { runCapture } from './capture.ts';

const databaseUrl = process.env.DATABASE_URL;
const apiKey = process.env.SURFLUX_API_KEY;
if (!databaseUrl || !apiKey) {
  console.error('[capture] DATABASE_URL and SURFLUX_API_KEY are required');
  process.exit(1);
}

const store = new PgEventStore(makePool(databaseUrl));
const controller = new AbortController();
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.error(`[capture] ${sig}, shutting down`);
    controller.abort();
  });
}

console.error('[capture] starting Flux capture loop');
runCapture({
  baseUrl: process.env.FLUX_URL ?? 'https://testnet-flux.surflux.dev/events',
  apiKey,
  streamKey: process.env.FLUX_STREAM_KEY ?? 'testnet:package-events',
  store,
  signal: controller.signal,
  startFrom: process.env.FLUX_START,
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[capture] fatal', err);
    process.exit(1);
  });
