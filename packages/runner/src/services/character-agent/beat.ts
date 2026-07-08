/**
 * Character Agent — BEAT: one open action inside a scene's interaction loop
 * (§2.48). The character responds to the ongoing exchange, driven by their
 * hottest want under a forcing note that only ever removes stalling — it never
 * prescribes the act (§2.31/§2.43). Also the resolve judge: a want counts as
 * answered ONLY by the protagonist's own irreversible act (§2.31 anti-idling,
 * §2.33 participant gate).
 */

import { text as llmText } from '@endless-story/llm';

export type BeatForcing = 'idle' | 'pressing' | 'edge' | 'breaking';

export interface ActBeatInput {
    name: string;
    persona: string;
    /** Memory snippets — surface only when the moment calls (§2.45 暗號 echoes). */
    memories?: string[];
    /** Saga tone line (profile-sourced; e.g. warm base). */
    tone?: string;
    /** Clock label, e.g. 黃昏. */
    clock: string;
    sceneName: string;
    isPrivate: boolean;
    /** Co-present characters (empty = alone). `role` = 行當; `tie` = the actor's
     *  OWN canon feeling toward them (e.g. 你對TA：師承) so address forms come
     *  from the graph, not guesswork. Never carries the reverse edge — the
     *  other's inner state reaches an actor only through enacted behavior. */
    others: Array<{ name: string; role?: string; tie?: string }>;
    /** External pressure line (風聲), first beat only. */
    stake?: string;
    want: { desc: string; target?: string };
    forcing: BeatForcing;
    /** Private scene, exactly two present, and the want's target is the other one. */
    privateAlone: boolean;
    /** Last few beats of this scene's exchange. */
    sceneLog: string;
    /** Daily-life undertone line (state block), optional. */
    stateLine?: string;
    /** This character's own private inner-life secret; never another actor's.
     *  Colours the beat's subtext; hidden by default, but whether it ever
     *  surfaces is the character's own in-scene choice (§2.43: never script it). */
    innerSecret?: string;
    /** Canon honorifics facts (identity guardrail, e.g. 蘇映雪為師姐). */
    etiquette?: string;
    /** §2.47/§2.53: saga stance is consummate AND this beat is privateAlone on
     *  a love-layer want — unlocks the classical literary-erotic register and
     *  a longer beat. Anywhere else the beat is byte-identical to before. */
    consummate?: boolean;
}

/** §2.53-validated L3 register (the quality/stability sweet spot; L5-style
 *  "maximally explicit" wording regresses output and is deliberately absent). */
const CONSUMMATE_BEAT_NOTE = [
    '【此刻分寸（僅此私處、兩情相悅時）】容許寬衣解帶、肌膚相親、雲雨纏綿，並可細狀其實——',
    '身體的反應、氣息的亂、節奏的緩急、手與唇的門道、情動到極處的失守，皆可落筆，',
    '不必每到關頭就化開。以古典艷情話本筆法（敢於露骨、卻仍是綺麗）：艷而有情、露而不穢。',
    '忌現代醫學詞、忌髒字、忌器官說明書式冷描。',
].join('');

export interface BeatResult {
    /** Objective act/say, one line. */
    beat: string;
    /** Private thought, one line. */
    inner: string;
    /** Who this beat addresses (co-present name), if anyone. */
    addressed?: string;
    /** Scene name to move to, if leaving. */
    move?: string;
}

/** §2.43-validated pressure language: removes stalling, never writes the answer. */
function forceNote(forcing: BeatForcing, privateAlone: boolean): string {
    if (forcing === 'idle')
        return privateAlone
            ? '此處只你二人、沒有眼睛，這是難得能這樣挨著的時候，順著心。'
            : '這事藏著就藏著、緩著就緩著。';
    if (forcing === 'pressing')
        return privateAlone
            ? '無人看著，藏了多年的，在這方寸裡有點按不住了。'
            : '心裡翻著，可人前多半還是按下不表。';
    if (forcing === 'breaking')
        // H3: past the edge — the want has become unbearable. Cross the line
        // this beat; the answer is still yours (confess, reckon, break, or bolt).
        return privateAlone
            ? '到頭了，一個字也壓不回去——只你二人，這一刻把積在心底最深的那句話、那個動作做出來，放不回頭也認了。'
            : '到頭了，再壓下去人就要散了——就在這些眼睛底下，做出那件放不回頭的事，由你的心。';
    return privateAlone
        ? '再也按不住了——只你二人、沒有眼睛，這年頭唯一能這樣的地方，這一刻全由你的心。'
        : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
}

