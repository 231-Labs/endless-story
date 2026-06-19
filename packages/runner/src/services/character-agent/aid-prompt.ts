/**
 * Character Agent — AID prompt builders + result finalizer (PURE; zero workspace-runtime deps).
 *
 * Split out of aid.ts so the EXACT prompt a character reasons over can be rendered offline
 * (the eval harness imports this directly; aid.ts adds the LLM client + shared.roleHint on top).
 * The role-voice line is injected (production passes `roleHint(role)`), so this file imports
 * nothing that needs a bundler — it runs under plain `node` for prompt inspection.
 *
 * The structure encodes the owner's call: the give/no-give JUDGMENT is the model's. We hand it
 * the giver's PERSONALITY + purse, and each peer's RELATIONSHIP, own personality, plight (real
 * need vs want vs a loan-ask vs a bribe-offer) and whether their pride makes open charity
 * wounding — then ask it to weigh all of that. The deterministic layer (finalizeAid) only
 * enforces hard safety: a recipient must be a real on-screen peer, and the running total can
 * never exceed the giver's funds (no overdraft — matching applyTransfer / the on-chain transfer).
 *
 * Self-contained on purpose (no imports): the eval harness loads it under plain `node` to render
 * the exact prompt and replay the guards offline.
 */

export type AidMemo = 'gift' | 'patronage' | 'loan' | 'repay' | 'bribe' | 'tribute';
export type AidVitality = 'healthy' | 'strained' | 'failing';
export type AidManner = 'direct' | 'disguised' | 'via-proxy' | 'as-loan' | 'as-repay';

/** How the giver sees this person. Drives both whether and HOW money flows. */
export type AidRelation =
    | 'lover' | 'ambiguous' | 'friend' | 'mentor' | 'protege'
    | 'recruit-target' | 'patron' | 'family' | 'ally' | 'neutral' | 'rival';

/** The peer's visible predicament — separates true need from mere want / transaction. */
export type AidSituation =
    | 'dire-need' | 'tight' | 'stable' | 'loan-request' | 'wants-luxury' | 'bribe-offer';

export const RELATION_LABEL: Record<AidRelation, string> = {
    lover: '戀人', ambiguous: '曖昧對象', friend: '朋友', mentor: '恩師', protege: '門生後輩',
    'recruit-target': '想拉攏的人', patron: '恩主', family: '親人', ally: '盟友', neutral: '泛泛之交', rival: '有過節',
};

export const SITUATION_LABEL: Record<AidSituation, string> = {
    'dire-need': '命懸一線／將要斷炊', tight: '手頭拮据', stable: '銀錢無虞',
    'loan-request': '開口求借', 'wants-luxury': '想要（非急需）', 'bribe-offer': '暗示好處交換',
};

const MEMO_LABEL: Record<AidMemo, string> = {
    gift: '餽贈', patronage: '長期接濟／包養', loan: '借貸', repay: '還情', bribe: '打點賄賂', tribute: '報恩進貢',
};

export interface AidPeer {
    id: string;
    name: string;
    role: string;
    relation: AidRelation;
    /** the peer's own character, in-world (so the giver reasons about a *person*, not a slot). */
    personality: string;
    situation: AidSituation;
    /** what's visibly going on / what they ask. */
    distress: string;
    runwayDays?: number;
    /** a specific sum they asked for, if any. */
    askAmount?: number;
    /** pride: open charity would wound them → the giver may need to give indirectly. */
    faceSensitive?: boolean;
    recentMemory?: string;
}

export interface AidActionInput {
    name: string;
    role: string;
    /** the giver's own character description. */
    persona: string;
    /** giver traits, e.g. ['重情','守義','謹慎'] or ['勢利','精算']. */
    traits: string[];
    funds: number;
    dailyCost: number;
    runwayDays: number;
    vitalityState: AidVitality;
    planHint?: string;
    peers: AidPeer[];
}

export interface AidGift {
    recipientId: string;
    recipientName?: string;
    amount: number;
    memo: AidMemo;
    manner?: AidManner;
    /** What you SAY as you hand it over — the 名頭 that saves their face, in
     *  character, ≤28字 (e.g. 「這是預支你的戲份錢」). The reason is your real motive. */
    line?: string;
    reason?: string;
}

