// Economy domain types + unit conventions. Pure data; no I/O, no chain, no LLM.
// The SAME module is imported by the simulator (driver/) and (later) ported into
// `contracts/.../economy.move` + the web adapter — the settleDay transition is never
// reimplemented (mirrors the @endless-story/drama "one transition" rule).
//
// UNITS (all bigint, Move-mappable):
//   money    — ENDLESS base units. 1 ENDLESS = MUNIT (6 decimals, matches currency.move).
//   vitality — milli-points in [0, VIT_FULL]. 100.000 vitality = VIT_FULL.
//   age      — milli-years (×1000) so sub-year fractions stay exact integers.

/** 1 ENDLESS in base units (currency.move uses 6 decimals). */
export const MUNIT = 1_000_000n;
/** Vitality full bar = 100.000 points, stored as milli-points. */
export const VIT_FULL = 100_000n;
/** 1 vitality point in milli-points. */
export const VIT_PT = 1_000n;
/** milli-year scale (1 year = 1000 milli-years). */
export const MILLI_YEAR = 1_000n;
/** narrative days per in-fiction year (matches world-time conventions). */
export const DAYS_PER_YEAR = 360n;
/** basis-points denominator. */
export const BPS = 10_000n;

export type SurvivalLevel = "critical" | "low" | "stable" | "healthy";
export type LifeStage = "birth" | "growth" | "golden" | "aging" | "decline";
export type VitalityState = "healthy" | "strained" | "failing" | "dead";

/**
 * Static per-character descriptors fixed at mint. Never mutated by settleDay.
 * `onsetMilliYears` is the HIDDEN age-hazard onset (ONSET_BASE ± individual variance):
 * never put on chain — death timing must emerge, not be public (owner decision ⑤).
 */
export interface CharConfig {
  id: string;
  /** role-name key, substring-matched against the ROLE_BASE_FLOOR keyword table. */
  role: string;
  /** attribute snapshot 0..100. disposition is intentionally excluded from salary. */
  constitution: number;
  appearance: number;
  acuity: number;
  /** starting age at mint, whole years. */
  ageYearsStart: number;
  /** hidden mortality onset, milli-years. Runner-private; never serialized on chain. */
  onsetMilliYears: bigint;
}

/** Mutable per-character economic state, evolved one narrative day per settle. */
export interface CharState {
  cfg: CharConfig;
  /** real ENDLESS base units held by the character NFT (Balance<CURRENCY>); ≥ 0. */
  balance: bigint;
  /** vitality, milli-points, [0, VIT_FULL]. */
  vitality: bigint;
  /** append-only memory total (MemWal never deletes) — drives storage rent. */
  memoryCount: bigint;
  /** gallery image count (portrait + costume/makeup/event-moment/variants) — grows over time
   *  (events add moments, evolve-portrait adds variants); drives image storage rent. */
  imageCount: bigint;
  /** narrative days lived since birth. */
  livedDays: bigint;
  /** current subscriber_count (set by driver subscriber dynamics). */
  subscribers: bigint;
  /** holds a contested capacity-1 career slot (drama resource) → salary/draw bonus. */
  heldSlot: boolean;
  /** consecutive insolvent settlements (economic-death accelerant). */
  insolventStreak: bigint;
  dead: boolean;
  /** day index of death, or null while alive. */
  diedOnDay: bigint | null;
}

/**
 * Protocol-/saga-level accounts. Tracked so the conservation invariant is checkable:
 *   injected === ownerSink + storytellerSink + protocolSink + sagaTreasury + Σ balance
 */
export interface Accounts {
  /** cumulative external money in (subscriptions + mint seed grants). */
  injected: bigint;
  /** owner revenue (owner_bps share) + estates of the dead. */
  ownerSink: bigint;
  /** storyteller cut. */
  storytellerSink: bigint;
  /** dailyCost collected from characters — funds real infra (AI/MemWal/Seal). */
  protocolSink: bigint;
  /** payroll carryover (rounding remainder + undistributed budget). */
  sagaTreasury: bigint;
}

export interface WorldEconState {
  chars: CharState[];
  accounts: Accounts;
  day: bigint;
}

/**
 * Calibration knobs. Part of the committed transition (alongside settleDay) so the
 * simulator can sweep without forking the math. All money fields are base units.
 */
export interface EconConfig {
  // ── dailyCost (A2) ──
  cRun: bigint;            // money/day at activeFactor = 1.0 (AI inference floor)
  cMem: bigint;            // money per stored memory per day (MemWal storage rent)
  cImg: bigint;            // money per gallery image per day (Walrus image storage rent)
  cSeal: bigint;           // money per recall (Seal decrypt + vector query)
  activeLiveMilli: bigint; // activeFactor when subscriber_count ≥ 1 (×1000)
  activeDormantMilli: bigint; // activeFactor when subscriber_count == 0 (×1000)
  recallActive: bigint;    // recalls/day when active
  recallDormant: bigint;   // recalls/day when dormant
  memPerDayActive: bigint; // memories appended per active day
  memPerDayDormant: bigint; // memories appended per dormant day

  // ── income (A3) ──
  subPriceMoney: bigint;   // ENDLESS per subscriber per day (gross)
  ownerBps: bigint;
  storytellerBps: bigint;
  treasuryBps: bigint;     // share that becomes the saga payroll pool
  slotBonusMilli: bigint;  // baseFloor multiplier when holding a contested slot (×1000)

  // ── vitality / death (A7) ──
  vitRecovery: bigint;     // milli-points regained per solvent day
  econBase: bigint;        // milli-points lost = econBase × insolventStreak
  ageK: bigint;            // age hazard: milli-points/day = ageK × overAgeMilliYears

  // ── survival level (A4) ──
  healthyBalance: bigint;  // balance floor for "healthy"
}
