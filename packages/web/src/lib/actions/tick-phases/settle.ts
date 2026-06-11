/* ── SETTLE phase (off-chain economy day-boundary) ─────────────────────
 * Advances the saga economy shadow to the current narrative day and applies this tick's
 * ACCEPTED gift transfers, so money actually moves (giver debited, recipient credited) and
 * persists. The day-settle (treasury-funded wages → daily cost → vitality → death) is
 * idempotent per day; transfers apply every tick. The shadow is process-local for now —
 * authoritative within the world-loop / web process; a relayer KV makes it cross-process.
 *
 * This is the rail the GIVE phase's `deferred` gifts were waiting for.
 * Plain module (not 'use server'). */
import type { Character } from '@endless-story/shared';
import { makeSuiClient, read } from '@endless-story/sdk';
import type { TransferRequest } from '@endless-story/economy';
import { resolveNetwork } from '@/lib/chain/network.js';
import { settleSagaCohort, toTransferAmount } from '@/lib/economy/saga-economy';
import type { TickGiveResult, TickSettleResult } from '../tick-loop-types';

const MEMOS = new Set(['gift', 'patronage', 'loan', 'repay', 'bribe', 'tribute']);

async function fetchTreasuryFunds(sagaId: string): Promise<number> {
    try {
        const client = makeSuiClient({ network: resolveNetwork() });
        const res = await read.saga.getSaga(client, sagaId);
        const t = (res.json as { treasury?: { value?: number | string } | number | string } | undefined)?.treasury;
        const raw = t == null ? 0 : typeof t === 'object' ? Number(t.value ?? 0) : Number(t);
        return Number.isFinite(raw) ? raw / 1_000_000 : 0; // ENDLESS decimals = 6
    } catch {
        return 0;
    }
}

export async function runSettlePhase(input: {
    sagaId: string;
    characters: Character[];
    gives: TickGiveResult[];
    today: number;
    dryRun: boolean;
}): Promise<TickSettleResult> {
    const base: TickSettleResult = {
        ok: true,
        day: input.today,
        treasuryFunds: 0,
        transfersApplied: 0,
        wagesPaid: 0,
        settledCount: 0,
        dead: [],
    };
    if (input.dryRun) return { ...base, skipped: 'dry-run（不動經濟影子）' };
    if (input.characters.length === 0) return { ...base, skipped: 'no-characters' };

    // accepted gifts → transfers (refused ones don't move money)
    const transfers: TransferRequest[] = [];
    for (const g of input.gives) {
        for (const gift of g.gifts ?? []) {
            if (gift.refused) continue;
            const memo = MEMOS.has(gift.memo) ? (gift.memo as TransferRequest['memo']) : 'gift';
            transfers.push({ fromId: g.characterId, toId: gift.recipientId, amount: toTransferAmount(gift.amount), memo });
        }
    }

    try {
        const treasuryFunds = await fetchTreasuryFunds(input.sagaId);
        const snaps = settleSagaCohort(input.sagaId, input.characters, treasuryFunds, input.today, transfers);
        const nameById = new Map(input.characters.map((c) => [c.id, c.name]));
        let wagesPaid = 0;
        const dead: { id: string; name: string }[] = [];
        for (const [id, s] of Object.entries(snaps)) {
            wagesPaid += s.salary;
            if (s.dead) dead.push({ id, name: nameById.get(id) ?? id });
        }
        return {
            ok: true,
            day: input.today,
            treasuryFunds: Math.round(treasuryFunds),
            transfersApplied: transfers.length,
            wagesPaid: Math.round(wagesPaid * 10) / 10,
            settledCount: Object.keys(snaps).length,
            dead,
        };
    } catch (err) {
        return { ...base, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
