/**
 * GENESIS MEMORIES — seed each character's "before the curtain" memory so the cast
 * starts tick 1 with a past, not a blank slate.
 *
 * WHY this exists. The drama-effect lab resets the in-memory NARRATIVE_STORE each
 * run (`__resetNarrativeMemory()`), so every character begins tick 1 with NOTHING
 * recalled — their 小傳 + 心底 secret live only in `profile.description` (which the
 * POV reads as static framing), never in MEMORY. So a POV could not RECALL「入班前
 * 的舊情」: the recall query `LIFE_QUERY`(童年 家世 初戀 舊情 心事 牽掛 秘密…) hit an
 * empty store and the 暗戀 had no 來歷. 柳生春/蘇映雪 in particular share a 相依舊情
 * the bios spell out, but it never reached the part of the engine that grows prose.
 *
 * WHAT it seeds (into the SAME store `rememberForCharacter` writes, so the tick's
 * recall picks it up with no extra wiring):
 *   1. SELF memory (no LLM) — one first-person「我是誰、我在意什麼」per character,
 *      condensed from their description + 心底 secret. kind='genesis'.
 *   2. CROSS old-flame (one LLM call, REAL-key only) — directed, asymmetric
 *      first-person memories of「入班前我對 B 的舊情/印象」, only for pairs the bios
 *      actually ground (above all 柳生春↔蘇映雪). Each lands on the FEELER.
 *      kind='relationship'. Skipped (returns 0) under the fake LLM — the pipeline
 *      still runs, the content is just absent.
 *
 * It is a HARNESS-ONLY seeder (experiments/), gated by the caller on
 * `ES_NARRATIVE=1` + a non-'none' settle. Nothing in production calls it.
 */

import { text as llmText } from '@endless-story/llm';
import { rememberForCharacter } from '@/lib/chain/memory';
import { hasTextProviderKey } from '../narrative-setup';

/** Minimal character shape the seeder needs — id (to address the memory), name,
 *  行當, and the bio (with the「（心底：…）」secret folded in by the preset). */
export interface GenesisCastMember {
    id: string;
    name: string;
    role?: string;
    /** 小傳 + folded 心底 secret (troupe-spring-snow already merges secret in). */
    description?: string;
}

export interface SeedGenesisResult {
    /** SELF「我是誰」memories written (one per character with a bio). */
    selfSeeded: number;
    /** CROSS old-flame directed memories written (0 without a provider key). */
    crossSeeded: number;
    /** How many directed old-flame ties the LLM proposed before validation. */
    crossProposed: number;
    /** Set when the cross step was skipped wholesale. */
    crossSkipReason?: 'no_provider_key' | 'memory_off' | 'too_few_cast' | 'no_ties';
    error?: string;
}

/* ── self memory (deterministic, no LLM) ─────────────────────────────────────── */

/**
 * Split a folded bio「<小傳>（心底：<secret>）」into its public + secret halves.
 * The preset (`troupe-spring-snow.toSpec`) appends「\n（心底：…）」; tolerate a few
 * punctuation variants so a hand-edited preset still parses.
 */
function splitBio(description: string): { bio: string; secret: string } {
    const m = description.match(/（心底[：:]\s*([\s\S]*?)）\s*$/);
    if (!m) return { bio: description.trim(), secret: '' };
    return {
        bio: description.slice(0, m.index).trim(),
        secret: (m[1] ?? '').trim(),
    };
}

/** First sentence-ish clause of a bio — the「我是誰」anchor. */
function leadClause(bio: string, max = 90): string {
    const first = bio.split(/[。！？\n]/).map((s) => s.trim()).find(Boolean) ?? bio.trim();
    return first.slice(0, max);
}

/**
 * Condense one character's description into a first-person genesis memory. No LLM:
 * the bio is already authored prose, so we recast its lead + secret into「我…」.
 * Returns '' for a character with no bio (nothing to seed).
 */
export function buildSelfMemory(member: GenesisCastMember): string {
    if (!member.description || !member.description.trim()) return '';
    const { bio, secret } = splitBio(member.description);
    const who = member.role ? `我是${member.name}，戲班裡工${member.role}。` : `我是${member.name}。`;
    const lead = leadClause(bio);
    const parts = [who, lead ? `${lead}。` : ''];
    if (secret) parts.push(`我心底有一處不輕易與人說：${secret}`);
    return parts.filter(Boolean).join('').replace(/。。/g, '。');
}

