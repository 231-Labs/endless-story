/**
 * Character Agent — BEAT: one open action inside a scene's interaction loop
 * (§2.48). The character responds to the ongoing exchange, driven by their
 * hottest want under a forcing note that only ever removes stalling — it never
 * prescribes the act (§2.31/§2.43). Also the resolve judge: a want counts as
 * answered ONLY by the protagonist's own irreversible act (§2.31 anti-idling,
 * §2.33 participant gate).
 */

import { text as llmText } from '@endless-story/llm';
import { buildBeatSystemPrompt, pronounFromBody, type ActBeatInput, type BeatResult } from './beat-prompt.js';

// Pure prompt surface (types + builders) lives in the node-clean leaf
// `beat-prompt.ts`; re-exported here so the package surface is unchanged.
export * from './beat-prompt.js';


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
    // The model often self-prefixes its own name (「蘇映雪：…」); every renderer
    // prepends the speaker itself, so strip a leading self-name here (once).
    const esc = input.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Strips 「名：」 AND a bare leading self-name (「連翹把靠旗…」) — but not a
    // possessive self-reference (「連翹的靴」 keeps its subject).
    const deName = (t: string): string => t.replace(new RegExp(`^${esc}(?!的)\\s*[:：]?\\s*`), '');
    return {
        beat: deName(s(o.beat)) || '（沉默。）',
        inner: deName(s(o.inner)),
        addressed: addressed && addressed !== '無' ? addressed : undefined,
        move: move && move !== '無' ? move : undefined,
        close: o.close === true ? true : undefined,
        intimacy: o.intimacy === 'advance' || o.intimacy === 'accept' || o.intimacy === 'decline' ? o.intimacy : undefined,
    };
}

