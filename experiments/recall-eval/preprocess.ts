// Write-time pre-processing strategies — the knob under test.
//
// Each strategy turns the source corpus into the records that would actually land in a
// character's MemWal namespace. They differ ONLY in (a) how many records a long chapter
// becomes and (b) what text gets embedded (`embedText`). The stored/displayed `text` is
// always the original prose, mirroring production (the SEAL blob keeps the full text;
// only the vector changes).
//
//   raw        — current behavior: 1 record per memory, embedText = full prose.
//   extractive — 1 record, embedText = first sentence of each paragraph (zero-cost,
//                deterministic; degrades when the point sits late in an unsegmented blob).
//   summary    — 1 record, embedText = an LLM retrieval-oriented summary of the prose.
//   chunk      — N records, one per segment; embedText = that segment. Long chapter is
//                split into single-topic memories at write time.

import {
    DEFAULT_IMPORTANCE,
    SOURCE_MEMORIES,
    type Kind,
    type SourceMemory,
} from './corpus.ts';

export type Strategy = 'raw' | 'extractive' | 'summary' | 'chunk';

export interface PreparedMemory {
    /** Unique per stored record (chunked memories get #0, #1, …). */
    id: string;
    sourceId: string;
    kind: Kind;
    day: number;
    importance: number;
    anchored: boolean;
    /** Original prose stored in the (SEAL) blob — what recall returns to the prompt. */
    text: string;
    /** What actually gets embedded for the relevance vector. */
    embedText: string;
    /** Facts carried by this record (ground-truth unit). */
    facts: string[];
}

function importanceOf(m: SourceMemory): number {
    return m.importance ?? DEFAULT_IMPORTANCE[m.kind];
}

function fullText(m: SourceMemory): string {
    return m.segments.map((s) => s.text).join('\n\n');
}

function allFacts(m: SourceMemory): string[] {
    return [...new Set(m.segments.flatMap((s) => s.facts))];
}

/** First sentence (。！？ boundary) of a paragraph, capped so it stays a "lead". */
function leadSentence(paragraph: string): string {
    const m = paragraph.match(/^[^。！？]*[。！？]/);
    const lead = m ? m[0] : paragraph;
    return lead.length > 40 ? lead.slice(0, 40) : lead;
}

/** Extractive summary: lead sentence of each paragraph, concatenated. Operates on the
 *  joined prose (not the segment metadata) so it reflects what production could compute
 *  from a stored chapter with paragraph breaks. */
function extractiveSummary(prose: string): string {
    const paras = prose
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const leads = paras.map(leadSentence);
    const joined = leads.join(' ');
    return joined.trim() || prose.slice(0, 60);
}

export type Summarizer = (prose: string, kind: Kind) => Promise<string>;

/** Build the namespace a strategy would produce. `summarize` is required only for
 *  the 'summary' strategy (injected by run.ts so it can cache LLM calls). */
export async function prepare(
    strategy: Strategy,
    summarize?: Summarizer,
    sources: SourceMemory[] = SOURCE_MEMORIES,
): Promise<PreparedMemory[]> {
    const out: PreparedMemory[] = [];
    for (const m of sources) {
        const importance = importanceOf(m);
        const base = {
            sourceId: m.id,
            kind: m.kind,
            day: m.day,
            importance,
            anchored: m.anchored ?? false,
        };
        if (strategy === 'chunk') {
            m.segments.forEach((seg, i) => {
                out.push({
                    ...base,
                    id: m.segments.length > 1 ? `${m.id}#${i}` : m.id,
                    text: seg.text,
                    embedText: seg.text,
                    facts: seg.facts,
                });
            });
            continue;
        }
        const prose = fullText(m);
        const facts = allFacts(m);
        let embedText = prose;
        if (strategy === 'extractive') embedText = extractiveSummary(prose);
        else if (strategy === 'summary') {
            if (!summarize) throw new Error("strategy 'summary' needs a summarizer");
            embedText = await summarize(prose, m.kind);
        }
        out.push({ ...base, id: m.id, text: prose, embedText, facts });
    }
    return out;
}

export const STRATEGIES: Strategy[] = ['raw', 'extractive', 'summary', 'chunk'];
