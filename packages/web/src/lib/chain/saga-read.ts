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

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function isSuiObjectId(id: string | null | undefined): id is string {
    return typeof id === 'string' && SUI_ID_RE.test(id);
}

/** Saga decoded JSON shape — `name` is flat (no SagaInfo wrapper). */
interface ChainSagaJson {
    name?: string;
    description?: string;
    covered_location_ids?: string[];
    anchor_scene_ids?: string[];
    character_count?: number | string;
}

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
    return {
        id: sagaId,
        name: json.name ?? '無名戲班',
        description: json.description ?? '',
        // currentDay / premise are storyteller-narrative fields not on
        // chain. Leave defaults; UI degrades gracefully.
        currentDay: 1,
        premise: json.description ?? '',
        castIds: [],
        coveredLocationIds: json.covered_location_ids ?? [],
    };
}

/** Internal helper for `scene-read.ts` — get a saga's anchor scene ids. */
export async function fetchSagaAnchorSceneIds(idOrSlug: string): Promise<string[]> {
    const sagaId = resolveSagaIdFromSlug(idOrSlug);
    if (!sagaId) return [];
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
