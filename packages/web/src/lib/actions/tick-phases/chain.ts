// Chain-touching helpers shared by the tick phases.
// Plain module (not 'use server').
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import type { AdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';

/**
 * Build + sign + execute one PTB. `build` adds the move-calls. Returns
 * {ok,digest,error} — never throws (a thrown signer/RPC error is captured),
 * so callers can branch on ok (e.g. batch → per-item fallback).
 */
export async function trySend(
    admin: AdminContext,
    build: (txb: Transaction) => void,
): Promise<{ ok: boolean; digest?: string; error?: string }> {
    try {
        const txb = new Transaction();
        build(txb);
        const res = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true },
        });
        const ok = res.effects?.status?.status === 'success';
        await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        return { ok, digest: res.digest, error: ok ? undefined : res.effects?.status?.error };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Characters bound to an OPEN budget event (they stay put / skip SOCIAL). */
export async function fetchBusyCharacterIds(sagaId: string): Promise<Set<string>> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    const busy = new Set<string>();
    if (!pkg) return busy;
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);
    for (const ev of summaries) {
        try {
            const res = await read.event.getBudgetEvent(client, ev.eventId);
            const j = res.json as unknown as {
                meta?: { status?: number | string };
                deck?: { participants?: string[] };
            };
            if (Number(j.meta?.status ?? 0) !== 0) continue;
            for (const p of j.deck?.participants ?? []) busy.add(p);
        } catch {
            /* ignore one event read */
        }
    }
    return busy;
}
