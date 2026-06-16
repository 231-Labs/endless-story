'use server';

/**
 * Resource ledger view — see who actually HOLDS each contested resource right now,
 * so you can tell at a glance whether the world's economy moves (resources change
 * hands) or is frozen (everything 懸而未決 because events resolve empty_outcome).
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient } from '@endless-story/sdk';
import { resolveNetwork } from '@/lib/chain/network';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { readResourceLedger } from '@/lib/chain/drama';
import { charactersApi } from '@/lib/api/index';

export interface LedgerHolder {
    name: string;
    units: number;
}

export interface LedgerRow {
    resourceId: string;
    label: string;
    capacity: number;
    holders: LedgerHolder[];
    /** false = 懸而未決 (nobody holds it) — the frozen-world tell. */
    held: boolean;
}

export interface ResourceLedgerResult {
    ok: boolean;
    rows: LedgerRow[];
    /** how many resources currently have at least one holder. */
    heldCount: number;
    error?: string;
}

export async function readResourceLedgerAction(): Promise<ResourceLedgerResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) return { ok: false, rows: [], heldCount: 0, error: 'saga 尚未種子化' };

    let client;
    try {
        client = getAdminContext().client;
    } catch {
        client = makeSuiClient({ network: resolveNetwork() });
    }

    const [snapshots, characters] = await Promise.all([
        readResourceLedger(client, d.packageId, d.sagaId).catch(() => []),
        charactersApi.listSagaCharacters(d.sagaId).catch(() => []),
    ]);
    const nameById = new Map(characters.map((c) => [c.id, c.name]));

    const rows: LedgerRow[] = snapshots.map((r) => {
        const holders = Object.entries(r.allocations)
            .filter(([, units]) => units > 0n)
            .map(([id, units]) => ({ name: nameById.get(id) ?? id.slice(0, 10), units: Number(units) }));
        return {
            resourceId: r.id,
            label: r.label,
            capacity: Number(r.capacity),
            holders,
            held: holders.length > 0,
        };
    });

    return { ok: true, rows, heldCount: rows.filter((r) => r.held).length };
}