export function buildBeatSystemPrompt(input: ActBeatInput): string {
    const mem = input.memories?.length
        ? `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${input.memories.join('\n- ')}`
        : '';
    const where = `你在【${input.sceneName}】${input.isPrivate ? '(私房)' : ''}，同場：${
        input.others.length
            ? input.others
                  .map((o) => {
                      const facts = [o.role, o.tie].filter(Boolean).join('｜');
                      return facts ? `${o.name}（${facts}）` : o.name;
                  })
                  .join('、')
            : '只你一人'
    }。`;
    const state = input.stateLine ? `\n${input.stateLine}` : '';
    const innerSecret = input.innerSecret
        ? `\n【心底藏著、外人不知的事（只有你自己知道。平日它藏著、只從言外之意漏出來；藏不藏得住、要不要讓它見光，由你在這一拍自己拿主意）】${input.innerSecret}`
        : '';
    return [
        `你就是${input.name}。${input.persona}${mem}`,
        input.tone ?? '',
        `【此刻】${input.clock}。${where}${input.stake ? `\n【風聲】${input.stake}` : ''}${state}${innerSecret}`,
        input.etiquette ? `【稱謂鐵則】${input.etiquette}——輩分與稱呼不可顛倒、不可自創。` : '',
        input.consummate ? CONSUMMATE_BEAT_NOTE : '',
        `你心裡最重的：「${input.want.desc}」${input.want.target ? `（牽涉${input.want.target}）` : ''}。`,
        forceNote(input.forcing, input.privateAlone),
        input.consummate
            ? '**這是一段正在進行的來回，接著剛剛的話與動作往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事——可以是一個動作、一句話、或床笫間的一下進退(一到三句，容許上述分寸的露骨)。' +
              '輸出 JSON：{"beat":"客觀做了/說了什麼","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填場景名/否則無"}。不要 markdown。'
            : '**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事(開放一句)。' +
              '輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","move":"要去別處就填場景名/否則無"}。不要 markdown。',
    ]
        .filter(Boolean)
        .join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export async function actBeat(input: ActBeatInput): Promise<BeatResult> {
    const client = llmText.createTextClient({ kind: 'primary' });
    const res = await client.chat({
        model: client.defaultModel,
        system: buildBeatSystemPrompt(input),
        messages: [
            {
                role: 'user',
                content: `【這場戲剛剛的來回】\n${input.sceneLog || '（戲方起。）'}\n\n輪到你（${input.name}）。`,
            },
        ],
        maxTokens: input.consummate ? 700 : 240,
        temperature: 0.95,
    });
    const o = extractJson(res.text) ?? {};
    const addressed = s(o.addressed);
    const move = s(o.move);
    return {
        beat: s(o.beat) || '（沉默。）',
        inner: s(o.inner),
        addressed: addressed && addressed !== '無' ? addressed : undefined,
        move: move && move !== '無' ? move : undefined,
    };
}

export interface JudgeResolveInput {
    name: string;
    wantDesc: string;
    /** The scene beats, newest last. */
    beats: string[];
}

export interface ResolveVerdict {
    resolved: boolean;
    /** One line on the irreversible act (feeds aftermath context). */
    note?: string;
}

/** What actually happened in a private scene, for content rating. The intimacy
 *  GATE (privateAlone + love-layer drive) grants permission ex ante; this judge
 *  reports the ex-post fact — a gated pair may still just talk all night. */
export type SceneIntimacyRating = 'talk' | 'tender' | 'consummate';

export interface JudgeIntimacyInput {
    /** The scene beats, `名：一拍` lines, in order. */
    beats: string[];
}

export async function judgeSceneIntimacy(input: JudgeIntimacyInput): Promise<SceneIntimacyRating> {
    try {
        const client = llmText.createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是內容分級裁判。讀一場戲的來回，判斷**實際發生**的親密程度（不是語氣、不是暗示的過去）：' +
                '"talk"=對話/事務/密談，無親暱身體接觸；' +
                '"tender"=有親暱（依偎/執手/相擁/吻），未及肌膚之親；' +
                '"consummate"=肌膚之親或雲雨。' +
                '輸出 JSON：{"rating":"talk|tender|consummate"}。不要 markdown。',
            messages: [{ role: 'user', content: input.beats.join('\n') }],
            maxTokens: 60,
            temperature: 0.1,
        });
        const o = extractJson(res.text) ?? {};
        const r = s(o.rating);
        if (r === 'talk' || r === 'tender' || r === 'consummate') return r;
        return 'consummate';
    } catch {
        // Fail closed: an unratable gated scene stays behind the 18+ door.
        return 'consummate';
    }
}

/** Strict §2.31 judge: stalling moves (收拾布包/先讓我唱完/明天再說) never count;
 *  only the protagonist's OWN act that cannot be taken back does. */
export async function judgeWantResolved(input: JudgeResolveInput): Promise<ResolveVerdict> {
    try {
        const client = llmText.createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是嚴格的「不可逆裁判」。判斷一件懸著的心事，在這場戲裡有沒有被**當事人自己**用' +
                '**放不回頭的行動**了結。鐵則：①只認當事人自己的抉擇成定局，別人的動作不算;' +
                '②拖延不算（收拾行李、說改天再說、先忍下、再想想，一律 resolved=false）;' +
                '③說破/做成/斷絕/應承這類覆水難收的才算。輸出 JSON：' +
                '{"resolved":true/false,"note":"若 true,一句寫明是哪個放不回頭的行動"}。不要 markdown。',
            messages: [
                {
                    role: 'user',
                    content: `心事主人：${input.name}\n心事：「${input.wantDesc}」\n\n這場戲的來回：\n${input.beats.join('\n')}`,
                },
            ],
            maxTokens: 160,
            temperature: 0.2,
        });
        const o = extractJson(res.text) ?? {};
        return { resolved: o.resolved === true, note: s(o.note) || undefined };
    } catch {
        return { resolved: false };
    }
}
