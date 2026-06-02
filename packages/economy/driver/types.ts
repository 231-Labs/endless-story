// Driver-side types. The driver is the OFFLINE script that advances the economy: each day it
// runs between-day POLICY (subscriber dynamics, contested-slot assignment, births, patronage
// transfers), applies the pure settleDay transition, and records a trace. NONE of this is the
// pure core — settleDay stays untouched so its Move port stays the single source of truth.

import type { CharConfig, CharState, EconConfig, WorldEconState } from "../src/index.ts";

/** Between-day policy hooks. All deterministic (rng is a seeded LCG). */
export interface ScenarioPolicy {
  /** New subscriber_count for a character, given its state, the day, and a deterministic rng. */
  subscriberStep?: (c: CharState, day: bigint, rand: () => number) => bigint;
  /** Contested capacity-1 career slot: each day the single top-draw alive character holds it
   *  (drama resource), the rest don't. Newborns can contest it; death frees it (succession). */
  slotCapacity1?: boolean;
  /** Periodic newborns (world succession). */
  births?: { everyDays: bigint; max: bigint; make: (day: bigint, n: bigint) => CharConfig };
  /** Enable patronage: wealthy healthy characters top up failing allies to keep them solvent. */
  alliances?: boolean;
  /** Owner subsidy (挹注): external top-up the human owner injects into a character to keep a
   *  beloved, reader-less character alive. Returns the amount to inject this day (0 = none). */
  ownerSubsidy?: (c: CharState, cfg: EconConfig) => bigint;
}

export interface Scenario {
  id: string;
  description: string;
  /** fresh world each run (builders must not share mutable state). */
  makeWorld: () => WorldEconState;
  cfg: EconConfig;
  policy: ScenarioPolicy;
  horizon: number;
  /** newborn grant in base units (counted as external injection, preserves conservation). */
  seedFunds: bigint;
  /** rng seed (deterministic LCG). */
  seed: number;
}

export interface CharSnapshot {
  balance: bigint;
  vitality: bigint;
  memory: bigint;
  subscribers: bigint;
  heldSlot: boolean;
  salary: bigint;
  dailyCost: bigint;
  insolvent: boolean;
  dead: boolean;
  level: string;
  stage: string;
}

export interface DayRecord {
  day: bigint;
  aliveCount: number;
  births: number;
  deaths: number;
  rescues: number;
  /** owner subsidy (挹注) injected this day, base units. */
  subsidy: bigint;
  totalBalance: bigint;
  perChar: Record<string, CharSnapshot>;
}

export interface DeathLog {
  id: string;
  day: bigint;
  livedDays: bigint;
  cause: "economic" | "age" | "mixed";
}

export interface RunResult {
  scenario: Scenario;
  trace: DayRecord[];
  finalWorld: WorldEconState;
  deaths: DeathLog[];
  /** cumulative number of characters that ever existed (initial + births). */
  everSpawned: number;
  /** total rescues (patronage transfers) over the run. */
  totalRescues: number;
  /** total owner subsidy (挹注) injected over the run, base units. */
  ownerSubsidyTotal: bigint;
  /** conservation held on every single day. */
  conservedEveryDay: boolean;
}

export type { CharConfig, CharState, EconConfig, WorldEconState };
