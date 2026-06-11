/**
 * Admin (storyteller) keypair loading + client construction.
 *
 * Node-only — DO NOT import from client components. Server actions only.
 *
 * Delegates to `@endless-story/sdk/node` so there's a single canonical
 * key source: `SUI_ADMIN_PRIVATE_KEY` env var (bech32 `suiprivkey1...`).
 * Set it in `packages/web/.env.local`.
 *
 * The admin keypair holds:
 *   - World AdminCap
 *   - Saga StorytellerCap (after bootstrap)
 *   - Faucet AdminCap
 * So it can: redeem vouchers, mint admin ENDLESS, advance world ticks, etc.
 */

import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { makeSuiClient, type SuiClient } from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { resolveNetwork } from './network.js';

let _cached: { keypair: Ed25519Keypair; address: string } | null = null;

export function loadAdminKeypair(): Ed25519Keypair {
    if (_cached) return _cached.keypair;
    const keypair = loadKeypair();
    _cached = { keypair, address: keypair.toSuiAddress() };
    return keypair;
}

export function getAdminAddress(): string {
    if (!_cached) loadAdminKeypair();
    return _cached!.address;
}

/* ── process-wide admin-tx serialization ──────────────────────────────────
 * Every tx signed by THIS keypair consumes the admin's gas coin + (usually) the
 * StorytellerCap — both OWNED objects, version-locked. If two admin txs overlap
 * — parallel event opens, or a previous tick's background `after()` job (event
 * moment / spine resolve) still running when the next tick's foreground deals
 * fire — they race on those versions and abort with "version unavailable" or
 * (when a dependent object hasn't propagated yet) "object does not exist". We
 * chain admin txs strictly one-at-a-time and waitForTransaction INSIDE the lock,
 * so each tx's created objects + owned-object versions are settled on the node
 * before the next tx builds. Module-level → shared across every request and
 * after() in this server process. */
let adminTxChain: Promise<unknown> = Promise.resolve();

/** Run `fn` after all previously-queued admin txs settle — the process-wide
 *  serialization primitive. Use it to wrap ANY admin-keypair tx that does NOT go
 *  through `getAdminClient`'s wrapped client (e.g. the runner's `signAndAnchor`,
 *  which builds its own client) so it can't race the others on the shared gas
 *  coin / StorytellerCap. */
export function withAdminLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = adminTxChain.then(fn, fn);
    adminTxChain = run.then(
        () => {},
        () => {},
    );
    return run;
}

function serializeAdminTxs(client: SuiClient): SuiClient {
    const raw = client.signAndExecuteTransaction.bind(client);
    type Args = Parameters<typeof raw>[0];
    client.signAndExecuteTransaction = ((args: Args) =>
        withAdminLock(async () => {
            const res = await raw(args);
            if (res?.digest) await client.waitForTransaction({ digest: res.digest }).catch(() => {});
            return res;
        })) as typeof client.signAndExecuteTransaction;
    return client;
}

/** Build a Sui client targeting the deployed network. Admin txs through this
 *  client are serialized process-wide (see `serializeAdminTxs`). */
export function getAdminClient(): SuiClient {
    return serializeAdminTxs(makeSuiClient({ network: resolveNetwork() }));
}

/** Pair: client + signer, for admin server actions. */
export interface AdminContext {
    client: SuiClient;
    signer: Ed25519Keypair;
    address: string;
}

export function getAdminContext(): AdminContext {
    const signer = loadAdminKeypair();
    return {
        client: getAdminClient(),
        signer,
        address: signer.toSuiAddress(),
    };
}