export interface JudgeResolveInput {
    name: string;
    /** Owner's 身/sex phrase — pronoun guard for the note (an unguarded judge wrote
     *  他咬緊牙關 for a 坤生). */
    ownerBody?: string;
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

// ── Scene self-check / repair pass ───────────────────────────────────────────
export interface ReviewSceneParticipant {
    name: string;
    /** In-world 身/sex phrase — feeds the pronoun + anatomy repair (data-driven). */
    bodyFact?: string;
    role?: string;
    /** One-line canon relationship toward the others (footing for voice checks). */
    relationship?: string;
}

export interface ReviewSceneInput {
    /** Pinned era facts (anti-anachronism). */
    worldPremise: string;
    /** Where this scene physically happens (name + world hint) — feeds the
     *  object-not-here check (a remembered prop from elsewhere must not appear). */
    venue?: string;
    venueHint?: string;
    participants: ReviewSceneParticipant[];
    beats: Array<{ name: string; text: string; inner?: string }>;
}

export interface ReviewSceneReply {
    beats: Array<{ name: string; text: string; inner?: string }>;
}

/**
 * SELF-CHECK / REPAIR pass — re-reads a fully-rendered scene and returns the SAME
 * beats (same names, same order, same count) with the TEXT repaired. It fixes hard
 * errors (wrong pronouns; wrong-gender anatomy / invented organs; out-of-character
 * voice; ANACHRONISM against the era facts) AND prose quality (monotone one-
 * sidedness, too little dialogue, repeated catchphrases). GENERAL: the participants'
 * bodyFacts drive the pronoun/anatomy check; nothing is name-cased. One extra LLM
 * call per rendered scene; on any failure the caller keeps the originals.
 */
export async function reviewScene(input: ReviewSceneInput): Promise<ReviewSceneReply | null> {
    if (!input.beats.length) return { beats: input.beats };
    try {
        const pronouns = input.participants
            .map((p) => `${p.name}＝${pronounFromBody(p.bodyFact)}（${p.bodyFact ?? '身不詳'}）`)
            .join('、');
        const who = input.participants
            .map((p) => `- ${p.name}｜${p.role ?? '—'}｜身：${p.bodyFact ?? '不詳'}${p.relationship ? `｜與人：${p.relationship}` : ''}`)
            .join('\n');
        const numbered = input.beats.map((b, i) => `${i}｜${b.name}：${b.text}`).join('\n');
        const client = llmText.createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是這場戲的校訂人。重讀整場戲的每一拍，把明顯的錯處與筆病改掉，改後仍是同樣幾拍、' +
                '同樣的人、同樣的順序、同樣數目——只動每一拍的文字。要修的：' +
                '①代詞用錯（把在場某人的性別代詞寫反）；' +
                '②寫出不合其身子的器官／動作，或憑空生出兩人身上沒有的器官（尤其同性之間別寫「插入」「那沒根的東西」）；' +
                '③口吻走樣、不像這個人；' +
                '④時代錯亂（違反下面的世道鐵則）；' +
                '⑤筆病——一面倒的獨角戲、對白太少（金瓶梅是話多的）、同一句口頭禪／比喻反覆；' +
                '⑥物不在場——把別處的物事寫成就在眼前（誰家窗台的花、誰房裡的擺設憑空出現在此處）；' +
                '這類要嘛改成就地取材、要嘛改成用話語提及那件別處的東西；' +
                '⑦比喻落地——把「帳／債／欠」這類心裡的比喻坐實成憑空冒出的有形物（借據、文書、銀錢）。' +
                '⑧隨身物歸屬——別人的貼身物件（誰的懷錶、誰的摺扇）憑空出現在另一人手裡；除非這場戲裡真演了交接，物件跟著主人走。' +
                '欠的是情分就照情分討：改成話語、動作、眼神，把那紙上的道具拿掉。' +
                '沒問題的拍，text 原樣照抄。只輸出 JSON：{"beats":[{"i":序號,"text":"改後這一拍"}...]}。不要 markdown。',
            messages: [
                {
                    role: 'user',
                    content:
                        `【世道鐵則】${input.worldPremise}\n\n` +
                        (input.venue ? `【此處】${input.venue}${input.venueHint ? `——${input.venueHint}` : ''}\n\n` : '') +
                        `【在場的人（性別代詞：${pronouns}）】\n${who}\n\n` +
                        `【這場戲逐拍】\n${numbered}\n\n` +
                        `逐拍校訂，回同樣 ${input.beats.length} 拍。`,
                },
            ],
            maxTokens: 1400,
            temperature: 0.4,
        });
        const o = extractJson(res.text) ?? {};
        const arr = Array.isArray((o as { beats?: unknown }).beats) ? (o as { beats: unknown[] }).beats : null;
        if (!arr) return { beats: input.beats };
        // Map revised text back onto the original beats BY INDEX (names/order/inner
        // preserved); any beat the judge dropped or left blank keeps its original.
        const revisedById = new Map<number, string>();
        for (const raw of arr) {
            if (!raw || typeof raw !== 'object') continue;
            const idx = Number((raw as { i?: unknown }).i);
            let t = s((raw as { text?: unknown }).text);
            // The reviewer reads beats as 「名：text」 and tends to echo the name back
            // into its revision — strip the speaker's own leading name (this was how
            // the self-name doubling survived the actBeat strip).
            const nm = input.beats[idx]?.name;
            if (t && nm) {
                const escNm = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                t = t.replace(new RegExp(`^${escNm}\\s*[:：]\\s*`), '');
            }
            if (Number.isInteger(idx) && t) revisedById.set(idx, t);
        }
        return {
            beats: input.beats.map((b, i) => ({ name: b.name, text: revisedById.get(i) ?? b.text, inner: b.inner })),
        };
    } catch {
        return { beats: input.beats };
    }
}

// ── POV daily reflection (narrative-subjective layer) ────────────────────────
export interface PovReflectInput {
    name: string;
    persona: string;
    /** The narrative day being reflected on. */
    day: number;
    /** Everything that passed to/around THIS character today (their own ledger). */
    todayText: string;
    /** This character's live wants (what they still mean to do). */
    wants: Array<{ layer: string; desc: string; target?: string }>;
    /** This character's durable self-model lines (who they take themselves to be). */
    selfModel?: string;
    /** 身/sex facts for THIS character + everyone the day touched, so the reflection
     *  keeps every pronoun correct (a 坤生 lover is 她, never 他/男人). DATA-driven —
     *  same guard the beat/weave paths carry; the diary path was the one leak. */
    castBodies?: Array<{ name: string; bodyFact?: string }>;
}

/**
 * FIRST-PERSON, SUBJECTIVE (possibly biased) reflection of ONE character's day —
 * what happened to ME, how I feel, what I intend. This is the narrative-subjective
 * layer a reader follows, kept deliberately separate from the objective 時辰 章回.
 * Returns a short first-person passage (or null). No names hardcoded.
 */
