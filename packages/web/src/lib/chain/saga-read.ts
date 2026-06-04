/**
 * Chain-side fetcher + mapper for the Saga module.
 *
 * Returns UI-shaped `Saga` populated from chain. Off-chain enrichment
 * fields (sagaPrompts / metrics / worldTime / revenueConfig) stay
 * undefined and renderers treat them as optional.
 *
 * Also exposes `resolveSagaIdFromSlug` because slug → sagaId mapping
 * is Saga-domain concern (other chain readers don't need it).
 *
 * Returns null on miss / RPC failure so the facade can fall through to
 * mock fixtures.
 */

import type { Saga } from '@endless-story/shared';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { fetchOnChainWorldTime } from './world-read.js';
import { cachedPublicRead, publicChainReadTtl } from './read-cache.js';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function isSuiObjectId(id: string | null | undefined): id is string {
    return typeof id === 'string' && SUI_ID_RE.test(id);
}

/** Saga decoded JSON shape — `name` is flat (no SagaInfo wrapper). */
interface ChainSagaJson {
    name?: string;
    description?: string;
    world_id?: string;
    covered_location_ids?: string[];
    anchor_scene_ids?: string[];
    character_count?: number | string;
    departure_policy?: string;
    nature_prompt?: string;
    rhythm_hints?: string;
    /** Balance<CURRENCY>.value — raw smallest unit. */
    treasury?: number | string;
    revenue_config?: {
        owner_bps?: number | string;
        storyteller_bps?: number | string;
        treasury_bps?: number | string;
    };
}

/** ENDLESS coin decimals — matches currency.move. */
const ENDLESS_DECIMALS = 6;

/**
 * Map a URL slug (e.g. `spring-snow`) to a chain Saga object id.
 *
 * Today: single-saga deployment. `contract-ids.storyId` is the slug,
 * `contract-ids.sagaId` is the object id. Match → return id.
 *
 * Tomorrow: extend by reading a `sagas: Record<slug, id>` dict from
 * contract-ids (cli will write that field when bootstrapping multiple
 * sagas) or by scanning `World.state.saga_ids` and matching each
 * saga's `name` field against the slug.
 */
export function resolveSagaIdFromSlug(slug: string | null | undefined): string | null {
    if (!slug) return null;
    if (isSuiObjectId(slug)) return slug;
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (d.storyId && d.sagaId && slug === d.storyId) return d.sagaId;
    return null;
}

/**
 * Fetch a Saga by id-or-slug. Returns the UI shape with chain-sourced
 * fields populated.
 *
 * `castIds` is intentionally empty here — populating it requires a
 * separate CharacterMinted event scan (handled by
 * `charactersApi.listSagaCharacters`), so we don't double-fetch.
 */
export async function fetchOnChainSaga(idOrSlug: string): Promise<Saga | null> {
    const sagaId = resolveSagaIdFromSlug(idOrSlug);
    if (!sagaId) return null;
    return cachedPublicRead(
        `saga:${resolveNetwork()}:${sagaId}`,
        publicChainReadTtl(15_000),
        () => fetchOnChainSagaFresh(sagaId),
    );
}

async function fetchOnChainSagaFresh(sagaId: string): Promise<Saga | null> {
    const client = makeSuiClient({ network: resolveNetwork() });
    let res;
    try {
        res = await read.saga.getSaga(client, sagaId);
    } catch (err) {
        console.warn('[saga-read] fetchOnChainSaga failed:', err);
        return null;
    }
    const json = res.json as unknown as ChainSagaJson | undefined;
    if (!json) return null;
    const rc = json.revenue_config;
    // Compose worldTime by reading the saga's parent World. Sequential
    // (not parallel) because the world_id only comes out of the saga
    // fetch above; it's one extra RPC. `worldTime` stays undefined if
    // world unreachable — UI defaults to 'noon' / Day 1 in that case.
    const worldTime = json.world_id
        ? (await fetchOnChainWorldTime(json.world_id)) ?? undefined
        : undefined;
    // Saga soul (F): departure_policy + nature_prompt + rhythm_hints are all
    // on chain now. Build sagaPrompts when any is non-empty so SagaCharterPanel
    // shows real values and generation can read them. departurePolicy is the
    // type's required field → default '' if only nature/rhythm are set.
    const naturePrompt = json.nature_prompt?.trim() || undefined;
    const rhythmHints = json.rhythm_hints?.trim() || undefined;
    const departurePolicy = json.departure_policy?.trim() || undefined;
    const sagaPrompts =
        departurePolicy || naturePrompt || rhythmHints
            ? { departurePolicy: departurePolicy ?? '', naturePrompt, rhythmHints }
            : undefined;
    return {
        id: sagaId,
        name: json.name ?? '無名戲班',
        description: json.description ?? '',
        // currentDay tracks the on-chain world day; falls back to 1 when
        // worldTime unavailable. premise stays mock-derived (chain has
        // description but no separate premise concept).
        currentDay: worldTime?.day ?? 1,
        premise: json.description ?? '',
        castIds: [],
        coveredLocationIds: json.covered_location_ids ?? [],
        worldTime,
        sagaPrompts,
        revenueConfig: rc
            ? {
                  ownerBps: Number(rc.owner_bps ?? 0),
                  storytellerBps: Number(rc.storyteller_bps ?? 0),
                  treasuryBps: Number(rc.treasury_bps ?? 0),
              }
            : undefined,
        metrics: {
            // Runner-derived (chapter / subscription accounting) — 0
            // until that pipeline lands.
            totalChapters: 0,
            totalSubscribers: 0,
            avgSubsPerCharacter: 0,
            // Chain Saga.treasury is Balance.value (raw smallest unit).
            // Display in ENDLESS units (divide by 10^decimals).
            treasuryFunds: json.treasury != null
                ? Number(json.treasury) / 10 ** ENDLESS_DECIMALS
                : 0,
        },
        // Off-chain enrichment fields stay undefined: worldTime
        // (storyteller pushes), totalDays (only if arc planned).
    };
}

/** Internal helper for `scene-read.ts` — get a saga's anchor scene ids. */
export async function fetchSagaAnchorSceneIds(idOrSlug: string): Promise<string[]> {
    const sagaId = resolveSagaIdFromSlug(idOrSlug);
    if (!sagaId) return [];
    return cachedPublicRead(
        `saga-scenes:${resolveNetwork()}:${sagaId}`,
        publicChainReadTtl(15_000),
        () => fetchSagaAnchorSceneIdsFresh(sagaId),
    );
}

async function fetchSagaAnchorSceneIdsFresh(sagaId: string): Promise<string[]> {
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const res = await read.saga.getSaga(client, sagaId);
        const json = res.json as unknown as ChainSagaJson | undefined;
        return json?.anchor_scene_ids ?? [];
    } catch (err) {
        console.warn('[saga-read] fetchSagaAnchorSceneIds failed:', err);
        return [];
    }
}
