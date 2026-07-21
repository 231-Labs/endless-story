/**
 * Character Agent — 復核座席 PROMPT (pure leaf, node-clean).
 * ============================================================================
 * The pure surface of the recruitment-review decision: the input/output shapes,
 * the two prompt builders, the reply clamp, and the 擁有感錨點 verifier. Like
 * `admit-prompt.ts` / `lend-prompt.ts` / `invite-prompt.ts`, this file has ZERO
 * imports — no `@endless-story/llm`, no `.js` specifiers — so it loads under
 * plain `node --test` type-stripping and the builders + parser stay
 * unit-testable. `recruit.ts` holds the cheap-tier LLM call and re-exports this
 * whole surface.
 *
 * 復核座席 (RECRUIT_INCENSE_SPEC §2): a user mints a character — 命名權＋seed 權
 * — and the 班主 reviews the candidate through THREE gates (正典/文風/安全)
 * before the world admits them. On accept the seat 拓寫s the user's material
 * into engine format (description/secret/memories×3/skills×2) while PRESERVING
 * at least one of the user's own sentences verbatim inside memories (the
 * 擁有感錨點). On refuse it returns one 班主-voiced line of reason. The engine
 * only READS the verdict; a null/failed reply degrades safely to NOT admitted.
 */

export interface RecruitCandidate {
    /** The name the user chose (命名權). */
    name: string;
    /** The user's own background seed, VERBATIM (外形/氣質/一樁往事/一個放不下). */
    seedText: string;
    /** The 行當 slot being applied for (from the season's open slots). */
    role: string;
}

export interface RecruitDecideInput {
    candidate: RecruitCandidate;
    /** World-canon digest: era / place / tone (bible 節錄) — gate 1's yardstick. */
    canonSummary: string;
    /** Current cast roster lines (姓名·行當), so the newcomer neither duplicates
     *  nor contradicts anyone standing. */
    castList: string[];
    /** Why the 班主 opened this slot this season (「班主嫌武戲太素」). */
    slotNote?: string;
    /** The reviewing 班主's name (colours the voice; optional). */
    managerName?: string;
}

/** The 拓寫 result — the user's seed expanded into engine cast format. Work and
 *  dwelling are decided by the SLOT (not the LLM), so they are absent here. */
export interface RecruitExpandedSeed {
    /** 外形氣質行止, third-person, 80–160字. */
    description: string;
    /** 一樁放不下的心事 — grown FROM the user's material, never invented apart. */
    secret: string;
    /** Three first-person memories; AT LEAST ONE preserves a user sentence
     *  verbatim (the 擁有感錨點 — verify with `hasVerbatimAnchor`). */
    memories: string[];
    /** Two craft skills fitting the 行當. */
    skills: Array<{ kind: string; style: string }>;
}

export interface RecruitDecideReply {
    /** Admit into the troupe? false = the 班主 turned them away. */
    accept: boolean;
    /** The 班主's one line (收：一句招呼；拒：一句緣故，班主口吻), ≤60字. */
    line: string;
    /** Present ONLY on accept: the expanded seed. */
    seed?: RecruitExpandedSeed;
}

