/**
 * Storyteller chapter — the FOLD step (I/O: one cheap LLM call).
 *
 * After a chapter is woven, derive how the story bible should advance (啟後):
 * which threads moved, what's newly opened or resolved, where each character now
 * stands, what hooks dangle for next. The pure `applyChapter` merges it; this is
 * the step that READS the prose to produce that update.
 *
 * Defensive by construction: a parse / LLM failure falls back to a minimal,
 * always-valid update (advance the synopsis + record the summary) so the
 * continuity loop never breaks — exactly like the rest of the pipeline degrades
 * to "stay/idle" rather than throw.
 */

import { text as llmText } from '@endless-story/llm';
import type { StoryBible, ChapterContinuityUpdate } from './story-bible.js';
import { threadSlug } from './story-bible.js';
import { briefSummary } from './compose.js';

export interface DeriveUpdateInput {
    chapter: string;
    day: number;
    bible: StoryBible;
    /** Cast present in this chapter — name → characterId, for arc/thread mapping. */
    nameToId: Map<string, string>;
    model?: string;
}

/** The raw JSON shape we ask the cheap model for (names/titles, no ids). */
interface FoldJson {
    summary?: string;
    synopsisAppend?: string;
    advancedThreads?: Array<{ title?: string; state?: string; cast?: string[] }>;
    newThreads?: Array<{ title?: string; state?: string; cast?: string[] }>;
    resolvedThreadTitles?: string[];
    arcUpdates?: Array<{ name?: string; state?: string }>;
    hooks?: string[];
}

function stripFence(s: string): string {
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    return (m ? m[1] : s).trim();
}

/** Best-effort JSON parse: whole string, then the first {...} block. */
function parseLoose(raw: string): FoldJson | null {
    const body = stripFence(raw);
    try {
        return JSON.parse(body) as FoldJson;
    } catch {
        const start = body.indexOf('{');
        const end = body.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(body.slice(start, end + 1)) as FoldJson;
            } catch {
                return null;
            }
        }
        return null;
    }
}

/** The safe minimal update — always valid, never re-tells (no thread churn). */
function fallbackUpdate(chapter: string, day: number): ChapterContinuityUpdate {
    return { day, summary: briefSummary(chapter), synopsisAppend: briefSummary(chapter, 90) };
}

function buildFoldPrompt(input: DeriveUpdateInput): string {
    const openThreads = input.bible.threads
        .filter((t) => t.status !== 'resolved')
        .map((t) => `- ${t.title}：${t.state}`)
        .join('\n');
    const cast = [...input.nameToId.keys()].join('、');
    return [
        '你在維護一部連載小說的「故事總綱」。讀下面這一回，輸出這一回讓總綱如何往前推進。',
        '',
        '【目前未了的線】',
        openThreads || '（尚無）',
        '',
        `【這一回在場角色】${cast || '（未知）'}`,
        '',
        '【這一回正文】',
        input.chapter,
        '',
        '只輸出一個 JSON 物件（不要任何說明、不要 markdown fence），欄位：',
        '{',
        '  "summary": "這一回一句話摘要（≤30字）",',
        '  "synopsisAppend": "接在故事總綱後面的一句話（≤40字）",',
        '  "advancedThreads": [{"title":"沿用上面未了的線的標題","state":"它現在進展到哪（≤30字）","cast":["在場角色名"]}],',
        '  "newThreads": [{"title":"新開的線（≤8字）","state":"≤30字","cast":["角色名"]}],',
        '  "resolvedThreadTitles": ["這一回收束掉的線標題"],',
        '  "arcUpdates": [{"name":"角色名","state":"他此刻的處境/心境（≤20字）"}],',
        '  "hooks": ["留給下一回的懸念（≤20字）"]',
        '}',
        '沒有的欄位給空陣列。標題沿用既有未了的線時務必一字不差。',
    ].join('\n');
}

/**
 * Derive the bible update from a woven chapter. Never throws — degrades to the
 * minimal synopsis-advance update on any LLM / parse failure.
 */
export async function deriveChapterUpdate(input: DeriveUpdateInput): Promise<ChapterContinuityUpdate> {
    let raw: string;
    try {
        const llm = llmText.createTextClient({ kind: 'cheap' });
        const res = await llm.chat({
            model: input.model ?? llm.defaultModel,
            system: '你是嚴謹的故事連續性編輯，只輸出 JSON。',
            messages: [{ role: 'user', content: buildFoldPrompt(input) }],
            maxTokens: 700,
            temperature: 0.3,
        });
        raw = res.text;
    } catch {
        return fallbackUpdate(input.chapter, input.day);
    }

    const j = parseLoose(raw);
    if (!j) return fallbackUpdate(input.chapter, input.day);

    const mapCast = (names?: string[]): string[] =>
        (names ?? []).map((n) => input.nameToId.get(n)).filter((id): id is string => !!id);

    const titleById = new Map(input.bible.threads.map((t) => [t.title, t.id] as const));
    const resolvedThreadIds = (j.resolvedThreadTitles ?? [])
        .map((title) => titleById.get(title) ?? threadSlug(title))
        .filter(Boolean);

    const update: ChapterContinuityUpdate = {
        day: input.day,
        summary: (j.summary ?? '').trim() || briefSummary(input.chapter),
        synopsisAppend: (j.synopsisAppend ?? '').trim() || undefined,
        advancedThreads: (j.advancedThreads ?? [])
            .filter((t) => t.title && t.state)
            .map((t) => ({ title: t.title!.trim(), state: t.state!.trim(), castIds: mapCast(t.cast) })),
        newThreads: (j.newThreads ?? [])
            .filter((t) => t.title && t.state)
            .map((t) => ({ title: t.title!.trim(), state: t.state!.trim(), castIds: mapCast(t.cast) })),
        resolvedThreadIds: resolvedThreadIds.length ? resolvedThreadIds : undefined,
        arcUpdates: (j.arcUpdates ?? [])
            .filter((a) => a.name && a.state && input.nameToId.has(a.name))
            .map((a) => ({ characterId: input.nameToId.get(a.name!)!, name: a.name!.trim(), state: a.state!.trim() })),
        hooks: (j.hooks ?? []).map((h) => h.trim()).filter(Boolean),
    };
    return update;
}
