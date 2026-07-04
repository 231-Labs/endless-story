/**
 * Character Agent — BEAT: one open action inside a scene's interaction loop
 * (§2.48). The character responds to the ongoing exchange, driven by their
 * hottest want under a forcing note that only ever removes stalling — it never
 * prescribes the act (§2.31/§2.43). Also the resolve judge: a want counts as
 * answered ONLY by the protagonist's own irreversible act (§2.31 anti-idling,
 * §2.33 participant gate).
 */

import { text as llmText } from '@endless-story/llm';

export type BeatForcing = 'idle' | 'pressing' | 'edge';

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
    /** Co-present character names (empty = alone). */
    others: string[];
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
    /** Canon honorifics facts (identity guardrail, e.g. 蘇映雪為師姐). */
    etiquette?: string;
}

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
    return privateAlone
        ? '再也按不住了——只你二人、沒有眼睛，這年頭唯一能這樣的地方，這一刻全由你的心。'
        : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
}

export function buildBeatSystemPrompt(input: ActBeatInput): string {
    const mem = input.memories?.length
        ? `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${input.memories.join('\n- ')}`
        : '';
    const where = `你在【${input.sceneName}】${input.isPrivate ? '(私房)' : ''}，同場：${
        input.others.length ? input.others.join('、') : '只你一人'
    }。`;
    const state = input.stateLine ? `\n${input.stateLine}` : '';
    return [
        `你就是${input.name}。${input.persona}${mem}`,
        input.tone ?? '',
        `【此刻】${input.clock}。${where}${input.stake ? `\n【風聲】${input.stake}` : ''}${state}`,
        input.etiquette ? `【稱謂鐵則】${input.etiquette}——輩分與稱呼不可顛倒、不可自創。` : '',
        `你心裡最重的：「${input.want.desc}」${input.want.target ? `（牽涉${input.want.target}）` : ''}。`,
        forceNote(input.forcing, input.privateAlone),
        '**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事(開放一句)。' +
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
        maxTokens: 240,
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
