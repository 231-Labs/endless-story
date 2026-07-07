/**
 * Home seeding (G10) — the night router's missing physical link.
 *
 * spatial-routing's character→home map is off-chain runner config; nothing in
 * production ever seeded it, so every character's "home" fell back to wherever
 * they stood — night routing was a no-op and a private pair could never form
 * (six straight nights of 快轉 while three private homes sat empty in the seed).
 *
 * Homes are AUTHORED canon: the preset's founding_cast carries `home_scene`
 * (scene name). One resident per private scene, so the router's welcome
 * semantics (owner opens the door) stay unambiguous.
 */

import { loadStoryPreset } from '@/lib/stories/loader';
import { setHomeScenes, setWorkScenes, getHomeScene } from './spatial-routing';

let seededForSaga: string | null = null;

export async function ensureHomesSeeded(
    sagaId: string,
    roster: ReadonlyArray<{ id: string; name: string }>,
    scenes: ReadonlyArray<{ id: string; name: string }>,
): Promise<number> {
    if (seededForSaga === sagaId && roster.some((r) => getHomeScene(r.id))) return 0;
    const presetId = process.env.NARRATIVE_STORY_PRESET?.trim() || 'spring-snow';
    let entries: Array<readonly [string, string]> = [];
    try {
        const preset = (await loadStoryPreset(presetId)) as unknown as {
            founding_cast?: Array<{ name?: string; home_scene?: string; work_scene?: string }>;
        };
        const sceneIdByName = new Map(scenes.map((s) => [s.name, s.id]));
        const idByName = new Map(roster.map((r) => [r.name, r.id]));
        const resolve = (name?: string, scene?: string): readonly [string, string] | null => {
            const cid = name ? idByName.get(name) : undefined;
            const sid = scene ? sceneIdByName.get(scene) : undefined;
            return cid && sid ? ([cid, sid] as const) : null;
        };
        const cast = preset.founding_cast ?? [];
        entries = cast
            .map((c) => resolve(c.name, c.home_scene))
            .filter((x): x is readonly [string, string] => Boolean(x));
        // Work anchors ride the same seeding pass (G11).
        setWorkScenes(
            cast
                .map((c) => resolve(c.name, c.work_scene))
                .filter((x): x is readonly [string, string] => Boolean(x)),
        );
    } catch {
        return 0; // no preset → no anchors; routers fall back to stay-put
    }
    setHomeScenes(entries);
    seededForSaga = sagaId;
    return entries.length;
}
