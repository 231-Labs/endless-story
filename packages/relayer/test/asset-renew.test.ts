// Unit tests for the auto-renewal sweep (src/asset-renew.ts). Run: `pnpm --filter
// @endless-story/relayer test` (node --test, native TS type-stripping, Node ≥ 23.6).
// The core takes injected store + walrus, so these use in-memory fakes — no walrus CLI,
// no filesystem.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renewDue, type RenewConfig, type RenewStore, type RenewWalrus } from "../src/asset-renew.ts";
import type { WalrusAsset } from "../src/asset-types.ts";

const CONFIG: RenewConfig = { thresholdEpochs: 5, extendEpochs: 30, walletMinWal: 0, walletMinSui: 0 };

function asset(over: Partial<WalrusAsset>): WalrusAsset {
  return {
    id: "a",
    category: "character-image",
    label: "L",
    blobId: "b",
    suiObjectId: "0x1",
    contentType: "image/png",
    sizeBytes: 1,
    deletable: false,
    status: "live",
    autoRenew: true,
    endEpoch: 10,
    meta: {},
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function fakeStore(rows: WalrusAsset[]) {
  const map = new Map(rows.map((r) => [r.id, r]));
  const state = { flushCount: 0 };
  const store: RenewStore = {
    list: () => [...map.values()],
    patch: (id, partial) => {
      const cur = map.get(id);
      if (!cur) return undefined;
      const next: WalrusAsset = { ...cur, ...partial, id: cur.id, updatedAt: 1 };
      map.set(id, next);
      return next;
    },
    flush: () => {
      state.flushCount++;
    },
  };
  return { store, map, state };
}

interface WalrusOpts {
  epoch?: number | null;
  sui?: number | null;
  wal?: number | null;
  extend?: (suiObjectId: string, epochs: number) => Promise<number>;
}

function fakeWalrus(opts: WalrusOpts = {}) {
  const extendCalls: Array<{ id: string; epochs: number }> = [];
  const walrus: RenewWalrus = {
    currentEpoch: async () => (opts.epoch === undefined ? 10 : opts.epoch),
    wallet: async () => ({ sui: opts.sui ?? 10, wal: opts.wal ?? 10 }),
    extend: async (suiObjectId, epochs) => {
      extendCalls.push({ id: suiObjectId, epochs });
      return opts.extend ? opts.extend(suiObjectId, epochs) : 0;
    },
  };
  return { walrus, extendCalls };
}

test("renews autoRenew assets within threshold, leaves the rest alone", async () => {
  // epoch 10, threshold 5 → due when endEpoch ≤ 15.
  const due = asset({ id: "due", suiObjectId: "0xdue", endEpoch: 12 }); // remaining 2 → due
  const far = asset({ id: "far", suiObjectId: "0xfar", endEpoch: 30 }); // remaining 20 → not due
  const off = asset({ id: "off", suiObjectId: "0xoff", endEpoch: 11, autoRenew: false }); // due-by-epoch but flag off
  const { store, map, state } = fakeStore([due, far, off]);
  const { walrus, extendCalls } = fakeWalrus({ epoch: 10 });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, true);
  assert.equal(r.dueCount, 1);
  assert.deepEqual(
    r.renewed.map((x) => x.id),
    ["due"],
  );
  assert.equal(map.get("due")!.endEpoch, 42, "additive fallback 12 + 30");
  assert.equal(map.get("far")!.endEpoch, 30, "untouched");
  assert.equal(map.get("off")!.endEpoch, 11, "untouched");
  assert.deepEqual(extendCalls, [{ id: "0xdue", epochs: 30 }]);
  assert.equal(state.flushCount, 1, "flushed once after renewals");
});

test("uses the endEpoch returned by extend when it is parseable (> 0)", async () => {
  const { store, map } = fakeStore([asset({ id: "due", endEpoch: 12 })]);
  const { walrus } = fakeWalrus({ epoch: 10, extend: async () => 99 });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.renewed[0]!.to, 99);
  assert.equal(map.get("due")!.endEpoch, 99, "uses chain-reported endEpoch, not additive");
});

test("boundary: remaining == threshold is due (≤, matches the UI expiringSoon flag)", async () => {
  const { store } = fakeStore([asset({ id: "edge", endEpoch: 15 })]); // remaining exactly 5
  const { walrus } = fakeWalrus({ epoch: 10 });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.dueCount, 1);
  assert.equal(r.renewed.length, 1);
});

test("wallet below floor blocks the whole sweep, nothing extended", async () => {
  const { store, map, state } = fakeStore([asset({ id: "due", endEpoch: 12 })]);
  const { walrus, extendCalls } = fakeWalrus({ epoch: 10, wal: 0.2 });

  const r = await renewDue(store, walrus, { ...CONFIG, walletMinWal: 1 });

  assert.equal(r.ok, false);
  assert.equal(r.walletBlocked, true);
  assert.equal(r.renewed.length, 0);
  assert.deepEqual(
    r.skipped.map((x) => x.id),
    ["due"],
  );
  assert.equal(extendCalls.length, 0, "no extend attempted");
  assert.equal(map.get("due")!.endEpoch, 12, "untouched");
  assert.equal(state.flushCount, 0);
});

