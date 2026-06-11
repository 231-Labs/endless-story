/**
 * Saga economy adapter (Part D D5 wiring) — bridges chain reads to the validated cohort settle
 * shadow (`@endless-story/economy` `settleSagaTo`).
 *
 * WHY this exists: the per-character `lazySettle` can only model "funded by your own readers",
 * so a reader-less character shows 班中俸 = 0. But the saga treasury is NOT empty — mint/recruit
 * voucher fees (and dream fees) accumulate there. This adapter settles the WHOLE saga against
 * that treasury, so every character draws a role base-floor wage out of the shared pool until it
 * runs dry. Salary becomes real.
 *
 * Persistence: `settleSagaTo` is stateful (it carries balances + the draining payroll pot across
 * days). For now the state lives in a PROCESS-LOCAL store — fine for the long-running world-loop
 * process and good enough to show real numbers, but it does NOT survive a restart or share across
 * processes. TODO: back it with the self-hosted relayer (a KV endpoint, like the memory counter)
 * so the page and the loop see one authoritative shadow.
 *
 * Pure of chain/web deps (only `@endless-story/economy` + shared types) → no import cycle with
 * character-read; the caller passes the already-built cohort + treasury.
 */

import type { Character, SurvivalStatus } from '@endless-story/shared';
import {
    settleSagaTo,
    type SagaCharInput,
    type SagaEconState,
    type SurvivalSnapshot,
    type TransferRequest,
} from '@endless-story/economy';

/** Process-local shadow store: sagaId → last settled state + the day it covers + its snapshots. */
const STORE = new Map<string, { today: number; state: SagaEconState; snaps: Record<string, SurvivalSnapshot> }>();

function econInput(c: Character): SagaCharInput {
    return {
        id: c.id,
        role: (c.role as string) || '—',
        constitution: c.attributes?.constitution ?? 50,
        appearance: c.attributes?.appearance ?? 50,
        acuity: c.attributes?.acuity ?? 50,
        ageYearsStart: c.age ?? 0,
        memoryCount: c.survival?.memoryCount ?? 5,
        imageCount: c.survival?.imageCount ?? 0,
        subscribers: c.subscriberCount ?? 0,
    };
}

/**
 * Settle the whole saga to `today` against the treasury-funded payroll pool and return each
 * character's snapshot. `treasuryFundsEndless` is the on-chain `Saga.treasury` in display ENDLESS.
 *
 * Two callers:
 *  - PAGE reads pass no `transfers` → idempotent per (sagaId, today): the day is advanced once,
 *    repeat reads within a tick reuse the cached result (and never double-pay).
 *  - The tick SETTLE phase passes this tick's accepted gifts as `transfers` → it always re-settles
 *    so the money actually moves; balances carry forward, salary is carried so a transfer-only
 *    call (0 days elapsed) still shows a real wage.
 */
export function settleSagaCohort(
    sagaId: string,
    characters: Character[],
    treasuryFundsEndless: number,
    today: number,
    transfers?: TransferRequest[],
): Record<string, SurvivalSnapshot> {
    const cached = STORE.get(sagaId);
    const hasTransfers = !!transfers && transfers.length > 0;
    if (!hasTransfers && cached && cached.today === today) return cached.snaps;

    const treasuryBalanceMicro = BigInt(Math.max(0, Math.round((treasuryFundsEndless || 0) * 1_000_000)));
    const { next, snapshots } = settleSagaTo(cached?.state ?? null, {
        today,
        treasuryBalanceMicro,
        chars: characters.map(econInput),
        transfers: hasTransfers ? transfers : undefined,
    });
    STORE.set(sagaId, { today, state: next, snaps: snapshots });
    return snapshots;
}

/** Convert ENDLESS (whole units) to base-unit bigint for a transfer amount. */
export function toTransferAmount(endless: number): bigint {
    return BigInt(Math.max(0, Math.round(endless * 1_000_000)));
}

const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Map the economy snapshot onto the UI's SurvivalStatus (same rounding as computeSurvival). */
export function snapshotToSurvival(snap: SurvivalSnapshot): SurvivalStatus {
    return {
        funds: Math.round(snap.funds),
        dailyCost: r1(snap.dailyCost),
        salary: r1(snap.salary),
        daysLeft: snap.daysLeft,
        level: snap.level,
        memoryCount: snap.memoryCount,
        memoryRent: r1(snap.memoryRent),
        imageCount: snap.imageCount,
        imageRent: r1(snap.imageRent),
        vitality: Math.round(snap.vitality),
        vitalityState: snap.vitalityState,
        lifeStage: snap.lifeStage,
    };
}