export interface AidActionResult {
    /** zero or more transfers the giver decided on (empty = gave nothing). */
    gifts: AidGift[];
    /** overall reasoning, incl. why someone was refused. */
    reason?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是戲園裡一個真實持有銀錢的角色。此刻你在盤算：要不要從自己的銀子裡，分一些給身邊的人——可能不只一個。',
        '這是你自己的銀子、你自己的判斷，而你的判斷會被「你是什麼樣的人」與「你和對方的交情」深深左右。',
        '',
        '對每一個人，你要權衡：',
        '- 他是真有急難（將斷炊、要病倒），還是只是想要、或想跟你做一筆交換；',
        '- 你與他的關係（戀人／曖昧／朋友／恩師／門生／想拉攏的人／恩主／親人／盟友／泛交／仇家），以及他是個什麼樣的人；',
        '- 他要不要面子——對清高、要強的人，當面施捨會傷他，你也許該託詞、託人代轉、或當作「還情」「借貸」；',
        '- 你自己撐不撐得住——把銀子給出去後，自己還能活幾日；',
        '- 你的脾性：你是重情、是勢利、是慷慨、是謹慎、是記恩、是圖報？這決定你把銀子投向「最有難的人」還是「對你最有用的人」。',
        '',
        '**鐵則**：',
        '1. 不要無緣無故散財。對方氣色與銀錢都穩、或只是想要時，可以不給。',
        '2. 不要把自己掏空。先顧自己活得下去；自己也快撐不住時更要守住銀子。',
        '3. 你可以幫好幾個人、只幫一個、也可以一個都不幫；各人給多少、用什麼名目與方式，分寸由你定。',
        '4. 名目 memo：gift 餽贈／patronage 長期接濟／loan 借貸／repay 還情／bribe 打點賄賂／tribute 報恩進貢。',
        '5. 方式 manner：direct 當面直給／disguised 託詞掩飾（顧對方顏面）／via-proxy 託人代轉／as-loan 當作借／as-repay 當作還情。',
        '6. 每筆金額以 ENDLESS 計；所有給出去的總和必須 ≤ 你現有的銀錢。',
        '7. 每一筆都要有 `line`：你遞錢時當著對方的面說的那一句場面話（找個體面的名頭，',
        '   別直說「我可憐你」「我接濟你」）。`line` 是說出口的，`reason` 才是你心裡的真話。',
        '',
        '**輸出**：嚴格只輸出 JSON。例如',
        '`{"gifts":[{"recipientId":"0x…","amount":18,"memo":"tribute","manner":"via-proxy","line":"先生這齣的彩頭，我替戲園先墊上。","reason":"恩師清高，託人代付藥錢保他體面。"},{"recipientId":"0x…","amount":12,"memo":"gift","manner":"disguised","line":"順道抓的藥，多的一份給你。","reason":"她要強，只說是順手抓的。"}],"reason":"先救命懸與恩情，賄賂與閒財一概不給，留底自保。"}`',
        '或 `{"gifts":[],"reason":"眾人氣色都還穩，此刻散財無謂。"}`。line ≤28 字（每筆必給）；reason ≤60 字。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: AidActionInput, roleVoice: string): string {
    const peers = input.peers.length > 0
        ? input.peers
              .map((p) => {
                  const rel = RELATION_LABEL[p.relation];
                  const sit = SITUATION_LABEL[p.situation];
                  const runway = p.runwayDays != null ? `，約還能撐 ${p.runwayDays} 日` : '';
                  const ask = p.askAmount != null ? `；開口想要 ${p.askAmount} ENDLESS` : '';
                  const face = p.faceSensitive ? '；（要面子：當面施捨會傷他自尊）' : '';
                  const mem = p.recentMemory ? `\n    （你記得：${p.recentMemory}）` : '';
                  return `- id=${p.id} 「${p.name}」（${p.role}；${rel}；其人${p.personality}）：${sit}，${p.distress}${runway}${ask}${face}${mem}`;
              })
              .join('\n')
        : '（此刻身邊無人可接濟）';
    const planBlock = input.planHint ? `\n## 你此刻的打算\n${input.planHint}` : '';
    return [
        '# 你是誰',
        `- 姓名：${input.name}`,
        `- 行當：${input.role}`,
        `- 行當聲口：${roleVoice}`,
        `- 本性：${input.persona}`,
        `- 脾性：${input.traits.join('、')}`,
        '',
        '## 你的家底',
        `- 現銀：${input.funds} ENDLESS`,
        `- 每日開銷：${input.dailyCost} ENDLESS`,
        `- 自己約還能撐：${input.runwayDays >= 999 ? '無虞（入大於出）' : `${input.runwayDays} 日`}`,
        `- 氣血：${input.vitalityState === 'healthy' ? '尚穩' : input.vitalityState === 'strained' ? '見疲態' : '瀕危'}`,
        planBlock,
        '',
        '## 身邊的人',
        peers,
        '',
        '請逐一判斷：要不要接濟、幫誰、各給多少、什麼名目（memo）、用什麼方式（manner）。只輸出 JSON。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

/** Clamp a proposed amount into [0, funds] — the hard no-overdraft safety, NOT a judgment.
 *  Floors to a whole ENDLESS; non-finite / negative → 0 (treated as no gift). */
export function clampAidAmount(amount: unknown, funds: number): number {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const capped = Math.min(Math.floor(n), Math.max(0, Math.floor(funds)));
    return capped > 0 ? capped : 0;
}

/** Raw, pre-guard gift shape (what parseAid yields per entry). */
export interface RawGift {
    recipientId?: string;
    amount?: number;
    memo: AidMemo;
    manner?: AidManner;
    line?: string;
    reason?: string;
}

/**
 * Apply the HARD guards to the model's proposal (NOT the judgment): keep only gifts to a real
 * on-screen peer (no self, no unknown id, no duplicate recipient), and clamp each amount to the
 * giver's REMAINING funds as we go (no overdraft — same rule as applyTransfer / the on-chain
 * transfer). Pure. Returns the surviving, executable decision.
 */
export function finalizeAid(
    parsed: { gifts: RawGift[]; reason?: string } | null,
    input: AidActionInput,
): AidActionResult {
    if (!parsed) return { gifts: [], reason: '一念之間，沒有成形' };
    const byId = new Map(input.peers.map((p) => [p.id, p]));
    const seen = new Set<string>();
    let remaining = Math.max(0, Math.floor(input.funds));
    const gifts: AidGift[] = [];
    for (const g of parsed.gifts) {
        if (!g.recipientId) continue;
        const peer = byId.get(g.recipientId);
        if (!peer) continue;                 // unknown / off-screen recipient
        if (seen.has(g.recipientId)) continue; // one gift per recipient per turn
        const amount = clampAidAmount(g.amount, remaining);
        if (amount <= 0) continue;
        seen.add(g.recipientId);
        remaining -= amount;
        gifts.push({ recipientId: peer.id, recipientName: peer.name, amount, memo: g.memo, manner: g.manner, line: g.line, reason: g.reason });
    }
    return { gifts, reason: parsed.reason };
}

/** Human-readable one-liner for a memo (UI / eval printout). */
export function memoLabel(memo: AidMemo): string {
    return MEMO_LABEL[memo];
}
