/**
 * Director resource proposal — pure validation rails for a runtime-instantiated
 * scarce resource (no chain, no LLM, no I/O).
 *
 * Phase 3 of EVENT_LIFECYCLE.md hands the LLM director authority to ADD scarcity
 * mid-story ("this arc should make them fight over X"). But the on-chain ledger
 * stays the source of truth: the director only *proposes*, and every proposal
 * passes the SAME rails the bootstrap preset would (capacity > 0, well-formed
 * label, no collision). The guiding principle: **the LLM owns meaning, never
 * conservation** — it may name a new scarce thing, but the contract still
 * re-checks every unit.
 *
 * The structural contract that keeps a director-created resource coherent with
 * the rest of the pipeline (selection / framing / spine settlement):
 *
 *   on-chain label   = `<kind>:<display>`           (e.g. `feud:春雪社班底`)
 *   contention id    = `contention:<kind>`          (selection + spine key)
 *   desire statement = `爭得「<kind>:<display>」`     (drama-core.desireStatementFor)
 *
 * Because the spine resolves a resource by `templateId.split(':')[1]` == the
 * label/​statement keyword (`<kind>`), a proposal whose `kind` is the label
 * prefix settles EXACTLY like the built-in spotlight/recording slots — no
 * registry, no special-casing. `event-planner.parseDirectorContention` recovers
 * `<kind>` from the desire statement so the templateId stays correct.
 *
 * Pure + unit-tested (`resource-proposal.test.ts`).
 */

/** Kinds owned by the bootstrap preset — the director may not shadow them. */
export const RESERVED_KINDS = ['spotlight', 'recording', 'partnership'] as const;

/** A `kind` is the structural slug: ascii, the label prefix AND templateId key. */
const KIND_RE = /^[a-z][a-z0-9-]{1,20}$/;
/** Display name length guard (the human half of the label). */
const MAX_DISPLAY = 24;

/** Raw, untrusted proposal as parsed from the director LLM. */
export interface RawProposal {
    kind?: unknown;
    display?: unknown;
    capacity?: unknown;
}

/** A validated, instantiate-ready proposal. */
export interface ValidProposal {
    /** structural slug — label prefix + templateId keyword. */
    kind: string;
    /** human resource name. */
    display: string;
    /** on-chain DramaResource label: `<kind>:<display>`. */
    label: string;
    /** archetype tag stored on chain (descriptive only). */
    archetype: string;
    /** capacity to instantiate (clamped to stay contested). */
    capacity: number;
    /** contention templateId selection + spine key on. */
    templateId: string;
}

export type ProposalCheck =
    | { ok: true; proposal: ValidProposal }
    | { ok: false; reason: string };

/**
 * Validate a raw director proposal against the same rails as the bootstrap
 * preset. Rejects (never throws) with a human reason on any violation:
 *   - `kind` must be a clean ascii slug, not a reserved built-in, not already
 *     in play (one kind == one contention axis);
 *   - `display` non-empty, bounded;
 *   - `capacity` an integer ≥ 1, clamped to `castSize - 1` so the slot stays
 *     contested (capacity ≥ cast means everyone fits → zero tension → pointless).
 *
 * @param existingLabels live DramaResource labels (for collision checks)
 * @param castSize number of characters who could contend (clamps capacity)
 */
export function validateResourceProposal(
    raw: RawProposal,
    existingLabels: ReadonlyArray<string>,
    castSize: number,
): ProposalCheck {
    const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
    if (!KIND_RE.test(kind)) return { ok: false, reason: `bad kind "${String(raw.kind)}"` };
    if ((RESERVED_KINDS as readonly string[]).includes(kind))
        return { ok: false, reason: `reserved kind "${kind}"` };

    const display = typeof raw.display === 'string' ? raw.display.trim().replace(/\s+/g, '') : '';
    if (display.length === 0 || display.length > MAX_DISPLAY)
        return { ok: false, reason: `bad display "${String(raw.display)}"` };

    const capacityNum = typeof raw.capacity === 'number' ? raw.capacity : Number(raw.capacity);
    if (!Number.isInteger(capacityNum) || capacityNum < 1)
        return { ok: false, reason: `capacity must be int ≥1 (got ${String(raw.capacity)})` };
    const maxCap = Math.max(1, castSize - 1);
    const capacity = Math.min(capacityNum, maxCap);

    const label = `${kind}:${display}`;
    if (existingLabels.includes(label)) return { ok: false, reason: `duplicate label "${label}"` };
    if (existingLabels.some((l) => l.split(':')[0] === kind))
        return { ok: false, reason: `kind "${kind}" already in play` };

    return {
        ok: true,
        proposal: {
            kind,
            display,
            label,
            archetype: capacity === 1 ? 'capacity-1-slot' : `capacity-${capacity}-slot`,
            capacity,
            templateId: `contention:${kind}`,
        },
    };
}

/** Count live resources whose kind-prefix is NOT a bootstrap built-in — i.e.
 *  how many the director has already created. Bounds runaway scarcity. */
export function countDirectorResources(existingLabels: ReadonlyArray<string>): number {
    const reserved = new Set<string>(RESERVED_KINDS);
    return existingLabels.filter((l) => !reserved.has(l.split(':')[0] ?? '')).length;
}