export async function povReflect(input: PovReflectInput): Promise<string | null> {
    try {
        const wantLines = input.wants.length
            ? input.wants.map((w) => `- [${w.layer}] ${w.desc}${w.target ? `（掛著${w.target}）` : ''}`).join('\n')
            : '（今日心裡沒特別掛著什麼。）';
        // Same DATA-DRIVEN pronoun guard the beat/weave paths carry — the diary path was
        // the one leak that let a 坤生 lover be written 他/男人 in someone's reflection.
        const bodies = (input.castBodies ?? [])
            .filter((c) => c.name)
            .map((c) => `${c.name}是${pronounFromBody(c.bodyFact)}（${c.bodyFact ?? '身不詳'}）`);
        const bodyNote = bodies.length
            ? `\n【身邊人的身（代詞鐵則）】${bodies.join('、')}——照這個寫，坤生／女子縱然台上扮男、氣度英挺，` +
              '在我心裡她仍是「她」，不可寫成「他」「男人」；男子亦不可寫成「她」。'
            : '';
        // PRIMARY model on purpose: the diary is a reader-facing surface (追角 feed), and
        // the cheap tier both writes flatter and has broken same-sex gender handling.
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你就是這個人。夜深了，替自己把今天在心裡過一遍——用**第一人稱**，寫我今天遇上了什麼、' +
                '心裡是什麼滋味、我還想怎麼樣。這是**我的主觀**，可以偏心、可以只記我在意的、可以埋怨、' +
                '可以自欺；不是公正的流水帳。只寫一小段（60-140字），不要標題、不要 JSON、不要分行成清單。' +
                '這日記是一夜一夜寫下去的：別把前幾夜寫過的那句命題再抄一遍，今晚只寫今晚真正戳到我的。' +
                bodyNote,
            messages: [
                {
                    role: 'user',
                    content:
                        `# 我是誰\n${input.name}：${input.persona}` +
                        (input.selfModel ? `\n\n# 我一向記得自己是誰\n${input.selfModel}` : '') +
                        `\n\n# 我此刻心裡掛著的事\n${wantLines}` +
                        `\n\n# 今天（第${input.day}日）在我身上、身邊發生的事\n${input.todayText || '（今天沒什麼要緊事，晃了一天。）'}` +
                        `\n\n把今天在你（${input.name}）心裡過一遍。`,
                },
            ],
            maxTokens: 320,
            temperature: 0.9,
        });
        return res.text.trim() || null;
    } catch {
        return null;
    }
}

// ── Established-pair judge (relationship milestone promotion) ────────────────
export interface JudgeEstablishedInput {
    aName: string;
    bName: string;
    /** Each side's CURRENT view of the other (their own graph lines). */
    aView?: string;
    bView?: string;
    /** Their live/recent romantic want descs toward each other (evidence). */
    wants?: string[];
    /** Tail of their most recent private scene together, if any. */
    lastSceneTail?: string;
}

/**
 * MILESTONE JUDGE — are these two, as of now, 相許 (openly each other's)?
 * Establishment used to be STATIC seed data, so a pair that crossed the
 * confession milestone in play could never reach the consummate register —
 * no 床戲, hence nothing for a jealous third to walk in on (the post-W1
 * 修羅場 drought). This judge READS the relationship (never steers it);
 * a promotion only unlocks a register the pair may or may not use.
 */
export async function judgeEstablished(input: JudgeEstablishedInput): Promise<boolean> {
    try {
        const client = llmText.createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '你是關係判官。就下面兩人各自心裡的認知與近況，判斷他們此刻是否已「相許」——' +
                '雙方都已挑明、都認了彼此（不是單戀、不是曖昧、不是只有一方交了心）。' +
                '嚴格：有一方仍未挑明或仍在退，就是 false。輸出 JSON：{"established":true|false}。不要 markdown。',
            messages: [
                {
                    role: 'user',
                    content:
                        `${input.aName} 心裡對 ${input.bName}：${input.aView ?? '（不詳）'}\n` +
                        `${input.bName} 心裡對 ${input.aName}：${input.bView ?? '（不詳）'}\n` +
                        (input.wants?.length ? `兩人心裡掛著的：\n${input.wants.map((w) => `- ${w}`).join('\n')}\n` : '') +
                        (input.lastSceneTail ? `他們最近一場私下相處的尾聲：${input.lastSceneTail}\n` : '') +
                        `\n此刻他們算不算已相許？`,
                },
            ],
            maxTokens: 60,
            temperature: 0.1,
        });
        const o = extractJson(res.text) ?? {};
        return o.established === true;
    } catch {
        return false; // fail closed: no promotion on error
    }
}

