// Walrus asset auto-renewal — the Hybrid renewal sweep (docs/narrative/ASSET_MANAGEMENT.md §8).
//
// Scans the registry for assets flagged `autoRenew` whose lease is within
// `thresholdEpochs` of expiry and extends each by `extendEpochs` via `walrus extend`.
// A wallet floor (`walletMinWal` / `walletMinSui`) gates the sweep so a near-empty
// publisher wallet fails loud (logged + reported) instead of silently letting blobs lapse.
//
// Pure-ish: no env reads, no I/O of its own — the caller injects store + walrus + config,
// so it is unit-testable with fakes and drives BOTH triggers: the HTTP endpoint
// (POST /api/assets/renew-due, for an external cron / systemd timer) and the optional
// in-process interval sweeper in assets-server.ts.
//
// Scope note: renewal keys off `autoRenew` alone, independent of `status`. `status`
// controls manifest visibility; `autoRenew` is the lifetime intent. An unpublished asset
// with autoRenew on is still kept alive (the operator hid it but chose to retain it).

import type { WalrusAsset } from "./asset-types.ts";

export interface RenewConfig {
  thresholdEpochs: number; // renew when (endEpoch − currentEpoch) ≤ this
  extendEpochs: number; // epochs added per renewal
  walletMinWal: number; // skip the whole sweep if WAL balance is below this (0 = no floor)
  walletMinSui: number; // skip the whole sweep if SUI balance is below this (0 = no floor)
}

// Minimal structural deps so the core is decoupled + testable. AssetStore / AssetWalrus
// satisfy these by shape; tests pass fakes.
export interface RenewStore {
  list(): WalrusAsset[];
  patch(id: string, partial: Partial<WalrusAsset>): WalrusAsset | undefined;
  flush(): void;
}

export interface RenewWalrus {
  currentEpoch(): Promise<number | null>;
  wallet(): Promise<{ sui: number | null; wal: number | null }>;
  extend(suiObjectId: string, epochs: number): Promise<number>;
}

export interface RenewSummary {
  ok: boolean;
  // Human-readable one-liner of what happened (also logged).
  note: string;
  currentEpoch: number | null;
  wallet: { sui: number | null; wal: number | null };
  thresholdEpochs: number;
  extendEpochs: number;
  walletBlocked: boolean;
  dueCount: number;
  renewed: Array<{ id: string; label: string; from: number; to: number }>;
  skipped: Array<{ id: string; label: string; reason: string }>;
  failed: Array<{ id: string; label: string; error: string }>;
}

const TAG = "[asset-renew]";

