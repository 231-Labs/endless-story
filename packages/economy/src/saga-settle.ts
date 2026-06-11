// saga-settle.ts — the COHORT (saga-wide) settle shadow (Part D D5).
//
// Where survival.ts/lazySettle models ONE character funded by its own subscription share, this
// settles the WHOLE saga one narrative day at a time against a shared PAYROLL POOL seeded by the
// on-chain saga treasury (which mint/recruit + dream fees fund — see saga::deposit_to_treasury).
// That is why salaries can be > 0 with zero subscribers: the role base-floor (保底) is paid out
// of the accumulated treasury until it runs dry, then prorates down → decline (the validated H2).
//
// Stateful: it persists per-character balance/vitality/streak + the shadow payroll pot across
// ticks (JSON-safe `SagaEconState`), and on each call tops the pot up by however much the
// on-chain treasury grew since last settle (new mint/dream fees), then drains it paying wages.
// GIVE-phase transfers decided this period are applied (alive↔alive, no overdraft) after settle.
//
// Pure: (priorState, liveInputs) → (nextState, per-character display snapshots). No I/O; the
// caller reads the chain + persists the state. Reuses settleDay / applyTransfers / derive — the
// settlement math is never reimplemented.

import { bmax } from "./fixed.ts";
import {
  dailyCost,
  lifeStage,
  runwayDays,
  survivalLevel,
  vitalityState,
  DEFAULT_ECON,
  ONSET_BASE_MY,
} from "./derive.ts";
import { settleDay } from "./settle.ts";
import { applyTransfers, type TransferRequest } from "./transfer.ts";
import { SEED_FUNDS_MICRO, type SurvivalSnapshot } from "./survival.ts";
import { MUNIT, VIT_FULL, VIT_PT, type CharState, type EconConfig, type WorldEconState } from "./types.ts";

const MAX_CATCHUP_DAYS = 3650;

/** Live per-character inputs the web reads from chain + the memory counter. */
export interface SagaCharInput {
  id: string;
  role: string;
  constitution: number;
  appearance: number;
  acuity: number;
  ageYearsStart: number;
  /** real memory total (relayer count / age proxy) — pinned each day; drives storage rent. */
  memoryCount: number;
  imageCount?: number;
  subscribers: number;
  heldSlot?: boolean;
  /** hidden mortality onset; runner-private, never on chain. Defaults to ONSET_BASE. */
  onsetMilliYears?: bigint;
}

export interface SagaSettleInput {
  /** current narrative day; settle catches every character up to here. */
  today: number;
  /** on-chain saga treasury balance (base units) — the mint/dream-fee payroll pot. */
  treasuryBalanceMicro: bigint;
  chars: SagaCharInput[];
  /** GIVE-phase transfers decided this period, applied after the catch-up. */
  transfers?: TransferRequest[];
}

/** JSON-safe persisted per-character economy state. */
export interface PersistedCharEcon {
  balanceMicro: string;
  vitalityMilli: string;
  insolventStreak: number;
  livedDays: number;
  dead: boolean;
}

/** JSON-safe persisted saga economy state. */
export interface SagaEconState {
  settledDay: number;
  /** shadow payroll pot (carried treasury), base units as decimal string. */
  treasuryMicro: string;
  /** last observed on-chain treasury, to detect new fee inflow next time. */
  lastOnchainTreasuryMicro: string;
  chars: Record<string, PersistedCharEcon>;
}

export interface SagaSettleResult {
  next: SagaEconState;
  snapshots: Record<string, SurvivalSnapshot>;
}

const toE = (micro: bigint): number => Number(micro) / Number(MUNIT);

function seedChar(input: SagaCharInput): CharState {
  return {
    cfg: {
      id: input.id,
      role: input.role,
      constitution: input.constitution,
      appearance: input.appearance,
      acuity: input.acuity,
      ageYearsStart: input.ageYearsStart,
      onsetMilliYears: input.onsetMilliYears ?? ONSET_BASE_MY,
    },
    balance: SEED_FUNDS_MICRO,
    vitality: VIT_FULL,
    memoryCount: BigInt(Math.max(0, Math.round(input.memoryCount))),
    imageCount: BigInt(Math.max(0, Math.round(input.imageCount ?? 0))),
    livedDays: 0n,
    subscribers: BigInt(Math.max(0, Math.round(input.subscribers))),
    heldSlot: !!input.heldSlot,
    insolventStreak: 0n,
    dead: false,
    diedOnDay: null,
  };
}