// ── POV scene rendering (the 追角 lens: one scene, one participant's eyes) ────
export interface PovSceneInput {
    /** The witnessing participant (whose eyes render the scene). */
    name: string;
    persona: string;
    /** Their private inner-life secret — interpretive soil, never another's. */
    secret?: string;
    /** Their OWN canon feelings toward the others present (「對TA：…」lines). */
    ties?: string;
    /** Their own memories that bear on this scene (interpretive soil). */
    memories?: string[];
    venue: string;
    venueHint?: string;
    /** Clock label, e.g. 第1日·黃昏. */
    clock: string;
    /** The scene's OBJECTIVE beats, in order (the canon this version must keep). */
    beats: Array<{ name: string; text: string }>;
    /** Identity facts for everyone present: 身/sex for pronouns AND 行當 (role) so
     *  the retelling never re-assigns an identity — a POV writer with no role data
     *  once called the 花旦's hand 「坤生的手」 (the troupe's strongest 行當
     *  association bled onto the wrong person). */
    castBodies?: Array<{ name: string; bodyFact?: string; role?: string }>;
}

/**
 * SCENE-LEVEL SUBJECTIVE RENDERING — retell ONE rendered scene in first person
 * through one participant's eyes, biased by their persona + secret + ties + own
 * memories, WITHOUT changing what objectively happened (attention and
 * interpretation diverge; events never do). Validated by the pov-scene probe
 * (pairwise 5-gram overlap 3-8%, zero invented events; the same gesture read
 * three mutually exclusive ways). Reader-facing → primary model; caller gates
 * by followers so cost scales with subscribers. Returns prose or null.
 */
export async function povScene(input: PovSceneInput): Promise<string | null> {
    if (!input.beats.length) return null;
    try {
        const sceneText = input.beats.map((b) => `${b.name}：${b.text}`).join('\n');
        const soil = input.memories?.length ? input.memories.map((m) => `- ${m}`).join('\n') : '';
        const bodies = (input.castBodies ?? [])
            .filter((c) => c.name)
            .map((c) => `${c.name}＝${c.role ?? '行當不詳'}｜${pronounFromBody(c.bodyFact)}（${c.bodyFact ?? '身不詳'}）`);
        const bodyNote = bodies.length
            ? `\n【在場人的身份（鐵則）】${bodies.join('、')}。行當是誰的就是誰的——坤生、花旦、刀馬旦各歸其主，` +
              '別把一個人的行當、來歷安到另一個人頭上；坤生／女子縱台上扮男，心裡仍是「她」。'
            : '';
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system: [
                `你就是${input.name}。${input.persona}`,
                input.secret ? `【你心底的事（只有你自己知道）】${input.secret}` : '',
                input.ties ? `【你對人的真實感受】\n${input.ties}` : '',
                soil ? `【你身上帶著的舊事】\n${soil}` : '',
                '',
                '下面是方才那一場的客觀經過（誰做了什麼、說了什麼，一字不差）。',
                '用你的眼睛把這一場重新講一遍：第一人稱、當下時態的敘事（不是日記），四到六段。',
                '鐵則：',
                '- 客觀發生的事一件不許改、一件不許漏——誰的手在哪、誰說了哪句，都照實；',
                '- 但你只寫你「看見、聽見、感覺到」的：你的注意力落在哪、哪個細節刺你、你把它解讀成什麼——這才是你的版本；',
                '- 你看不進別人心裡：別人的心思只能從其言行猜，猜測就寫成猜測；',
                '- 你自己此刻沒說出口的，寫出來。',
                '只輸出敘事正文，不要標題、不要 markdown。' + bodyNote,
            ]
                .filter(Boolean)
                .join('\n'),
            messages: [
                {
                    role: 'user',
                    content: `【那一場的客觀經過】${input.clock}，${input.venue}${input.venueHint ? `（${input.venueHint}）` : ''}。\n${sceneText}\n\n輪到你（${input.name}）講你的版本。`,
                },
            ],
            maxTokens: 900,
            temperature: 0.9,
        });
        return res.text.trim() || null;
    } catch {
        return null;
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
                '③說破/做成/斷絕/應承這類覆水難收的才算。' +
                (input.ownerBody ? `④代詞鐵則：心事主人${input.name}是${pronounFromBody(input.ownerBody)}（${input.ownerBody}），note 裡的代詞照此寫。` : '') +
                '輸出 JSON：' +
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
