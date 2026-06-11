/**
 * Event framing core — pure sanitizer for an LLM-authored incident line (no
 * LLM, no I/O). Split from `event-framing.ts` so it's unit-testable under
 * `node --test` without dragging in the `@endless-story/llm` import graph.
 */

/** Hard cap on a framing line; longer = model rambled → reject to fallback. */
const MAX_LEN = 40;
const MIN_LEN = 4;

/**
 * Clean an LLM framing line to a single bare clause; return `fallback` when the
 * output is unusable (empty, too short/long, multi-line junk). Strips wrapping
 * quotes and a trailing sentence punctuation so the line reads like the
 * hand-authored built-ins. Pure — unit-tested (`event-framing.test.ts`).
 */
export function sanitizeFraming(raw: string | undefined, fallback: string): string {
    const firstLine =
        (raw ?? '')
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.length > 0) ?? '';
    const stripped = firstLine
        .replace(/^["'「『（(]+/, '')
        .replace(/["'」』）)]+$/, '')
        .replace(/[。．.!！?？、，,]+$/, '')
        .trim();
    if (stripped.length < MIN_LEN || stripped.length > MAX_LEN) return fallback;
    return stripped;
}
