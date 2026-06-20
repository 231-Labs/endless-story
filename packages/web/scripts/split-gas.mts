/**
 * One-shot: split the admin's SUI gas into N independent coins.
 *
 * Why: a single tick fires a burst of same-keypair admin txs (advance, tension,
 * POV anchor, then ⑤′ moment → bond → resolve → encounter). If the admin holds
 * ONE gas coin, every tx consumes + makes-change on it, so their versions thrash
 * and serialize hard — the densest burst (⑤′) is where it stalls. N independent
 * coins let the SDK pick a different coin per tx, killing the gas-coin half of the
 * contention.
 *
 * Limit: the single StorytellerCap can't be split. If the stall persists after
 * this, it's cap-version contention → needs the admin-lock finality fix instead.
 *
 *   npx tsx scripts/split-gas.mts [N=10]
 *
 * Safe to re-run. Run with the runner paused so this tx isn't racing a tick.
 */

import { readFileSync } from 'node:fs';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';

// Load .env.local with a tiny zero-dep parser (Zeabur injects env directly, so the
// readFile just no-ops there and we fall through to the ambient container env).
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
    /* no .env.local → rely on the ambient env (Zeabur) */
}

if (!process.env.SUI_ADMIN_PRIVATE_KEY) {
    console.log('SUI_ADMIN_PRIVATE_KEY not in env — set it, or run where .env.local has it.');
    process.exit(1);
}

const n = Math.max(2, Math.min(50, Number(process.argv[2] ?? 10)));
const signer = loadKeypair();
const addr = signer.toSuiAddress();
const client = makeSuiClient({ network: ENDLESS_STORY_DEPLOYMENT.network });

const before = await client.getCoins({ owner: addr, coinType: '0x2::sui::SUI' });
const total = before.data.reduce((s: bigint, c: { balance: string }) => s + BigInt(c.balance), 0n);
console.log(`admin   ${addr}`);
console.log(`before  ${before.data.length} gas coin(s), total ${total} MIST`);
if (before.data.length === 0 || total === 0n) {
    console.log('→ admin has no SUI. Fund it first.');
    process.exit(1);
}

// Split into n new coins of ~total/(n+2), leaving headroom for gas + change.
const per = total / BigInt(n + 2);
if (per <= 0n) {
    console.log('→ balance too small to split into ' + n + '.');
    process.exit(1);
}
const tx = new Transaction();
const amounts = Array.from({ length: n }, () => per);
const split = tx.splitCoins(tx.gas, amounts);
tx.transferObjects(
    amounts.map((_, i) => split[i]),
    addr,
);

console.log(`split   into ${n} coins of ~${per} MIST each…`);
const res = await client.signAndExecuteTransaction({ transaction: tx, signer, options: { showEffects: true } });
console.log(`status  ${res.effects?.status?.status}  digest ${res.digest}`);
if (res.effects?.status?.error) console.log(`error   ${res.effects.status.error}`);

await client.waitForTransaction({ digest: res.digest }).catch(() => {});
const after = await client.getCoins({ owner: addr, coinType: '0x2::sui::SUI' });
console.log(`after   ${after.data.length} gas coin(s)`);
process.exit(0);
