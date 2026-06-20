/**
 * One-shot diagnostic: directly resolve ONE open BudgetEvent with empty_outcomes
 * (the same tx the spine's plainResolve falls back to) and print the REAL result.
 *
 * Why: the tick loop's cut job wraps this in a 180s timeout that hides whether the
 * tx aborted (contract/version), succeeded, or just never came back (RPC/cap lock).
 * This runs the bare tx with no wrapper + a hard 60s race so a hang is visible.
 *
 * Run on the VPS, in packages/web, with the runner PAUSED (so nothing else touches
 * the admin cap/gas at the same time — that isolates contention from a real bug):
 *
 *   npx tsx scripts/probe-resolve.mts <eventId>
 *
 * Read the output:
 *   status=success            → the tx itself is fine; the tick's stall is contention
 *                               or an earlier RPC read (readResourceLedger), not resolve.
 *   ABORT "...version..."      → owned-object contention (the equivocation you feared).
 *   ABORT <module::code>       → a real contract/state bug — paste it to me.
 *   HANG: no response in 60s   → tx stuck in submit (cap/gas locked) → contention.
 */

import { readFileSync } from 'node:fs';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx, read, makeSuiClient, type SuiClient } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';

// Load .env.local into process.env with a tiny zero-dep parser (the admin key
// SUI_ADMIN_PRIVATE_KEY lives there). Avoids @next/env, which isn't a direct dep.
try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) {
            let v = m[2];
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            process.env[m[1]] = v;
        }
    }
} catch {
    /* no .env.local in cwd → rely on the ambient env */
}

const eventId = process.argv[2];
if (!eventId) {
    console.error('usage: npx tsx scripts/probe-resolve.mts <eventId>');
    process.exit(1);
}

const d = ENDLESS_STORY_DEPLOYMENT;
const client: SuiClient = makeSuiClient({ network: d.network }); // honours SUI_RPC_URL, same as the web app
const signer = loadKeypair();

console.log('RPC    ' + (process.env.SUI_RPC_URL ?? '(network default: ' + d.network + ')'));
console.log(`admin  ${signer.toSuiAddress()}`);
console.log(`saga   ${d.sagaId}`);
console.log(`cap    ${d.storytellerCapId}`);

// 0. admin gas coins — a starved/locked gas coin is itself a stall cause.
const coins = await client.getCoins({ owner: signer.toSuiAddress(), coinType: '0x2::sui::SUI' });
const totalMist = coins.data.reduce((s: bigint, c: { balance: string }) => s + BigInt(c.balance), 0n);
console.log(`gas    ${coins.data.length} SUI coin(s), total ${totalMist} MIST`);

// 1. read the event
const ev = await read.event.getBudgetEvent(client, eventId);
const meta = (ev.json as { meta?: { status?: number | string; scene_id?: string; title?: string } })?.meta;
console.log(`event  ${eventId.slice(0, 12)}… status=${meta?.status} scene=${meta?.scene_id} title="${meta?.title}"`);
if (Number(meta?.status ?? 0) !== 0) {
    console.log('→ event is NOT OPEN (already resolved). Pick a currently-live one from the log.');
    process.exit(0);
}
if (!meta?.scene_id) {
    console.log('→ no scene_id on the event; cannot build resolve_event.');
    process.exit(1);
}

// 2. build the bare empty_outcomes resolve (identical to spine plainResolve)
const t = new Transaction();
const outcomes = t.add(endlessTx.event.emptyOutcomes());
t.add(
    endlessTx.event.resolveEvent({
        cap: d.storytellerCapId,
        saga: d.sagaId,
        budgetEvent: eventId,
        scene: meta.scene_id,
        outcomes,
    }),
);

// 3. execute with NO wrapper + a hard 60s race so a hang is visible
console.log('submitting empty_outcomes resolve (60s hard timeout)…');
const t0 = Date.now();
try {
    const res = (await Promise.race([
        client.signAndExecuteTransaction({ transaction: t, signer, options: { showEffects: true } }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('HANG: no response in 60s')), 60_000)),
    ])) as Awaited<ReturnType<SuiClient['signAndExecuteTransaction']>>;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`← returned in ${secs}s  status=${res.effects?.status?.status}  digest=${res.digest}`);
    if (res.effects?.status?.error) console.log(`  ABORT error: ${res.effects.status.error}`);
} catch (e) {
    console.log(`← after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e instanceof Error ? e.message : String(e)}`);
}
process.exit(0);