export async function renewDue(
  store: RenewStore,
  walrus: RenewWalrus,
  config: RenewConfig,
): Promise<RenewSummary> {
  const { thresholdEpochs, extendEpochs, walletMinWal, walletMinSui } = config;
  const renewed: RenewSummary["renewed"] = [];
  const skipped: RenewSummary["skipped"] = [];
  const failed: RenewSummary["failed"] = [];

  const currentEpoch = await walrus.currentEpoch();
  const wallet = await walrus.wallet();

  const summarize = (ok: boolean, note: string, walletBlocked = false, dueCount = 0): RenewSummary => ({
    ok,
    note,
    currentEpoch,
    wallet,
    thresholdEpochs,
    extendEpochs,
    walletBlocked,
    dueCount,
    renewed,
    skipped,
    failed,
  });

  // Without the current epoch we can't tell what's near expiry — bail rather than guess.
  if (currentEpoch == null) {
    const note = "currentEpoch unavailable (walrus info failed) — cannot compute expiry";
    console.warn(`${TAG} ${note}`);
    return summarize(false, note);
  }

  // Split autoRenew assets by lease state. Already-expired blobs (remaining ≤ 0) CANNOT be
  // extended — the Walrus contract aborts in assert_certified_not_expired (EResourceBounds) —
  // so never call extend on them (doing so was the failure spam): report + skip instead.
  const renewable: WalrusAsset[] = [];
  for (const a of store.list()) {
    if (!a.autoRenew) continue;
    const remaining = a.endEpoch - currentEpoch;
    if (remaining <= 0) {
      skipped.push({
        id: a.id,
        label: a.label,
        reason: `already expired (end ${a.endEpoch} ≤ epoch ${currentEpoch}) — cannot extend`,
      });
    } else if (remaining <= thresholdEpochs) {
      renewable.push(a);
    }
  }
  if (skipped.length > 0) {
    console.warn(`${TAG} ${skipped.length} already-expired asset(s) skipped — cannot be renewed`);
  }

  if (renewable.length === 0) {
    const note =
      skipped.length > 0
        ? `nothing renewable at epoch ${currentEpoch} (${skipped.length} already expired, skipped)`
        : `nothing due at epoch ${currentEpoch} (threshold ${thresholdEpochs})`;
    console.log(`${TAG} ${note}`);
    return summarize(true, note);
  }

  // Wallet floor: a near-empty publisher wallet should fail loud, not silently let blobs lapse.
  // A null balance = couldn't read it (transient RPC) → proceed rather than block, but flag it.
  const walBlocked = walletMinWal > 0 && wallet.wal != null && wallet.wal < walletMinWal;
  const suiBlocked = walletMinSui > 0 && wallet.sui != null && wallet.sui < walletMinSui;
  if (walBlocked || suiBlocked) {
    for (const a of renewable) skipped.push({ id: a.id, label: a.label, reason: "wallet below floor" });
    const note =
      `wallet below floor (WAL ${fmt(wallet.wal)}/min ${walletMinWal}, SUI ${fmt(wallet.sui)}/min ${walletMinSui})` +
      ` — ${renewable.length} due NOT renewed`;
    console.warn(`${TAG} ${note}`);
    return summarize(false, note, true, renewable.length);
  }

  if (wallet.wal == null || wallet.sui == null) {
    console.warn(`${TAG} wallet balance unreadable — proceeding without floor check`);
  }

  console.log(`${TAG} ${renewable.length} due at epoch ${currentEpoch} → extending +${extendEpochs} each`);
  let consecutiveFailures = 0;
  for (const a of renewable) {
    try {
      const newEnd = await walrus.extend(a.suiObjectId, extendEpochs);
      // extend returns 0 when its output isn't parseable (and in dev-local) → additive fallback,
      // which is exactly right for extend-by-N. Mirrors the manual /extend endpoint.
      const to = newEnd > 0 ? newEnd : a.endEpoch + extendEpochs;
      store.patch(a.id, { endEpoch: to });
      renewed.push({ id: a.id, label: a.label, from: a.endEpoch, to });
      consecutiveFailures = 0;
      console.log(`${TAG} renewed "${a.label}" (${a.id}) ${a.endEpoch} → ${to}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // A blob that lapsed since the epoch read aborts in assert_certified_not_expired
      // (EResourceBounds). It's dead, not a retryable failure → bucket as skipped so the
      // next sweep doesn't re-hammer it (that was the failure spam).
      if (/EResourceBounds|assert_certified_not_expired|expired/i.test(error)) {
        skipped.push({ id: a.id, label: a.label, reason: "expired mid-sweep — cannot extend" });
        console.warn(`${TAG} "${a.label}" (${a.id}) expired — skipping`);
        continue;
      }
      failed.push({ id: a.id, label: a.label, error });
      console.error(`${TAG} FAILED "${a.label}" (${a.id}): ${error}`);
      // Backstop: if extends keep failing for a non-expired reason (gas exhausted, node
      // down…), stop rather than churn the whole backlog.
      if ((consecutiveFailures += 1) >= 5) {
        console.error(`${TAG} aborting sweep after ${consecutiveFailures} consecutive failures`);
        break;
      }
    }
  }
  if (renewed.length > 0) store.flush();

  const parts = [`renewed ${renewed.length}/${renewable.length}`];
  if (skipped.length) parts.push(`skipped ${skipped.length} (expired)`);
  if (failed.length) parts.push(`failed ${failed.length}`);
  const note = `epoch ${currentEpoch}: ${parts.join(", ")}`;
  console.log(`${TAG} ${note}`);
  return summarize(failed.length === 0, note, false, renewable.length);
}

function fmt(v: number | null): string {
  return v == null ? "?" : String(v);
}
