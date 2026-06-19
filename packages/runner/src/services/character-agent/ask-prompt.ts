/**
 * Character Agent — ASK prompt builders + finalizer (PURE; zero workspace-runtime deps).
 *
 * The "pull" side of money (the 4th money operation): a character in need decides whether to
 * lower itself to ASK someone for help — whom, how much, and in what form (a loan it will repay,
 * an open plea, or asking a patron for ongoing support). Asking costs FACE, so a proud character
 * may choose to starve rather than ask, and nobody asks a rival. The granting side is just the
 * AID decision (decideAid) with the asker surfaced as a needy peer.
 *
 * The deterministic layer (finalizeAsk) only enforces hard shape: a target that is a real,
 * non-self candidate and a positive amount. Whether/whom/how-much is the model's judgment.
 */

export type AskKind = 'loan' | 'plea' | 'patronage';
export type AskVitality = 'healthy' | 'strained' | 'failing';
export type AskRelation =
    | 'lover' | 'ambiguous' | 'friend' | 'mentor' | 'protege'
    | 'patron' | 'family' | 'ally' | 'neutral' | 'rival';

const RELATION_LABEL: Record<AskRelation, string> = {
    lover: '戀人', ambiguous: '曖昧對象', friend: '朋友', mentor: '恩師', protege: '門生後輩',
    patron: '恩主', family: '親人', ally: '盟友', neutral: '泛泛之交', rival: '有過節',
};

const KIND_LABEL: Record<AskKind, string> = { loan: '求借（會還）', plea: '求濟（贈與）', patronage: '求恩主長期接濟' };

/** Someone the character could turn to. */
export interface AskCandidate {
    id: string;
    name: string;
    role: string;
    relation: AskRelation;
    personality: string;
    /** how well-off they visibly are, e.g. '家底厚實' / '尚可' / '自身難保'. */
    standing: string;
    recentMemory?: string;
}

export interface AskActionInput {
    name: string;
    role: string;
    persona: string;
    traits: string[];
    funds: number;
    dailyCost: number;
    runwayDays: number;
    vitalityState: AskVitality;
    /** what the character is short of / why it might ask. */
    plight: string;
    candidates: AskCandidate[];
}

export interface AskActionResult {
    doAsk: boolean;
    targetId?: string;
    targetName?: string;
    amount?: number;
    kind?: AskKind;
    /** What you actually SAY when you open your mouth — the face-saving line you
     *  reach for, in character, ≤28字. Not the bare request; the pretext (名頭). */
    line?: string;
    reason?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是戲園裡一個手頭拮据的角色。此刻你在掙扎：要不要拉下臉，向身邊某個人開口求助。',
        '開口是要付代價的——欠人情、傷自尊。但餓著、病著、斷了炊，也是真的。',
        '',
        '你要權衡：',
        '- 你是真的撐不下去了，還是還能再忍忍、自己想辦法；',
        '- 找誰開口：對方拿得出來嗎（家底）、你和他的交情夠不夠你張這個口；',
        '- 開口的方式：求借（日後要還）、求濟（白受贈與）、或求一個恩主長期接濟；',
        '- 你的脾性：高傲的人寧可硬撐也不肯求人；念舊的人會找恩主或舊交。',
        '',
        '**鐵則**：',
        '1. 不到難處不必開口；還撐得住就別輕易求人。',
        '2. 不向仇家伸手。',
        '3. 只求你真正需要的數，別獅子大開口。',
        '4. 你可以選擇誰都不求、自己扛——尤其當你拉不下這個臉。',
        '5. 開口時你會找個體面的名頭，不會直說「我可憐」「我快餓死」。`line` 就是你',
        '   當著對方面說出口的那一句（戲裡人的口吻、有名頭），`reason` 才是你心裡的真話。',
        '',
        '**輸出**：嚴格只輸出 JSON。例如',
        '`{"doAsk":true,"targetId":"0x…","amount":15,"kind":"loan","line":"師兄，這月戲份還沒結，先週轉我十五兩，散戲就還。","reason":"藥錢湊不齊，挑有交情的師兄借，名頭體面些。"}`',
        '或 `{"doAsk":false,"reason":"還能再撐兩日，這個臉拉不下來。"}`。',
        'kind ∈ loan｜plea｜patronage。line ≤28 字（doAsk 時必給）；reason ≤60 字。不要 markdown。',
    ].join('\n');
}

export function buildUserPrompt(input: AskActionInput, roleVoice: string): string {
    const cands = input.candidates.length > 0
        ? input.candidates
              .map((p) => {
                  const rel = RELATION_LABEL[p.relation];
                  const mem = p.recentMemory ? `\n    （你記得：${p.recentMemory}）` : '';
                  return `- id=${p.id} 「${p.name}」（${p.role}；${rel}；其人${p.personality}）：${p.standing}${mem}`;
              })
              .join('\n')
        : '（此刻身邊無人可求）';
    return [
        '# 你是誰',
        `- 姓名：${input.name}`,
        `- 行當：${input.role}`,
        `- 行當聲口：${roleVoice}`,
        `- 本性：${input.persona}`,
        `- 脾性：${input.traits.join('、')}`,
        '',
        '## 你的窘況',
        `- 現銀：${input.funds} ENDLESS／每日開銷：${input.dailyCost}／約還能撐：${input.runwayDays >= 999 ? '無虞' : `${input.runwayDays} 日`}`,
        `- 氣血：${input.vitalityState === 'healthy' ? '尚穩' : input.vitalityState === 'strained' ? '見疲態' : '瀕危'}`,
        `- 難處：${input.plight}`,
        '',
        '## 你可以開口的人',
        cands,
        '',
        '請判斷：要不要開口、向誰、求多少、用什麼方式（JSON）。只輸出 JSON。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

/** Raw parsed shape (parseAsk output). */
export interface RawAsk {
    doAsk: boolean;
    targetId?: string;
    amount?: number;
    kind?: AskKind;
    line?: string;
    reason?: string;
}

/** Hard shape guard (NOT the judgment): target must be a real, non-self candidate; amount > 0. */
export function finalizeAsk(parsed: RawAsk | null, input: AskActionInput): AskActionResult {
    if (!parsed || !parsed.doAsk) return { doAsk: false, reason: parsed?.reason ?? '這個口，終究沒張開' };
    const target = parsed.targetId ? input.candidates.find((c) => c.id === parsed.targetId) : undefined;
    if (!target) return { doAsk: false, reason: '想求的人不在眼前' };
    const amount = Number.isFinite(Number(parsed.amount)) ? Math.max(0, Math.floor(Number(parsed.amount))) : 0;
    if (amount <= 0) return { doAsk: false, reason: '張不出具體的數' };
    return {
        doAsk: true,
        targetId: target.id,
        targetName: target.name,
        amount,
        kind: parsed.kind ?? 'plea',
        line: parsed.line,
        reason: parsed.reason,
    };
}

export function askKindLabel(kind: AskKind): string {
    return KIND_LABEL[kind];
}
