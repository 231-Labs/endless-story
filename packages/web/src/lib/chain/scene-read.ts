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

import type { Scene, ScenePrivacyLevel } from '@endless-story/shared';
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
        // Off-chain enrichment fields stay undefined: imageUrl, pastEvents,
        // heatProfile, derivativeCounts, ghostQuotes, gallery, performance,
        // recentEventChapterId — all populated by Runner / storyteller UI.
    };
}

function clampPrivacy(n: number | undefined): ScenePrivacyLevel {
    if (typeof n !== 'number') return 0;
    if (n < 0 || n > 5) return 0;
    return n as ScenePrivacyLevel;
}
