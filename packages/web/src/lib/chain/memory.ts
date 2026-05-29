/**
 * MemWal character memory — recall + remember helpers.
 *
 * Server-only. Encapsulates the SagaMemoryClient lifecycle so callers
 * (pov-core, run-reflection) don't touch the client directly:
 *   - resolve the character's admin-held ControlCap (from CharacterMinted)
 *   - build a SagaMemoryClient from env
 *   - run one recall / remember, then destroy
 *
 * **Graceful no-op**: if the MemWal env isn't configured (no relayer
 * creds yet), `recall` returns [] and `remember` returns false — the
 * narrative pipeline keeps working without long-term memory. This lets
 * the integration land before creds arrive and light up the moment
 * `MEMWAL_DELEGATE_KEY` + `MEMWAL_ACCOUNT_ID` are set.
 *
 * **Network**: SEAL only runs on testnet/mainnet, so the client is
 * pinned there (devnet deployments can't encrypt/decrypt). See the
 * Phase-3 migration note in AGENTS / the seal backlog memory.
 *
 * Architecture: web → memwal is the sanctioned path (memwal is the sole
 * Walrus/SEAL entrypoint). Never import @mysten/seal here directly.
 */

import { SagaMemoryClient } from '@endless-story/memwal';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { getAdminAddress } from './admin-signer.js';

interface MemEnv {
    delegateKey?: string;
    accountId?: string;
    serverUrl?: string;
    suiPrivateKey?: string;
    embeddingApiKey?: string;
}

// Official env names match the MemWal docs / dashboard:
//   MEMWAL_PRIVATE_KEY = the ed25519 delegate private key (relayer auth)
//   MEMWAL_ACCOUNT_ID  = MemWalAccount object id (from the dashboard)
//   MEMWAL_SERVER_URL  = relayer base URL (optional; we default by network)
function memEnv(): MemEnv {
    return {
        delegateKey: process.env.MEMWAL_PRIVATE_KEY,
        accountId: process.env.MEMWAL_ACCOUNT_ID,
        serverUrl: process.env.MEMWAL_SERVER_URL,
        suiPrivateKey: process.env.SUI_ADMIN_PRIVATE_KEY,
        embeddingApiKey: process.env.OPENAI_API_KEY,
    };
}

/** True when all required MemWal creds are present. */
export function isMemoryConfigured(): boolean {
    const e = memEnv();
    return Boolean(
        e.delegateKey && e.accountId && e.suiPrivateKey && e.embeddingApiKey,
    );
}

/** SEAL only runs on testnet/mainnet; clamp anything else to testnet. */
function sealNetwork(): 'testnet' | 'mainnet' {
    return resolveNetwork() === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Per-character namespace. The relayer's vector index is scoped by
 * (owner, namespace) — without this, every character would share the
 * admin's single default space and recall would pull cross-character
 * blob ids (SEAL would then drop them on decrypt, but wastefully).
 * Scoping by characterId keeps each character's index clean.
 */
function namespaceFor(characterId: string): string {
    return `char_${characterId}`;
}

/**
 * Relayer base URL. The managed relayer is network-specific:
 *   testnet → staging.memwal.ai, mainnet → relayer.memwal.ai.
 * Defaulting wrong (e.g. mainnet relayer with a testnet account) yields
 * 401s, so we pick by network unless MEMWAL_SERVER_URL overrides.
 */
function relayerUrl(): string {
    const override = memEnv().serverUrl;
    if (override) return override;
    return sealNetwork() === 'mainnet'
        ? 'https://relayer.memwal.ai'
        : 'https://relayer.staging.memwal.ai';
}

/**
 * Resolve the **current** admin-held ControlCap for a character.
 *
 * Prefers the highest-epoch ControlCap owned by the admin address — this
 * survives `revoke_all_control` / `reassign_saga`, which bump the
 * character's epoch and strand older caps in the wallet. Falls back to
 * the mint-time cap from the CharacterMinted event if the owned-objects
 * scan finds nothing (e.g. admin address unavailable).
 *
 * Returns null when no usable cap is found — after a revoke with no
 * re-issue, the stale cap is still returned but recall will hit
 * `ENoAccess` at the SEAL key server (epoch mismatch), which the caller
 * swallows → [] (i.e. access is cut, as intended).
 */
async function resolveControlCapId(characterId: string): Promise<string | null> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const client = makeSuiClient({ network: resolveNetwork() });

    // Primary: highest-epoch ControlCap the admin currently owns.
    try {
        const admin = getAdminAddress();
        const caps = await read.character.listControlCapsForAddress(client, admin, pkg);
        const mine = caps
            .filter((c) => c.characterId === characterId)
            .sort((a, b) => b.epoch - a.epoch);
        if (mine.length > 0) return mine[0].capId;
    } catch (err) {
        console.warn('[memory] listControlCapsForAddress failed, falling back:', err);
    }

    // Fallback: mint-time cap from the CharacterMinted event.
    try {
        const summaries = await read.character.listMintedCharacterSummaries(client, pkg, {});
        const match = summaries.find((s) => s.characterId === characterId);
        return match?.controlCapId || null;
    } catch (err) {
        console.warn('[memory] resolveControlCapId fallback failed:', err);
        return null;
    }
}

async function clientFor(characterId: string): Promise<SagaMemoryClient | null> {
    if (!isMemoryConfigured()) return null;
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return null;
    const controlCapId = await resolveControlCapId(characterId);
    if (!controlCapId) return null;
    const e = memEnv();
    try {
        return SagaMemoryClient.create({
            key: e.delegateKey!,
            accountId: e.accountId!,
            serverUrl: relayerUrl(),
            suiPrivateKey: e.suiPrivateKey!,
            embeddingApiKey: e.embeddingApiKey!,
            packageId: pkg,
            characterId,
            controlCapId,
            suiNetwork: sealNetwork(),
        });
    } catch (err) {
        console.warn('[memory] SagaMemoryClient.create failed:', err);
        return null;
    }
}

/**
 * Recall a character's most relevant memories for a query. Returns
 * decrypted text snippets (newest/closest first), [] when unconfigured
 * or on failure.
 */
export async function recallForCharacter(
    characterId: string,
    query: string,
    limit = 6,
): Promise<string[]> {
    const client = await clientFor(characterId);
    if (!client) return [];
    try {
        const res = await client.recall(query, limit, namespaceFor(characterId));
        const snippets: string[] = [];
        for (const hit of res.results) {
            if ('text' in hit && typeof hit.text === 'string' && hit.text.trim()) {
                snippets.push(hit.text.trim());
            }
        }
        console.log(
            `[memory] recall ${characterId.slice(0, 10)}… → ${snippets.length} memories`,
        );
        return snippets;
    } catch (err) {
        console.warn('[memory] recall failed:', err);
        return [];
    } finally {
        client.destroy();
    }
}

/**
 * Store a memory for a character. Returns true if written, false when
 * unconfigured or on failure (non-fatal — the chapter is still anchored
 * on chain regardless).
 */
export async function rememberForCharacter(
    characterId: string,
    text: string,
): Promise<boolean> {
    if (!text.trim()) return false;
    const client = await clientFor(characterId);
    if (!client) return false;
    try {
        await client.remember(text, namespaceFor(characterId));
        console.log(
            `[memory] remember ${characterId.slice(0, 10)}… ✓ (${text.length} chars)`,
        );
        return true;
    } catch (err) {
        console.warn('[memory] remember failed:', err);
        return false;
    } finally {
        client.destroy();
    }
}
