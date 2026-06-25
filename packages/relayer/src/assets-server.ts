// Walrus asset service — HTTP server. A separate process from the MemWAL relayer
// (server.ts). Zero npm deps, node:http, plain TS: `node src/assets-server.ts`.
// Default PORT 8788 (relayer = 8787).
//
// Endpoints (spec in docs/narrative/ASSET_MANAGEMENT.md §4):
//   GET    /health                       → { ok, walrus, assets, network }
//   GET    /api/manifest/hero-clips       → { clips:[...] }   (public; frontend DEMO_CLIPS_URL hits this)
//   GET    /api/assets[?category=]        → { assets:[view], currentEpoch }   (authed)
//   POST   /api/assets?category=&label=&epochs=&deletable=&meta=  body=raw bytes  (authed)
//   GET    /api/assets/wallet             → { sui, wal }                       (authed)
//   POST   /api/assets/:id/extend  { epochs }                                  (authed)
//   PATCH  /api/assets/:id  { status?, autoRenew?, label? }                    (authed)
//   DELETE /api/assets/:id                                                     (authed)
//
// Auth: when RELAYER_SECRET is set, everything except /health and the manifest requires
// `Authorization: Bearer <s>`.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { authed, cors, readBytes, readJson, send } from "./http-util.ts";
import { AssetStore } from "./asset-store.ts";
import { AssetWalrus } from "./asset-walrus.ts";
import { renewDue, type RenewConfig, type RenewSummary } from "./asset-renew.ts";
import {
  ASSET_CATEGORIES,
  CATEGORY_DEFAULTS,
  isAssetCategory,
  type AssetCategory,
  type WalrusAsset,
  type WalrusAssetView,
} from "./asset-types.ts";

const PORT = Number(process.env.PORT ?? 8788);
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const NETWORK = process.env.WALRUS_NETWORK?.trim() ?? "testnet";
const PUBLIC_AGGREGATOR_BASE = (
  process.env.PUBLIC_AGGREGATOR_BASE ??
  (NETWORK === "mainnet"
    ? "https://aggregator.walrus.space"
    : "https://aggregator.walrus-testnet.walrus.space")
).replace(/\/$/, "");
const RENEW_THRESHOLD_EPOCHS = Number(process.env.RENEW_THRESHOLD_EPOCHS ?? 5);
// Epoch duration (ms) — used to derive expiry dates. testnet ≈ 1 day, mainnet ≈ 14 days;
// override with WALRUS_EPOCH_MS.
const EPOCH_MS = Number(process.env.WALRUS_EPOCH_MS ?? (NETWORK === "mainnet" ? 14 : 1) * 86_400_000);

// Auto-renewal (docs/narrative/ASSET_MANAGEMENT.md §8): renew autoRenew assets within
// RENEW_THRESHOLD_EPOCHS of expiry, extending each by RENEW_EXTEND_EPOCHS. WALLET_MIN_*
// gate the sweep (0 = no floor; per-asset extend failures still surface in logs either way).
const RENEW_EXTEND_EPOCHS = Number(process.env.RENEW_EXTEND_EPOCHS ?? 30);
const WALLET_MIN_WAL = Number(process.env.WALLET_MIN_WAL ?? 0);
const WALLET_MIN_SUI = Number(process.env.WALLET_MIN_SUI ?? 0);
// In-process sweeper cadence (ms). 0 disables it — e.g. when an external cron / systemd
// timer hits POST /api/assets/renew-due instead. Default 6h.
const RENEW_SWEEP_INTERVAL_MS = Number(process.env.RENEW_SWEEP_INTERVAL_MS ?? 6 * 3_600_000);
const renewConfig: RenewConfig = {
  thresholdEpochs: RENEW_THRESHOLD_EPOCHS,
  extendEpochs: RENEW_EXTEND_EPOCHS,
  walletMinWal: WALLET_MIN_WAL,
  walletMinSui: WALLET_MIN_SUI,
};

const store = new AssetStore(join(DATA_DIR, "walrus-assets.json"));
const walrus = new AssetWalrus(DATA_DIR);

// One sweep at a time: the interval driver and the manual endpoint share this guard so a
// click can't race the timer into double-extending the same blob. null = already running.
let sweepInFlight = false;
async function runSweep(): Promise<RenewSummary | null> {
  if (sweepInFlight) return null;
  sweepInFlight = true;
  try {
    return await renewDue(store, walrus, renewConfig);
  } finally {
    sweepInFlight = false;
  }
}

