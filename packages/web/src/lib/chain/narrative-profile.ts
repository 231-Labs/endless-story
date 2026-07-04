/**
 * Narrative profile — the content/config side of the prompt split (server-only).
 *
 * Engine mechanics (craft rules, JSON schemas, forcing language) live in code;
 * CONTENT lives in the story preset and is loaded here per process:
 *   world.narrative  → genre base (shared by every saga in the world)
 *   saga.narrative   → voice knobs, contention framings, feature capabilities
 *
 * Selection: `NARRATIVE_STORY_PRESET` env (default `spring-snow`). Failure-
 * isolated — any read problem falls back to engine defaults, so a missing or
 * malformed preset never blocks the loop. The observatory's soul override
 * always wins over this profile.
 */

import type { SagaSoul } from '@endless-story/runner';
import { loadStoryPreset } from '@/lib/stories/loader';
import { setFramingCatalog, type FramingCatalog } from './event-planner';

export interface NarrativeFeatures {
    eventImage: boolean;
    stills: boolean;
    video: boolean;
}

export interface NarrativeProfile {
    soul?: SagaSoul;
    framings?: FramingCatalog;
    features: NarrativeFeatures;
}

const DEFAULT_FEATURES: NarrativeFeatures = { eventImage: true, stills: true, video: false };

let cached: NarrativeProfile | null = null;

export async function loadNarrativeProfile(): Promise<NarrativeProfile> {
    if (cached) return cached;
    const id = process.env.NARRATIVE_STORY_PRESET?.trim() || 'spring-snow';
    try {
        const preset = await loadStoryPreset(id);
        const w = preset.world?.narrative;
        const s = preset.saga?.narrative;
        const soul: SagaSoul = {};
        if (w?.genre_base?.trim()) soul.genreBase = w.genre_base.trim();
        if (s?.tone_register?.trim()) soul.toneRegister = s.tone_register.trim();
        if (s?.emotional_stance === 'tender' || s?.emotional_stance === 'consummate') {
            soul.emotionalStance = s.emotional_stance;
        }
        cached = {
            soul: Object.keys(soul).length > 0 ? soul : undefined,
            framings: s?.framings as FramingCatalog | undefined,
            features: {
                eventImage: s?.features?.event_image ?? DEFAULT_FEATURES.eventImage,
                stills: s?.features?.stills ?? DEFAULT_FEATURES.stills,
                video: s?.features?.video ?? DEFAULT_FEATURES.video,
            },
        };
    } catch {
        cached = { features: DEFAULT_FEATURES };
    }
    return cached;
}

/** Load + push the profile into module seams (framing catalog). Call at tick start. */
export async function installNarrativeProfile(): Promise<NarrativeProfile> {
    const p = await loadNarrativeProfile();
    setFramingCatalog(p.framings ?? null);
    return p;
}
