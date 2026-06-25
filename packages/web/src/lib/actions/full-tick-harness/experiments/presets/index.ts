/**
 * Preset registry for the drama-effect lab. The CLI (`lab.ts <name>`) looks a preset up
 * here by its `name`. Add a new `ExperimentConfig` file in this folder and register it
 * below to make it runnable.
 */
import type { ExperimentConfig } from '../types';
import { affectionYearning } from './affection-yearning';
import { partnershipRivalry } from './partnership-rivalry';
import { warmSmall } from './warm-small';
import { bondVsContest } from './bond-vs-contest';

export const PRESETS: Record<string, ExperimentConfig> = {
    [affectionYearning.name]: affectionYearning,
    [partnershipRivalry.name]: partnershipRivalry,
    [warmSmall.name]: warmSmall,
    [bondVsContest.name]: bondVsContest,
};

/** Look up a preset by name (returns null if unknown). */
export function presetByName(name: string): ExperimentConfig | null {
    return PRESETS[name] ?? null;
}

/** Names of all registered presets (for the CLI usage hint). */
export function presetNames(): string[] {
    return Object.keys(PRESETS);
}