function aggregatorUrl(blobId: string): string {
  return `${PUBLIC_AGGREGATOR_BASE}/v1/blobs/${blobId}`;
}

function toView(a: WalrusAsset, currentEpoch: number | null): WalrusAssetView {
  const epochsRemaining = currentEpoch == null ? null : a.endEpoch - currentEpoch;
  const expiresAt =
    epochsRemaining != null && EPOCH_MS > 0
      ? new Date(Date.now() + epochsRemaining * EPOCH_MS).toISOString()
      : null;
  const expiringSoon = epochsRemaining != null && epochsRemaining <= RENEW_THRESHOLD_EPOCHS;
  return { ...a, currentEpoch, epochsRemaining, expiresAt, expiringSoon };
}

function newId(category: AssetCategory): string {
  return `${category}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function boolParam(v: string | null, dflt: boolean): boolean {
  if (v == null || v === "") return dflt;
  return v === "1" || v === "true" || v === "yes";
}

// hero-clip asset → one demo-clips.json clip (scenes.ts loadDemoClipOverride normalizes it).
function toClip(a: WalrusAsset): Record<string, unknown> {
  const m = a.meta ?? {};
  return {
    id: a.id,
    sagaId: m.sagaId ?? "spring-snow",
    sceneId: m.sceneId,
    chapterId: m.chapterId,
    day: typeof m.day === "number" ? m.day : 1,
    title: a.label,
    caption: m.caption,
    videoUrl: aggregatorUrl(a.blobId),
    thumbnailUrl: typeof m.thumbnailBlobId === "string" ? aggregatorUrl(m.thumbnailBlobId) : m.thumbnailUrl,
    durationSeconds: typeof m.durationSeconds === "number" ? m.durationSeconds : 15,
    aspect: m.aspect ?? "16/9",
    createdAt: new Date(a.createdAt).toISOString(),
  };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/health") {
    return send(res, 200, {
      ok: true,
      walrus: walrus.local ? "dev-local" : "cli",
      assets: store.list().length,
      network: NETWORK,
    });
  }

  // public manifest for the homepage hero (frontend DEMO_CLIPS_URL hits this; no auth)
  if (method === "GET" && path === "/api/manifest/hero-clips") {
    const clips = store
      .list()
      .filter((a) => a.category === "hero-clip" && a.status === "live")
      .sort((x, y) => Number(y.meta.day ?? 0) - Number(x.meta.day ?? 0))
      .map(toClip);
    return send(res, 200, { clips });
  }

  // ── everything below requires auth ──
  if (!authed(req)) return send(res, 401, { error: "unauthorized" });

  if (method === "GET" && path === "/api/assets/wallet") {
    return send(res, 200, await walrus.wallet());
  }

  // Auto-renewal sweep — scan autoRenew assets near expiry and `walrus extend` them.
  // Exact-path, so it must sit before the `/api/assets/:id` parsing below.
  if (method === "POST" && path === "/api/assets/renew-due") {
    const r = await runSweep();
    if (!r) return send(res, 409, { error: "a renewal sweep is already running" });
    return send(res, 200, r);
  }

  if (path === "/api/assets" && method === "GET") {
    const cat = url.searchParams.get("category");
    const currentEpoch = await walrus.currentEpoch();
    const assets = store
      .list()
      .filter((a) => !cat || a.category === cat)
      .map((a) => toView(a, currentEpoch))
      .sort((x, y) => y.createdAt - x.createdAt);
    return send(res, 200, { assets, currentEpoch });
  }

  if (path === "/api/assets" && method === "POST") {
    const category = url.searchParams.get("category") ?? "";
    if (!isAssetCategory(category)) {
      return send(res, 400, { error: `category required (one of ${ASSET_CATEGORIES.join(", ")})` });
    }
    const label = (url.searchParams.get("label") ?? "").trim();
    if (!label) return send(res, 400, { error: "label required" });

    const defaults = CATEGORY_DEFAULTS[category];
    const epochs = Number(url.searchParams.get("epochs") ?? defaults.epochs);
    if (!Number.isFinite(epochs) || epochs <= 0) return send(res, 400, { error: "epochs must be a positive number" });
    const deletable = boolParam(url.searchParams.get("deletable"), defaults.deletable);

    let meta: Record<string, unknown> = {};
    const metaRaw = url.searchParams.get("meta");
    if (metaRaw) {
      try {
        meta = JSON.parse(metaRaw) as Record<string, unknown>;
      } catch {
        return send(res, 400, { error: "meta must be URL-encoded JSON" });
      }
    }

    const bytes = await readBytes(req);
    if (bytes.length === 0) return send(res, 400, { error: "empty body — send the file bytes as the request body" });

    const result = await walrus.store(new Uint8Array(bytes), epochs, deletable);
    const now = Date.now();
    const asset: WalrusAsset = {
      id: newId(category),
      category,
      label,
      blobId: result.blobId,
      suiObjectId: result.suiObjectId,
      contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
      sizeBytes: bytes.length,
      deletable,
      status: "live",
      autoRenew: defaults.autoRenew,
      endEpoch: result.endEpoch,
      meta,
      createdAt: now,
      updatedAt: now,
    };
    store.upsert(asset);
    store.flush();
    return send(res, 200, { asset, blobUrl: aggregatorUrl(asset.blobId) });
  }

  if (path.startsWith("/api/assets/")) {
    const rest = path.slice("/api/assets/".length);

    // POST /api/assets/:id/extend
    if (rest.endsWith("/extend") && method === "POST") {
      const id = decodeURIComponent(rest.slice(0, -"/extend".length));
      const asset = store.get(id);
      if (!asset) return send(res, 404, { error: "not found" });
      const b = await readJson<{ epochs?: number }>(req).catch(() => null);
      const epochs = Number(b?.epochs ?? 0);
      if (!Number.isFinite(epochs) || epochs <= 0) return send(res, 400, { error: "epochs (positive number) required" });
      const newEnd = await walrus.extend(asset.suiObjectId, epochs);
      const updated = store.patch(id, { endEpoch: newEnd > 0 ? newEnd : asset.endEpoch + epochs });
      store.flush();
      return send(res, 200, { asset: updated });
    }

    // PATCH / DELETE /api/assets/:id
    const id = decodeURIComponent(rest);
    const asset = store.get(id);
    if (!asset) return send(res, 404, { error: "not found" });

    if (method === "PATCH") {
      const b = await readJson<{ status?: unknown; autoRenew?: unknown; label?: unknown }>(req).catch(() => null);
      if (!b) return send(res, 400, { error: "json body required" });
      const partial: Partial<WalrusAsset> = {};
      if (b.status === "live" || b.status === "unpublished") partial.status = b.status;
      if (typeof b.autoRenew === "boolean") partial.autoRenew = b.autoRenew;
      if (typeof b.label === "string" && b.label.trim()) partial.label = b.label.trim();
      const updated = store.patch(id, partial);
      store.flush();
      return send(res, 200, { asset: updated });
    }

    if (method === "DELETE") {
      if (asset.deletable) {
        try {
          await walrus.delete(asset.blobId);
        } catch (err) {
          return send(res, 502, { error: `walrus delete failed: ${String(err)}` });
        }
      }
      store.remove(id);
      return send(res, 200, { deleted: true, blobReclaimed: asset.deletable });
    }
  }

  return send(res, 404, { error: "not found" });
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[asset] error:", err);
    if (!res.headersSent) send(res, 500, { error: String(err) });
  });
}).listen(PORT, () => {
  console.log(
    `[asset] listening on :${PORT}  walrus=${walrus.local ? "dev-local" : "cli"}  network=${NETWORK}  auth=${process.env.RELAYER_SECRET ? "on" : "off"}`,
  );
});

// Hybrid auto-renewal driver (docs/narrative/ASSET_MANAGEMENT.md §8). Opt out with
// RENEW_SWEEP_INTERVAL_MS=0 and drive POST /api/assets/renew-due from an external cron instead.
if (RENEW_SWEEP_INTERVAL_MS > 0) {
  const sweep = () => void runSweep().catch((err) => console.error("[asset-renew] sweep crashed:", err));
  setInterval(sweep, RENEW_SWEEP_INTERVAL_MS).unref();
  // First pass shortly after boot so a fresh deploy doesn't wait a whole interval.
  setTimeout(sweep, 15_000).unref();
  console.log(
    `[asset-renew] sweeper on — every ${Math.round(RENEW_SWEEP_INTERVAL_MS / 60_000)}min,` +
      ` threshold ${RENEW_THRESHOLD_EPOCHS} epochs, extend +${RENEW_EXTEND_EPOCHS}` +
      `${WALLET_MIN_WAL || WALLET_MIN_SUI ? `, floor WAL ${WALLET_MIN_WAL}/SUI ${WALLET_MIN_SUI}` : ""}`,
  );
} else {
  console.log("[asset-renew] in-process sweeper off (RENEW_SWEEP_INTERVAL_MS=0) — drive POST /api/assets/renew-due externally");
}