function restoreChar(input: SagaCharInput, p: PersistedCharEcon): CharState {
  const c = seedChar(input);
  c.balance = BigInt(p.balanceMicro);
  c.vitality = BigInt(p.vitalityMilli);
  c.insolventStreak = BigInt(p.insolventStreak);
  c.livedDays = BigInt(Math.max(0, p.livedDays));
  c.dead = p.dead;
  return c;
}

/**
 * Catch a saga's economy up to `today` against the treasury-funded payroll pool, apply this
 * period's GIVE transfers, and return display snapshots + the next persisted state. Pure.
 */
export function settleSagaTo(
  prior: SagaEconState | null,
  input: SagaSettleInput,
  cfg: EconConfig = DEFAULT_ECON,
): SagaSettleResult {
  const target = Math.max(0, Math.floor(input.today));
  const realCountById = new Map(input.chars.map((c) => [c.id, BigInt(Math.max(0, Math.round(c.memoryCount)))]));

  // ── payroll pot: seed from the full on-chain treasury on first settle; afterwards add only
  //    the growth since last time (new mint/dream fees), then let settleDay drain it. ──
  const onchainNow = input.treasuryBalanceMicro;
  let pot: bigint;
  if (prior) {
    const grew = bmax(0n, onchainNow - BigInt(prior.lastOnchainTreasuryMicro));
    pot = BigInt(prior.treasuryMicro) + grew;
  } else {
    pot = onchainNow; // the accumulated treasury IS the opening payroll pool
  }

  // ── build the world: restore known characters, seed newcomers ──
  const chars: CharState[] = input.chars.map((ci) => {
    const p = prior?.chars[ci.id];
    return p ? restoreChar(ci, p) : seedChar(ci);
  });
  let world: WorldEconState = {
    chars,
    accounts: { injected: 0n, ownerSink: 0n, storytellerSink: 0n, protocolSink: 0n, sagaTreasury: pot },
    day: BigInt(prior ? prior.settledDay : 0),
  };

  // ── catch up day by day; pin each character's memoryCount to its REAL current count so daily
  //    cost tracks reality (not settleDay's internal accrual). ──
  let day = prior ? prior.settledDay : 0;
  if (target - day > MAX_CATCHUP_DAYS) day = target - MAX_CATCHUP_DAYS;
  let lastSalary = new Map<string, bigint>();
  for (; day < target; day++) {
    for (const c of world.chars) c.memoryCount = realCountById.get(c.cfg.id) ?? c.memoryCount;
    const settled = settleDay(world, cfg);
    world = settled.next;
    lastSalary = new Map(Object.entries(settled.perChar).map(([id, l]) => [id, l.salary]));
  }
  // re-pin after the final accrual so the snapshot's dailyCost uses the real count
  for (const c of world.chars) c.memoryCount = realCountById.get(c.cfg.id) ?? c.memoryCount;

  // ── GIVE: apply this period's decided transfers (alive↔alive, clamped, no overdraft) ──
  if (input.transfers && input.transfers.length > 0) {
    world = applyTransfers(world, input.transfers).next;
  }

  // ── snapshots + next persisted state ──
  const snapshots: Record<string, SurvivalSnapshot> = {};
  const nextChars: Record<string, PersistedCharEcon> = {};
  for (const c of world.chars) {
    const salary = lastSalary.get(c.cfg.id) ?? 0n;
    const dc = dailyCost(c, cfg);
    const runway = runwayDays(salary, c, cfg);
    snapshots[c.cfg.id] = {
      funds: toE(c.balance),
      dailyCost: toE(dc),
      salary: toE(salary),
      netFlow: toE(salary - dc),
      daysLeft: runway === null ? 999 : Number(runway < 999n ? runway : 999n),
      level: c.dead ? "critical" : survivalLevel(salary, c, cfg),
      memoryCount: Number(c.memoryCount),
      memoryRent: toE(cfg.cMem * c.memoryCount),
      imageCount: Number(c.imageCount),
      imageRent: toE(cfg.cImg * c.imageCount),
      vitality: Number(c.vitality) / Number(VIT_PT),
      vitalityState: vitalityState(c),
      lifeStage: lifeStage(salary, c, cfg),
      dead: c.dead,
    };
    nextChars[c.cfg.id] = {
      balanceMicro: c.balance.toString(),
      vitalityMilli: c.vitality.toString(),
      insolventStreak: Number(c.insolventStreak),
      livedDays: Number(c.livedDays),
      dead: c.dead,
    };
  }

  return {
    next: {
      settledDay: target,
      treasuryMicro: world.accounts.sagaTreasury.toString(),
      lastOnchainTreasuryMicro: onchainNow.toString(),
      chars: nextChars,
    },
    snapshots,
  };
}
