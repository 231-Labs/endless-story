/**
 * Chain-side fetcher + mapper for the Scene module.
 *
 * Returns UI-shaped `Scene[]` populated from chain. Off-chain
 * enrichment fields (imageUrl / pastEvents / heatProfile / etc.) stay
 * undefined and renderers handle them as optional.
 *
 * The "list scenes for a saga" entry point lives here (not in
 * saga-read) because the heavy lifting is multi-get on Scene objects;
 * we only borrow `fetchSagaAnchorSceneIds` from saga-read to get the
 * id list.
 *
 * Returns empty array on miss / RPC failure so the facade can fall
 * through to mock fixtures.
 */

import type { Scene, SceneHeatProfile, ScenePrivacyLevel } from '@endless-story/shared';
import { makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';
import { fetchSagaAnchorSceneIds } from './saga-read.js';

interface ChainSceneJson {
    info?: { name?: string; description?: string; metadata_uri?: string };
    placement?: {
        world_id?: string;
        saga_id?: string;
        location_id?: string;
        pos_x?: number | string;
        pos_y?: number | string;
    };
    access?: { privacy_level?: number };
    params?: {
        atmosphere?: number | string;
        danger?: number | string;
        prosperity?: number | string;
    };
    state?: {
        causal_commitment_ids?: string[];
        current_character_ids?: string[];
        created_at_ms?: number | string;
    };
}

/**
 * Fetch every Scene anchored to `sagaId`, in saga-declared order
 * (matches `Saga.anchor_scene_ids`).
 *
 * Two-step: get the scene id list from Saga, then batch the scenes.
 * Burned / transferred-out scenes (shouldn't happen — scenes are
 * shared) get silently dropped at the multi-get layer.
 */
export async function fetchOnChainScenesForSaga(idOrSlug: string): Promise<Scene[]> {
    const sceneIds = await fetchSagaAnchorSceneIds(idOrSlug);
    if (sceneIds.length === 0) return [];

    const client = makeSuiClient({ network: resolveNetwork() });
    let scenesRes;
    try {
        scenesRes = await read.scene.getManyScenes(client, sceneIds);
    } catch (err) {
        console.warn('[scene-read] fetchOnChainScenesForSaga failed:', err);
        return [];
    }
    const out: Scene[] = [];
    for (const s of scenesRes) {
        const json = (s as { json?: unknown }).json as ChainSceneJson | undefined;
        const objectId = (s as { objectId?: string }).objectId;
        if (!json || !objectId) continue;
        out.push(mapChainScene(objectId, json));
    }
    return out;
}

/**
 * Fetch a single Scene by object id. Returns null when id isn't a Sui
 * id, the chain rejects the fetch, or the json is missing — caller
 * falls through to mock / off-chain.
 */
export async function fetchOnChainScene(id: string): Promise<Scene | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const res = await read.scene.getScene(client, id);
        const json = (res as { json?: unknown }).json as ChainSceneJson | undefined;
        if (!json) return null;
        return mapChainScene(id, json);
    } catch (err) {
        console.warn('[scene-read] fetchOnChainScene failed:', err);
        return null;
    }
}

function mapChainScene(id: string, json: ChainSceneJson): Scene {
    const privacy = clampPrivacy(json.access?.privacy_level);
    const posX = json.placement?.pos_x;
    const posY = json.placement?.pos_y;
    return {
        id,
        sagaId: json.placement?.saga_id ?? '',
        locationId: json.placement?.location_id,
        name: json.info?.name ?? '無名場景',
        description: json.info?.description ?? '',
        posX: posX != null ? Number(posX) : undefined,
        posY: posY != null ? Number(posY) : undefined,
        privacyLevel: privacy,
        currentCharacterIds: json.state?.current_character_ids ?? [],
        heatProfile: synthesizeHeat(json.params),
        // Off-chain enrichment fields stay undefined: imageUrl, pastEvents,
        // derivativeCounts, ghostQuotes, gallery, performance,
        // recentEventChapterId — all populated by Runner / storyteller UI.
    };
}

/**
 * Derive UI `heatProfile` from chain `Scene.params`. Mapping convention:
 *   - atmosphere → mute     (基調氣場、平靜公共)
 *   - danger     → cinnabar (險、緊張、衝突)
 *   - prosperity → jade     (旺、活力、人氣)
 *
 * Chain values are u64 in `[0, 100]` (story preset convention); UI heat
 * expects `[0, 1]`. Clamped + normalised here.
 *
 * Returns undefined (UI then skips the radial-gradient bleed layer) only
 * when chain didn't give us any params at all — i.e. older Scene objects
 * pre-dating params adoption. Today's bootstrap always writes params,
 * so in practice this is non-undefined for every fresh deployment.
 *
 * When Runner lands and starts producing memory-derived heat, this
 * synthesis becomes the fallback — callers can override `heatProfile`
 * after mapping if they have richer data.
 */
function synthesizeHeat(params: ChainSceneJson['params']): SceneHeatProfile | undefined {
    if (!params) return undefined;
    const atmosphere = clampUnit(params.atmosphere);
    const danger = clampUnit(params.danger);
    const prosperity = clampUnit(params.prosperity);
    if (atmosphere == null && danger == null && prosperity == null) return undefined;
    return {
        cinnabar: danger ?? 0,
        jade: prosperity ?? 0,
        mute: atmosphere ?? 0,
    };
}

function clampUnit(n: number | string | undefined): number | null {
    if (n == null) return null;
    const v = typeof n === 'string' ? Number(n) : n;
    if (!Number.isFinite(v)) return null;
    return Math.max(0, Math.min(1, v / 100));
}

function clampPrivacy(n: number | undefined): ScenePrivacyLevel {
    if (typeof n !== 'number') return 0;
    if (n < 0 || n > 5) return 0;
    return n as ScenePrivacyLevel;
}
