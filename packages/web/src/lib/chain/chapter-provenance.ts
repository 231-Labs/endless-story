/**
 * Chapter ↔ on-chain-event provenance, embedded in the anchored blob.
 *
 * A POV chapter is committed to Walrus as markdown. We prepend a machine-
 * readable, human-invisible header carrying which on-chain event the chapter
 * narrates (storylet tx digest, scene, day, cast). Because the header rides
 * inside the SAME immutable blob that `commitment::commit` anchors, the
 * chapter→event link is itself chain-verifiable — an article or a derived video
 * can prove "this event really happened on chain" and group every character's angle on the
 * same event. The header is stripped before the prose is rendered.
 */

import type { ChapterProvenance } from '@endless-story/shared';

const PROV_RE = /^<!--es:prov\s+(\{[\s\S]*?\})\s*-->\s*/;

/** Prepend the provenance header to chapter prose before it's anchored. */
export function embedProvenance(prose: string, prov: ChapterProvenance): string {
    return `<!--es:prov ${JSON.stringify(prov)}-->\n\n${prose}`;
}

/** Split a stored chapter blob into its provenance header (if any) + clean prose. */
export function parseProvenance(content: string): {
    provenance?: ChapterProvenance;
    body: string;
} {
    const m = content.match(PROV_RE);
    if (!m) return { body: content };
    try {
        const provenance = JSON.parse(m[1]) as ChapterProvenance;
        return { provenance, body: content.slice(m[0].length) };
    } catch {
        return { body: content };
    }
}