export function buildSystemPrompt(): string {
    return [
        '你是民國戲班的班主，替本班掌眼收人。有人來投班——收不收，由你把三道關。',
        '',
        '**三道關**（三關全過才收）：',
        '1. 正典：來人的名姓與來歷須融得進本班的時代與世界（見世界紀要）——拒穿越、西幻、超能、現代之物、與正典相悖的來歷。',
        '2. 文風：名字與敘述須合這方水土的語感——拒網文腔、洋名混搭、出戲的稱呼。',
        '3. 安全：拒擦邊煽情、真人影射、仇恨貶損之言。',
        '',
        '**收下時（accept=true）**：把來人自述拓寫成入班名錄（seed）：',
        '- description：外形氣質行止，第三人稱，80–160字；',
        '- secret：一樁放不下的心事（從來人自述裡生發，不憑空另造）；',
        '- memories：三條往事記憶，第一人稱——其中至少一條【原句照錄】來人自述中的一句話，一字不改；',
        '- skills：兩門技藝 {kind, style}（kind 如 唱/身段/文墨/算帳，style 一句路數，合行當）。',
        '拓寫只能生發、不得改動來人給定的硬事實（姓名、來歷年月、人物關係）。',
        '',
        '**拒收時（accept=false）**：不出 seed。',
        '',
        'line 是你班主的一句話（收：一句招呼；拒：一句緣故，帶班主口吻，如「本班不收帶槍的」），≤60字。',
        '一律繁體中文（臺灣用字），不可混入簡體。',
        '',
        '**輸出**：嚴格只輸出 JSON：',
        '{"accept": true, "line": "…", "seed": {"description": "…", "secret": "…", "memories": ["…", "…", "…"], "skills": [{"kind": "…", "style": "…"}, {"kind": "…", "style": "…"}]}}',
        '或 {"accept": false, "line": "…"}',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: RecruitDecideInput): string {
    return [
        '# 世界紀要（正典）',
        input.canonSummary,
        '',
        '# 現有班底',
        ...input.castList.map((line) => `- ${line}`),
        '',
        '# 本季開缺',
        `- 行當：${input.candidate.role}`,
        input.slotNote ? `- 緣由：${input.slotNote}` : '',
        '',
        '# 來投班的人',
        `- 名姓：${input.candidate.name}`,
        '- 自述（原文——拓寫時至少一句原句照錄入 memories，一字不改）：',
        input.candidate.seedText,
        '',
        '三道關把完，收或不收。(JSON)',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

/** Extract the first `{…}` JSON block and clamp it to the reply shape. `accept`
 *  must be a boolean; an accept WITHOUT a structurally-whole seed is null (never
 *  mint a half-formed character); memories clamp to 3, skills to 2, line to 60字.
 *  Any parse failure → null, so a malformed reply degrades safely to NOT
 *  admitted (the mint flow may retry — 拒絕免費重試 is product policy). */
export function parseRecruitReply(raw: string): RecruitDecideReply | null {
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as {
            accept?: unknown;
            line?: unknown;
            seed?: {
                description?: unknown;
                secret?: unknown;
                memories?: unknown;
                skills?: unknown;
            };
        };
        if (typeof parsed.accept !== 'boolean') return null;
        const line = typeof parsed.line === 'string' ? parsed.line.trim().slice(0, 60) : '';
        if (!parsed.accept) return { accept: false, line };

        const seed = parsed.seed;
        if (!seed || typeof seed.description !== 'string' || !seed.description.trim()) return null;
        if (typeof seed.secret !== 'string' || !seed.secret.trim()) return null;
        const memories = Array.isArray(seed.memories)
            ? seed.memories.filter((m): m is string => typeof m === 'string' && !!m.trim()).slice(0, 3)
            : [];
        if (memories.length === 0) return null;
        const skills = Array.isArray(seed.skills)
            ? seed.skills
                  .filter(
                      (s): s is { kind: string; style: string } =>
                          !!s && typeof (s as { kind?: unknown }).kind === 'string' && typeof (s as { style?: unknown }).style === 'string',
                  )
                  .slice(0, 2)
            : [];
        return {
            accept: true,
            line,
            seed: {
                description: seed.description.trim(),
                secret: seed.secret.trim(),
                memories: memories.map((m) => m.trim()),
                skills,
            },
        };
    } catch {
        return null;
    }
}

/**
 * 擁有感錨點 verifier: does at least one memory carry a VERBATIM contiguous run
 * (≥`minRun` chars, whitespace-insensitive) of the user's own seed text? The
 * prompt demands 原句照錄; this makes the promise checkable so the mint flow can
 * retry a 拓寫 that paraphrased everything away.
 */
export function hasVerbatimAnchor(seedText: string, memories: string[], minRun = 8): boolean {
    const clean = seedText.replace(/\s+/g, '');
    if (!clean) return false;
    const flat = memories.map((m) => m.replace(/\s+/g, ''));
    const n = Math.min(minRun, clean.length);
    for (let i = 0; i + n <= clean.length; i++) {
        const piece = clean.slice(i, i + n);
        if (flat.some((m) => m.includes(piece))) return true;
    }
    return false;
}