/* ── cross old-flame (one LLM call, real-key only) ───────────────────────────── */

interface OldFlameEdge {
    fromId: string;
    toId: string;
    fromName: string;
    toName: string;
    memory: string;
    importance: number;
}

function buildSystemPrompt(): string {
    return [
        '你是一個戲班 saga 的「前情編修」。下面是全班角色的 行當 + 小傳 + 心底。',
        '在故事正式開始（眾人入班、同台共事）之前，他們之中有些人本就**相識、有舊情或舊印象**。',
        '你的工作：只根據小傳/心底裡**已有的實質線索**，為這些人補一條**入班前**的第一人稱記憶 ——',
        '某人 A 在故事開始前，心裡如何記著另一個人 B。',
        '',
        '**判準鐵則**：',
        '  · 只在小傳/心底**真的暗示**兩人入班前有交集或牽掛時才連（舊識、師姐妹、舊情、',
        '    曾被某人照拂或虧欠、早把某人放在心上…）。沒有依據的**一律不要連**。寧缺勿濫。',
        '  · **有向、不對稱**：A→B 與 B→A 可以、也常常不同，各寫各的。單戀、一頭熱、各藏各的',
        '    心事，正是要寫出來的。別把兩邊寫成同一句的鏡像。',
        '  · 這是**入班前**的舊事與舊情，不是此刻同台的反應。寫「我記得當年…」「早before…」那種',
        '    沉在心底、未必說破的東西。',
        '  · 每條 memory 是 A 的第一人稱內心，約 30–70 字，句中**至少點一次 B 的姓名**，',
        '    並要能被「舊情/心事/牽掛/初識」這類念頭勾起（這條會被當作 A 的私密往事召回）。',
        '',
        '**特別留意 柳生春 與 蘇映雪**：小傳已寫明兩人相依甚深 —— 蘇映雪是柳生春的師姐，',
        '把她當自己的小郎君，捨不得她的好分給別的花旦、怕她紅到誰都能借她一場情；柳生春黏師姐，',
        '最怕有一天蘇映雪也只看見台上的她。若依據充足，**務必**為這兩人各寫一條入班前的舊情',
        '（蘇映雪→柳生春、柳生春→蘇映雪），把那份「都記著對方、卻都以為只有自己記著」的幽微寫進去。',
        '',
        '**輸出格式**：嚴格只輸出一個 JSON 物件，不要 markdown、不要前言：',
        '`{"memories":[{"from":"姓名","to":"姓名","memory":"…","importance":8}]}`',
        'from / to 只能用下方名單裡的**姓名**（原樣，別用 id、別改寫）；最多 10 條；',
        '沒有任何有依據的舊情就 `{"memories":[]}`。importance 取 6–9（越深的牽掛越高）。',
    ].join('\n');
}

function buildUserPrompt(cast: GenesisCastMember[]): string {
    const names = cast.map((c) => `- ${c.name}`).join('\n');
    const dossiers = cast
        .map((c) => {
            const { bio, secret } = splitBio(c.description ?? '');
            return [
                `### ${c.name}${c.role ? `（${c.role}）` : ''}`,
                bio || '（無小傳）',
                secret ? `心底：${secret}` : '',
            ]
                .filter(Boolean)
                .join('\n');
        })
        .join('\n\n');
    return [
        '## 全班名單（from/to 只能用這些姓名）',
        names,
        '',
        '## 各人 小傳 + 心底（判斷舊情的唯一依據）',
        dossiers,
        '',
        '## 本次要求',
        '只憑上面的小傳/心底，補出**入班前**有依據的有向舊情/舊印象，第一人稱。',
        '有向不對稱；寧缺勿濫；尤其別漏了 柳生春↔蘇映雪；只輸出 JSON 物件。',
    ].join('\n');
}

/** Parse `{memories:[{from,to,memory,importance}]}`; map names→ids; drop hallucinations.
 *  Mirrors relationship-evolve.parseEdges (last balanced block, name→id, dedupe). */
