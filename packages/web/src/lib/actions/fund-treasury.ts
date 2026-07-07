'use server';

/**
 * Admin tool — top up a saga's on-chain treasury (the payroll pool).
 *
 * WHY: 班中俸（salary）is paid from the saga treasury. With an empty treasury
 * and zero subscribers the cohort settle has nothing to pay, so salary prorates
 * to 0 (the "frozen economy" symptom). This action mints fresh ENDLESS straight
 * into `Saga.treasury` via `faucet::admin_fund_saga_treasury`, so the next read
 * (after a world tick advances the narrative day) shows real wages.
 *
 * The admin keypair holds the FaucetAdminCap, so this works regardless of which
 * wallet the operator has connected in the browser.
 *
 * NOTE: the displayed 班中俸 is recomputed lazily by the off-chain settle, which
 * only pays new wages when the narrative day advances. After funding, run a
 * 活世界 tick (戲台 → 手動推進) to see salary appear. The on-chain treasury
 * balance returned here reflects the deposit immediately.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, read, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

/** ENDLESS has 6 decimals (1 ENDLESS = 1_000_000 base units). */
const ENDLESS_DECIMALS = 1_000_000;

export interface FundTreasuryResult {
    ok: boolean;
    digest?: string;
    error?: string;
    /** treasury balance in display ENDLESS, after the deposit. */
    treasuryEndless?: number;
    /** the amount just deposited, in display ENDLESS. */
    addedEndless?: number;
}

/** Read the saga treasury (display ENDLESS), or null on failure. */
export async function getSagaTreasuryEndless(): Promise<number | null> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) return null;
    try {
        const admin = getAdminContext();
        const res = await read.saga.getSaga(admin.client, d.sagaId);
        return parseTreasuryEndless(res.json);
    } catch (err) {
        console.warn('[fund-treasury] getSagaTreasuryEndless failed:', err);
        return null;
    }
}

/**
 * Mint `amountEndless` (display ENDLESS) of fresh currency into the saga
 * treasury. Whole or fractional ENDLESS; converted to base units internally.
 */
export async function fundSagaTreasuryAction(amountEndless: number): Promise<FundTreasuryResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.faucetId || !d.faucetAdminCapId) return { ok: false, error: 'faucet 尚未種子化' };
    if (!d.sagaId) return { ok: false, error: 'saga 尚未種子化' };

    const amount = Number(amountEndless);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: '請輸入大於 0 的金額' };
    const amountMicro = BigInt(Math.round(amount * ENDLESS_DECIMALS));
    if (amountMicro <= 0n) return { ok: false, error: '金額太小（須 ≥ 0.000001 ENDLESS）' };

    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.faucet.adminFundSagaTreasury({
                admin: d.faucetAdminCapId,
                faucet: d.faucetId,
                saga: d.sagaId,
                amount: amountMicro,
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return { ok: false, error: res.error ?? '交易失敗', digest: res.digest };
        }
        const treasuryEndless = (await getSagaTreasuryEndless()) ?? undefined;
        return {
            ok: true,
            digest: res.digest,
            addedEndless: Number(amountMicro) / ENDLESS_DECIMALS,
            treasuryEndless,
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Saga.treasury is a `Balance<CURRENCY>` → RPC json gives a bare number / string
 *  or `{ value }`. Mirror character-read.ts overlaySagaEcon's parse. */
function parseTreasuryEndless(json: unknown): number {
    const t = (json as { treasury?: { value?: number | string } | number | string } | undefined)?.treasury;
    const raw = t == null ? 0 : typeof t === 'object' ? Number(t.value ?? 0) : Number(t);
    return Number.isFinite(raw) ? raw / ENDLESS_DECIMALS : 0;
}
