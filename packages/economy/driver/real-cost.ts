// Real-cost baseline (2026-06-02). Grounds the harness in actual bills + peg 1 ENDLESS = 1 USD.
// Run: node packages/economy/driver/real-cost.ts
//
// Measured:
//   - GLM-4.6 cheap call (PLAN/MOVE/ACT/SLEEP): ~58 pts (Poe; 1M pts = $30)  → $0.00174
//   - GLM-5.1 FW POV chapter:                   ~200 pts (Poe)               → $0.00600
//   - gpt-image-2 image: 20 requests = $0.93                                 → $0.0465 / image
// Scope: per-character daily run cost (no-sub vs active) + mint cost + break-even. Production
// method/frequency WILL change → re-evaluate; this is the floor.

// ── prices ──
const POE_USD_PER_POINT = 30 / 1_000_000;
const ENDLESS_USD = 1; // peg
const CHEAP_PTS = 58; // GLM-4.6 decide/plan/move/sleep
const POV_PTS = 200; // GLM-5.1 FW chapter
const IMAGE_USD = 0.93 / 20; // gpt-image-2 per image (June bill)

const cheapUsd = CHEAP_PTS * POE_USD_PER_POINT;
const povUsd = POV_PTS * POE_USD_PER_POINT;

// ── loop structure (tick-loop.ts; 1 narrative day = 6 ticks) ──
const TICKS_PER_DAY = 6;
const PLAN_PER_TICK = 1; // GLM-4.6
const MOVE_PER_TICK = 1; // GLM-4.6 (if placed in a scene)
const POV_PER_TICK = 1; // GLM-5.1 (subscriber-gated: 0 when no readers)
const SLEEP_PER_DAY = 1; // GLM-4.6

const usd = (n: number) => `$${n.toFixed(4)}`;
const lines: string[] = [];
lines.push("# Real-cost baseline (1 ENDLESS = $1)\n");
lines.push(`cheap call (GLM-4.6)  ${CHEAP_PTS} pts = ${usd(cheapUsd)}`);
lines.push(`POV chapter (GLM-5.1) ${POV_PTS} pts = ${usd(povUsd)}`);
lines.push(`image (gpt-image-2)   ${usd(IMAGE_USD)} / image (20 req = $0.93)\n`);

// ── daily run cost per character ──
function day(label: string, move: number, povPerTick: number) {
  const cheap = (PLAN_PER_TICK + move) * TICKS_PER_DAY + SLEEP_PER_DAY;
  const pov = povPerTick * TICKS_PER_DAY;
  const d = cheap * cheapUsd + pov * povUsd;
  return { label, cheap, pov, perDay: d, perMonth: d * 30 };
}
const dormant = day("no subscribers (dormant)", MOVE_PER_TICK, 0);
const active = day("active (writes POV)", MOVE_PER_TICK, POV_PER_TICK);

lines.push("per-character daily run cost            cheap/d  POV/d   $/day     $/month   ENDLESS/month");
for (const r of [dormant, active]) {
  lines.push(
    `${r.label.padEnd(38)} ${String(r.cheap).padStart(6)}  ${String(r.pov).padStart(5)}   ` +
      `${usd(r.perDay)}   ${usd(r.perMonth)}   ${r.perMonth.toFixed(3)}`,
  );
}
lines.push(`\nPOV is your biggest cost LEVER: ${usd(povUsd)}/chapter × ${TICKS_PER_DAY}/day = ${usd(active.pov * povUsd)}/day.`);
lines.push(`  at 1 chapter/day instead of ${TICKS_PER_DAY}: POV = ${usd(povUsd)}/day → active ≈ ${usd(dormant.perDay + povUsd)}/day.`);

// ── Walrus storage (the only cost that GROWS with append-only memory) ──
// Walrus prices per encoded unit per epoch; for our tiny memory blobs a fixed per-blob floor
// (metadata ~6,200 FROST/epoch + ~2,000 FROST one-time write) dominates. 1 WAL = 1e9 FROST,
// epoch ~= 14 days. (docs.wal.app/docs/system-overview/storage-costs)
const WAL_USD = 0.06; // CoinMarketCap/CoinGecko/Coinbase June 2026 ($0.054-0.060)
const FROST_PER_WAL = 1_000_000_000;
const BLOB_FLOOR_FROST_EPOCH = 6_200; // metadata floor for a small blob, per epoch
const WRITE_FROST = 2_000; // one-time per write
const EPOCH_DAYS = 14;
const memStorageUsdPerDay = (BLOB_FLOOR_FROST_EPOCH / EPOCH_DAYS / FROST_PER_WAL) * WAL_USD;
const writeUsd = (WRITE_FROST / FROST_PER_WAL) * WAL_USD;
lines.push("\n# Walrus storage - real pass-through cost of append-only memory (WAL = $0.06)");
lines.push(`per memory blob: storage ${usd(memStorageUsdPerDay)}/day (floor) + write ${usd(writeUsd)} once`);
lines.push("memories held    storage $/day      storage $/month");
for (const m of [600, 2_000, 10_000]) {
  const dd = m * memStorageUsdPerDay;
  lines.push(`${String(m).padStart(8)}     ${usd(dd)}        ${usd(dd * 30)}`);
}
lines.push(`\n  => even hoarding 10,000 memories ~= ${usd(10_000 * memStorageUsdPerDay * 30)}/month - NEGLIGIBLE vs AI.`);
lines.push(`  => real C_mem ~= ${memStorageUsdPerDay.toExponential(2)} ENDLESS/memory/day vs my design placeholder 0.02`);
lines.push(`     (~${(0.02 / memStorageUsdPerDay).toExponential(1)}x bigger). So 'memory rent -> 老死' is a DESIGN lever`);
lines.push("     you SET for narrative tension, NOT a pass-through of Walrus cost (which is ~0).");
lines.push("  => small-blob floor: batching memories into periodic checkpoint blobs collapses it further.");
lines.push("  => (separate, unpriced: the MemWal vector-index / relay SERVER is a flat protocol infra cost.)");

// ── mint cost (saga bears it; mint fee = saga revenue) ──
lines.push("\n# Mint cost (image generation) — saga's COGS, recovered by the mint fee");
lines.push("images/mint   image cost   suggested mint fee ($5–15)   saga gross margin");
for (const n of [1, 4, 6]) {
  const c = n * IMAGE_USD;
  lines.push(`${String(n).padStart(6)}        ${usd(c)}        $8 (example)                ${(((8 - c) / 8) * 100).toFixed(1)}%`);
}

// ── break-even: saga bears active run cost, recovers from its subscription share ──
lines.push("\n# Break-even subscribers per ACTIVE character (saga's view)");
lines.push(`  monthly run cost = ${usd(active.perMonth)}.  break-even subs = runCost / (subPrice × sagaShare)`);
lines.push("  subPrice/mo  sagaShare   break-even subscribers");
for (const S of [3, 5, 8]) {
  for (const f of [0.4, 0.6]) {
    const be = active.perMonth / (S * f);
    lines.push(`     $${S}         ${(f * 100).toFixed(0)}%         ${be.toFixed(2)}  subscribers`);
  }
}
lines.push("\n  ⇒ ANY character with ≳1 paying subscriber is profitable for the saga. Cost is a");
lines.push("    rounding error vs. price — pricing is value-/willingness-to-pay-driven, not cost-plus.");
lines.push("    (C_mem storage ≈ 0 today; grows only after self-hosting Walrus — re-evaluate then.)");

process.stdout.write(lines.join("\n") + "\n");
