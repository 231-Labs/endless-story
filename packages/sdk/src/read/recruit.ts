/**
 * Recruit view queries — fetch + decode GenesisVoucher / JoinIntent.
 *
 * Thin wrappers around `MoveStruct.get` from `generated/endless_story/recruit.ts`.
 */
import * as gen from '../generated/endless_story/recruit.js';
import type { SuiClient } from '../client.js';
import { scanEvents } from './query-retry.js';

export { gen as raw };

export const getGenesisVoucher = (client: SuiClient, voucherId: string) =>
  gen.GenesisVoucher.get({ client, objectId: voucherId });

export const getRedeemIntent = (client: SuiClient, intentId: string) =>
  gen.RedeemIntent.get({ client, objectId: intentId });

export const getJoinIntent = (client: SuiClient, intentId: string) =>
  gen.JoinIntent.get({ client, objectId: intentId });

/* ── voucher event log ──────────────────────────────────────────────── */

/**
 * Parsed event row from `recruit::GenesisVoucherRedeemed`.
 *
 * `hint` carries the caller's tag (e.g. off-chain recruitment id) from
 * the consumed voucher — set by the wizard at mint time, propagated
 * through redeem so it survives the voucher object's destruction. Use
 * this to count redemptions per recruitment campaign.
 */
export interface VoucherRedeemedSummary {
    voucherId: string;
    sagaId: string;
    characterId: string;
    redeemedAtMs: string;
    hint: string | null;
    intentHint: string | null;
}

export interface ListVoucherRedeemedOptions {
    /** Filter: only events for this saga. */
    sagaId?: string;
    /** Filter: only events whose `hint` equals this string. */
    hint?: string;
    /** Cap on events scanned. Default unlimited. */
    maxEvents?: number;
}

/**
 * Scan `GenesisVoucherRedeemed` events for the deployed package,
 * newest first. Off-chain capacity counting joins these with off-chain
 * recruitment records via the `hint` field.
 *
 * Move `Option<String>` deserialises as `string | null` in event json
 * (Sui's parsedJson collapses Some/None); defensive parsing below
 * handles the older `{ Some, vec }` shapes too.
 */
export async function listVoucherRedeemedEvents(
    client: SuiClient,
    packageId: string,
    opts: ListVoucherRedeemedOptions = {},
): Promise<VoucherRedeemedSummary[]> {
    const eventType = `${packageId}::recruit::GenesisVoucherRedeemed`;
    const out: VoucherRedeemedSummary[] = [];
    const cap = opts.maxEvents ?? Infinity;

    await scanEvents(client, eventType, (ev) => {
        const parsed = ev.parsedJson as Partial<{
            voucher_id: string;
            saga_id: string;
            character_id: string;
            redeemed_at_ms: string | number;
            hint: unknown;
            intent_hint: unknown;
        }>;
        if (!parsed.voucher_id) return;
        const sagaId = parsed.saga_id ?? '';
        const hint = unwrapOptionString(parsed.hint);
        const intentHint = unwrapOptionString(parsed.intent_hint);
        if (opts.sagaId && sagaId !== opts.sagaId) return;
        if (opts.hint !== undefined && hint !== opts.hint) return;
        out.push({
            voucherId: parsed.voucher_id,
            sagaId,
            characterId: parsed.character_id ?? '',
            redeemedAtMs: String(parsed.redeemed_at_ms ?? '0'),
            hint,
            intentHint,
        });
        if (out.length >= cap) return false;
    });
    return out;
}

function unwrapOptionString(raw: unknown): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if ('Some' in obj && typeof obj.Some === 'string') return obj.Some;
    if ('vec' in obj && Array.isArray(obj.vec)) {
        return typeof obj.vec[0] === 'string' ? obj.vec[0] : null;
    }
    return null;
}
