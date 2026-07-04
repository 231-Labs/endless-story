/**
 * Narrative profile — content/config side of the prompt split (server-only).
 * world.narrative = genre base; saga.narrative = voice knobs, framings, features.
 * Preset from NARRATIVE_STORY_PRESET (default `spring-snow`); any read failure
 * falls back to engine defaults. The observatory soul override wins over this.
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
    /** Image-pipeline style prefix for this saga's generated art. */
    artStyle?: string;
    /** Canon honorifics facts for beat/episode prompts. */
    etiquette?: string;
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
            artStyle: s?.art_style?.trim() || undefined,
            etiquette: s?.etiquette?.trim() || undefined,
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
