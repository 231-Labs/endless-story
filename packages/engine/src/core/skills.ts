/**
 * Character-SKILL framework — the pure GATHER function every hang point calls.
 * ============================================================================
 * A `Skill` (world-state.ts) imparts a distinctive STYLE of conduct and output.
 * `kind` is a free-text DOMAIN tag (like a want `layer`); a HANG POINT declares
 * the kinds it cares about and calls `skillStyleHint` to fold the matching
 * skills into a compact prose hint it injects. The whole framework is three
 * parts: (1) `Skill[]` data on characters, (2) this gather fn, (3) hang points
 * that call it. A new skill is pure data; a new hang point is one gather call.
 *
 * INVARIANT: numbers never enter a prompt — only the prose `style` is emitted.
 * `level` is a display + tie-break signal here, never a gate.
 */

import type { Skill } from '../world-state.ts';

/** The conduct/bearing domains a scene BEAT colours — how a character speaks,
 *  carries themselves and treats people. The beat hang point gathers skills of
 *  these kinds so a 悲工 lead's beats carry a mournful 情-heavy voice and a
 *  辛辣 記者's cut. Free-text set — a skill may tag some other kind and simply
 *  not match here (it belongs to a different, later hang point). */
export const CONDUCT_KINDS = ['談', '風', '處世', '口'] as const;

/**
 * Gather the skills whose `kind` is in `kinds` (highest `level` first, cap 3),
 * formatted as a compact style hint: `〔技藝〕<name>·<style>；<name>·<style>`.
 * Pure and deterministic. Returns `undefined` when `skills` is undefined/empty
 * or nothing matches — so a skill-less character leaves the hang point exactly
 * as it was (full backward-compat).
 */
export function skillStyleHint(skills: Skill[] | undefined, kinds: string[]): string | undefined {
    if (!skills?.length) return undefined;
    const wanted = new Set(kinds);
    const matched = skills.filter((s) => wanted.has(s.kind));
    if (!matched.length) return undefined;
    // Stable sort by level desc (missing level = 0); authored order breaks ties.
    const ordered = matched
        .map((skill, index) => ({ skill, index }))
        .sort((a, b) => (b.skill.level ?? 0) - (a.skill.level ?? 0) || a.index - b.index)
        .slice(0, 3)
        .map(({ skill }) => `${skill.name}·${skill.style}`);
    return `〔技藝〕${ordered.join('；')}`;
}