function parseOldFlames(raw: string, byName: Map<string, GenesisCastMember>): OldFlameEdge[] {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks || blocks.length === 0) return [];
    let parsed: { memories?: unknown } | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            parsed = JSON.parse(blocks[i]) as { memories?: unknown };
            if (Array.isArray(parsed.memories)) break;
        } catch {
            /* try an earlier block */
        }
    }
    if (!parsed || !Array.isArray(parsed.memories)) return [];

    const out: OldFlameEdge[] = [];
    const seen = new Set<string>();
    for (const item of parsed.memories) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const fromName = typeof obj.from === 'string' ? obj.from.trim() : '';
        const toName = typeof obj.to === 'string' ? obj.to.trim() : '';
        if (!fromName || !toName || fromName === toName) continue;
        const fromC = byName.get(fromName);
        const toC = byName.get(toName);
        if (!fromC || !toC) continue; // reject hallucinated names
        const dirKey = `${fromC.id}->${toC.id}`;
        if (seen.has(dirKey)) continue;
        const memory = typeof obj.memory === 'string' ? obj.memory.trim() : '';
        if (!memory) continue;
        const impRaw = typeof obj.importance === 'number' ? obj.importance : 8;
        const importance = Math.min(9, Math.max(6, Math.round(impRaw)));
        seen.add(dirKey);
        out.push({
            fromId: fromC.id,
            toId: toC.id,
            fromName: fromC.name,
            toName: toC.name,
            memory,
            importance,
        });
    }
    return out;
}

/** Test-only re-export of the JSON parser (offline harness probe). Not used by the run. */
export const __test_parseOldFlames = parseOldFlames;

/* ── public entry ────────────────────────────────────────────────────────────── */

/**
 * Seed genesis memories for one run's cast. Call AFTER `__resetNarrativeMemory()`
 * and BEFORE the first tick. The caller gates on ES_NARRATIVE=1 + settle!=='none';
 * this fn additionally no-ops the CROSS step without a provider key.
 *
 * Returns counts (so the harness can log「tick 0 前 store 非空」). Never throws — a
 * seeding failure must not abort the experiment.
 */
export async function seedGenesisMemories(cast: GenesisCastMember[]): Promise<SeedGenesisResult> {
    const result: SeedGenesisResult = { selfSeeded: 0, crossSeeded: 0, crossProposed: 0 };

    // 1) SELF — deterministic, always (even under the fake LLM the store ends non-empty).
    for (const c of cast) {
        const text = buildSelfMemory(c);
        if (!text) continue;
        const ok = await rememberForCharacter(c.id, text, {
            kind: 'genesis',
            importance: 8, // above the genesis default (7) — a founding self-fact.
        }).catch(() => false);
        if (ok) result.selfSeeded += 1;
    }

    // 2) CROSS old-flame — needs the real LLM (the fake client can't infer ties) and
    //    the in-memory store active. That store is driven by ES_NARRATIVE, NOT by
    //    MemWal/SEAL — isMemoryConfigured() checks THOSE and is FALSE here, which was
    //    silently skipping every cross seed. Gate on the same store the SELF seed above
    //    already wrote to (8/8), plus a provider key for the inference.
    if (!hasTextProviderKey()) {
        result.crossSkipReason = 'no_provider_key';
        return result;
    }
    if (process.env.ES_NARRATIVE !== '1') {
        result.crossSkipReason = 'memory_off';
        return result;
    }
    const named = cast.filter((c) => c.description && c.description.trim());
    if (named.length < 2) {
        result.crossSkipReason = 'too_few_cast';
        return result;
    }

    const byName = new Map(named.map((c) => [c.name, c]));
    let edges: OldFlameEdge[];
    try {
        const llm = llmText.createTextClient({ kind: 'primary' });
        const response = await llm.chat({
            model: llm.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(named) }],
            maxTokens: 2600,
            temperature: 0.85,
        });
        edges = parseOldFlames(response.text, byName);
        if (process.env.ES_REL_DEBUG === '1') {
            console.log(
                `  [genesis dbg] ${named.length} dossiers → resp ${response.text.length}ch → ${edges.length} old-flame(s)` +
                    ` | head: ${response.text.slice(0, 240).replace(/\s+/g, ' ').trim()}`,
            );
        }
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
        return result;
    }

    result.crossProposed = edges.length;
    if (edges.length === 0) {
        result.crossSkipReason = 'no_ties';
        return result;
    }

    for (const e of edges) {
        // First person, addressed at B, prefixed so a LIFE_QUERY recall surfaces it as
        // the feeler's own old story. Lands on the FEELER only (A→B is A's private past).
        const text = `入班前，關於「${e.toName}」：${e.memory}`;
        const ok = await rememberForCharacter(e.fromId, text, {
            kind: 'relationship',
            importance: e.importance,
        }).catch(() => false);
        if (ok) result.crossSeeded += 1;
    }
    return result;
}
