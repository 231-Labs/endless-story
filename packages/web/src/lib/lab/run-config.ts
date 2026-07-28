/**
 * 開卷設定的收斂 — the single place a request body becomes a `LabRunConfig`.
 *
 * This exists because of a real, silent failure. `LabRunConfig` grew `deckId`,
 * `deckSource` and `trackedCharacterNames`; the manager read them; the engine
 * did everything with them. But the create-run route normalised the body field
 * by field and simply did not mention them, so every run opened from the web
 * came up with NO event deck — no cards, no 月半結帳, no director, no 世情動作 —
 * while the whole feature typechecked, tested green, and worked from the CLI.
 *
 * A field-by-field normaliser is exactly the shape that fails this way: adding a
 * config field is one edit, wiring it through is another, and nothing connects
 * them. Pulling it out here doesn't make that impossible, but it puts the whole
 * surface in one readable function with one test that walks every field — so the
 * next addition is caught by a test rather than by a puzzled run three days in.
 */

import type { LabRunConfig } from './types';

/** What a client may send. Every field optional; this function supplies the law. */
export type LabRunConfigInput = Partial<LabRunConfig> & { presetId?: string };

const DEFAULT_TICKS_PER_DAY = 6;
const MIN_TICKS_PER_DAY = 2;
const MAX_TICKS_PER_DAY = 12;

/** Split a 「甲、乙 丙」 free-text list into trimmed names. */
function parseNameList(raw: unknown): string[] | undefined {
    const parts = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? raw.split(/[,，、\s]+/)
          : undefined;
    if (!parts) return undefined;
    const names = parts.map((name) => String(name).trim()).filter(Boolean);
    return names.length ? names : undefined;
}

/**
 * Normalise an untrusted body into a run config. Throws when the one genuinely
 * required field is missing; everything else falls back to the behaviour a run
 * had before that field existed, so an old client keeps working byte-for-byte.
 */
export function normalizeRunConfig(input: LabRunConfigInput | undefined): LabRunConfig {
    if (!input?.presetId) throw new Error('config.presetId is required');
    const ticks = Number(input.ticksPerDay);
    return {
        presetId: input.presetId,
        seedSource: input.seedSource === 'custom' ? 'custom' : 'builtin',
        seasonId: input.seasonId || undefined,
        seasonSource: input.seasonSource === 'custom' ? 'custom' : 'builtin',
        // 外力層 —— absent means genuinely OFF (no cards, no deadline, no director,
        // no 世情動作), which is a legitimate and deliberate way to run a scroll.
        // It must be a choice the caller makes, never a default it drifts into.
        deckId: input.deckId || undefined,
        deckSource: input.deckSource === 'custom' ? 'custom' : 'builtin',
        // 追蹤開關 —— names, resolved against the cast when the world is built.
        // Empty ⇒ the whole cast is tracked, as before the switch existed.
        trackedCharacterNames: parseNameList(input.trackedCharacterNames),
        llm: input.llm === 'real' ? 'real' : 'fake',
        relationshipFallback: input.relationshipFallback !== false,
        emergentProduction: input.emergentProduction === true,
        heartsCanFade: input.heartsCanFade === true,
        beatPicksWant: input.beatPicksWant === true,
        quietPresence: input.quietPresence === true,
        ticksPerDay: Number.isInteger(ticks) && ticks > 0
            ? Math.max(MIN_TICKS_PER_DAY, Math.min(MAX_TICKS_PER_DAY, ticks))
            : DEFAULT_TICKS_PER_DAY,
        realEmbeddings: input.realEmbeddings === true,
    };
}
