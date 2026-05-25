/**
 * Chain-side name resolvers for Saga + Scene.
 *
 * The DossierHeader (and similar surfaces) shows human names like
 * 「春雪社」 / 「百花樓戲台」 next to a character. On-chain those live
 * inside `Saga.info.name` and `Scene.info.name` — this module fetches
 * them by object id and returns the string, or null if unreachable.
 *
 * Returns null (not throw) so callers fall through to mock/fallback
 * labels rather than crash the page.
 */

import { makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from './network.js';

const SUI_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function isSuiObjectId(id: string | null | undefined): id is string {
    return typeof id === 'string' && SUI_ID_RE.test(id);
}

/**
 * Saga decoded JSON shape — `name` is a top-level field on `Saga`
 * (see `saga::Saga` MoveStruct, no `SagaInfo` wrapper).
 */
interface ChainSagaJson {
    name?: string;
    description?: string;
}

/**
 * Scene decoded JSON shape — `Scene` wraps identity in `SceneInfo`,
 * so `name` lives under `info.name`.
 */
interface ChainSceneJson {
    info?: { name?: string; description?: string };
}

export async function fetchOnChainSagaName(sagaId: string | null | undefined): Promise<string | null> {
    if (!isSuiObjectId(sagaId)) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const res = await read.saga.getSaga(client, sagaId);
        const json = res.json as unknown as ChainSagaJson | undefined;
        return json?.name ?? null;
    } catch (err) {
        console.warn('[saga-scene-read] getSaga failed:', err);
        return null;
    }
}

export async function fetchOnChainSceneName(sceneId: string | null | undefined): Promise<string | null> {
    if (!isSuiObjectId(sceneId)) return null;
    const client = makeSuiClient({ network: resolveNetwork() });
    try {
        const res = await read.scene.getScene(client, sceneId);
        const json = res.json as unknown as ChainSceneJson | undefined;
        return json?.info?.name ?? null;
    } catch (err) {
        console.warn('[saga-scene-read] getScene failed:', err);
        return null;
    }
}
