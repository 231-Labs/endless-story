'use server';

/**
 * Troupe-temperament (氣質) read + write.
 *
 * The stance (克制 / 溫存 / 盡致) is prose-craft config, not on-chain: the preset
 * ships a baseline and the backstage knob writes an override into the local
 * stance store. Read is used by the 規章 read-only spectrum and by the backstage
 * panel; write is the backstage knob. No wallet / gas — purely local config.
 */

import {
    getEffectiveStance,
    resetNarrativeProfileCache,
} from '@/lib/chain/narrative-profile';
import {
    getStanceOverride,
    setStanceOverride,
    type EmotionalStance,
} from '@/lib/chain/saga-stance-store';

export interface StanceSnapshot {
    /** Effective stance in force now (override, else preset). */
    stance: EmotionalStance;
    /** What the preset ships, for the "reset to preset" affordance. */
    presetStance: EmotionalStance;
    /** True when an operator override is currently pinned over the preset. */
    overridden: boolean;
    toneRegister?: string;
}

export async function getSagaStanceSnapshot(): Promise<StanceSnapshot> {
    const { stance, presetStance, toneRegister } = await getEffectiveStance();
    return {
        stance,
        presetStance,
        overridden: Boolean(getStanceOverride()?.emotionalStance),
        toneRegister,
    };
}

export interface SetStanceInput {
    /** null clears the override → back to the preset baseline. */
    stance: EmotionalStance | null;
    toneRegister?: string;
}

export async function setSagaStanceAction(
    input: SetStanceInput,
): Promise<{ ok: boolean; snapshot?: StanceSnapshot; error?: string }> {
    try {
        if (input.stance === null) {
            setStanceOverride(null);
        } else {
            setStanceOverride({
                emotionalStance: input.stance,
                toneRegister: input.toneRegister?.trim() || undefined,
                updatedAtMs: Date.now(),
            });
        }
        resetNarrativeProfileCache();
        return { ok: true, snapshot: await getSagaStanceSnapshot() };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