test("null wallet balance does NOT block (unknown ≠ insufficient)", async () => {
  const { store } = fakeStore([asset({ id: "due", endEpoch: 12 })]);
  const { walrus, extendCalls } = fakeWalrus({ epoch: 10, wal: null, sui: null });

  const r = await renewDue(store, walrus, { ...CONFIG, walletMinWal: 1, walletMinSui: 1 });

  assert.equal(r.walletBlocked, false);
  assert.equal(r.renewed.length, 1, "proceeds despite unreadable balance");
  assert.equal(extendCalls.length, 1);
});

test("currentEpoch unavailable → bail, renew nothing", async () => {
  const { store, map } = fakeStore([asset({ id: "due", endEpoch: 12 })]);
  const { walrus, extendCalls } = fakeWalrus({ epoch: null });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, false);
  assert.equal(r.currentEpoch, null);
  assert.equal(r.renewed.length, 0);
  assert.equal(extendCalls.length, 0);
  assert.equal(map.get("due")!.endEpoch, 12);
  assert.match(r.note, /currentEpoch/);
});

test("a per-asset extend failure is isolated; the rest still renew", async () => {
  const a = asset({ id: "a", suiObjectId: "0xa", endEpoch: 12 });
  const b = asset({ id: "b", suiObjectId: "0xb", endEpoch: 13 });
  const { store, map } = fakeStore([a, b]);
  const { walrus } = fakeWalrus({
    epoch: 10,
    extend: async (id) => {
      if (id === "0xa") throw new Error("walrus extend exited 1");
      return 0;
    },
  });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, false, "failures flip ok to false");
  assert.equal(r.dueCount, 2);
  assert.deepEqual(
    r.failed.map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(
    r.renewed.map((x) => x.id),
    ["b"],
  );
  assert.equal(map.get("a")!.endEpoch, 12, "failed one untouched");
  assert.equal(map.get("b")!.endEpoch, 43, "13 + 30");
});

test("no due assets → ok, no flush, empty result", async () => {
  const { store, state } = fakeStore([asset({ id: "far", endEpoch: 100 })]);
  const { walrus, extendCalls } = fakeWalrus({ epoch: 10 });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, true);
  assert.equal(r.dueCount, 0);
  assert.equal(r.renewed.length, 0);
  assert.equal(extendCalls.length, 0);
  assert.equal(state.flushCount, 0);
  assert.match(r.note, /nothing due/);
});

test("already-expired assets (remaining ≤ 0) are skipped, never extended", async () => {
  const expired = asset({ id: "exp", suiObjectId: "0xexp", endEpoch: 8 }); // epoch 10 → remaining -2
  const live = asset({ id: "live", suiObjectId: "0xlive", endEpoch: 12 }); // remaining 2 → due
  const { store, map } = fakeStore([expired, live]);
  const { walrus, extendCalls } = fakeWalrus({ epoch: 10 });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, true, "expired is not a failure");
  assert.equal(r.dueCount, 1, "only the live one is attempted");
  assert.deepEqual(
    r.renewed.map((x) => x.id),
    ["live"],
  );
  assert.deepEqual(
    r.skipped.map((x) => x.id),
    ["exp"],
  );
  assert.match(r.skipped[0]!.reason, /expired/i);
  assert.deepEqual(
    extendCalls.map((c) => c.id),
    ["0xlive"],
    "extend is never called on the expired blob",
  );
  assert.equal(map.get("exp")!.endEpoch, 8, "expired one untouched");
});

test("an extend that aborts with EResourceBounds is treated as expired (skipped, not failed)", async () => {
  const { store } = fakeStore([asset({ id: "a", suiObjectId: "0xa", endEpoch: 12 })]); // due, but lapses mid-sweep
  const { walrus } = fakeWalrus({
    epoch: 10,
    extend: async () => {
      throw new Error("walrus extend exited 1: assert_certified_not_expired ... EResourceBounds");
    },
  });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, true, "expired-mid-sweep is not a hard failure");
  assert.equal(r.failed.length, 0);
  assert.deepEqual(
    r.skipped.map((x) => x.id),
    ["a"],
  );
  assert.match(r.skipped[0]!.reason, /expired/i);
});

test("aborts the sweep after 5 consecutive non-expired failures", async () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    asset({ id: `a${i}`, suiObjectId: `0x${i}`, endEpoch: 12 }),
  );
  const { store } = fakeStore(rows);
  const { walrus, extendCalls } = fakeWalrus({
    epoch: 10,
    extend: async () => {
      throw new Error("walrus extend exited 1: node unreachable");
    },
  });

  const r = await renewDue(store, walrus, CONFIG);

  assert.equal(r.ok, false);
  assert.equal(r.failed.length, 5, "stops after 5 consecutive failures");
  assert.equal(extendCalls.length, 5, "no further extend attempts once the backstop trips");
});
