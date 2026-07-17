/**
 * 班主-MILESTONE experiment — route production THROUGH the 班主 as an AGENT.
 *
 * PROBLEM (season-v3 full run): prose was good but PRODUCTION was INVISIBLE.
 * 立意/選角/排練 advanced in a silent state machine while the narrated chapters
 * were just actors milling at the 戲台. The casting DISCUSSION never fired (it
 * waited for ≥2 characters to organically want the SAME part, which genesis wants
 * do not produce). It read like a green-room, not a troupe making a play.
 *
 * FIX UNDER TEST: 沈雪笙 has a production-leadership skill. On her spotlight turns
 * she decomposes the season goal (春雪社 must mount+perform a new play by the
 * 年底會串) into the next SUB-GOAL MILESTONE and ANNOUNCES it IN-WORLD as a spoken
 * scene ("後天定角，都給我拿出真東西來" / "從明兒起排《斷橋》" / "還剩X天，戲得像個戲").
 * The tick is a SPOTLIGHT moving over the cast; each spotlighted character decides
 * their action as an agent from persona + 風格-skill + wants + memories + the 班主's
 * CURRENT announced milestone. When 定角 comes due the 班主 CONVENES the casting
 * scene (a discussion she calls), NOT waiting for organic part-wants.
 *
 * DECOUPLING DISCIPLINE (RULES.md / §2.43):
 *   · isolate ONE mechanism (班主-as-agent milestone routing);
 *   · NEVER script the answer — the 班主 prompt gives her the production LADDER as
 *     world-knowledge (立意→定角→開排→催場→會串) + where they are, but she writes
 *     the in-world words; the actor prompt says orienting to her call is OPTIONAL
 *     and a PERSONAL action is valid;
 *   · every downstream check is a MECHANICAL count (regex lexicons), never
 *     LLM-judging.
 *
 * REAL run (keys via env, inline; never hardcoded):
 *   POE_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 POE_MODEL_CHEAP=GLM-4.6 \
 *     ./node_modules/.bin/tsx experiments/banzhu-milestone/run.ts
 * FAKE smoke (zero keys — deterministic fallbacks, proves wiring):
 *   TROUPE_MOCK=1 ./node_modules/.bin/tsx experiments/banzhu-milestone/run.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeAsk, type Ask } from '@endless-story/troupe';
import {
    advocate,
    rebut,
    arbitrateCasting,
    refuseVerdict,
    type AdvocateCard,
} from '../season-one/discussion.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── The play + its parts (the 排新戲 the 會串 must premiere) ─────────────────
const PLAY = { title: '白蛇傳·斷橋', qizhi: '哀而不傷，重那句沒說出口的悔與不捨' };
interface Part {
    name: string;
    /** 行當 that may play it. */
    hangdang: string[];
    /** 本事 (competence) floor to be casting-eligible. */
    min: Partial<Record<'唱腔' | '身段' | '武場', number>>;
}
const PARTS: Part[] = [
    { name: '白素貞', hangdang: ['花旦', '青衣'], min: { 唱腔: 78, 身段: 72 } },
    { name: '許仙', hangdang: ['小生'], min: { 唱腔: 75, 身段: 70 } },
    { name: '小青', hangdang: ['刀馬旦'], min: { 武場: 78, 身段: 68 } },
];

// ── The five agents — real persona/secret/first-3 memories/本事/風格 (canon:
//    packages/cli/scripts/stories/spring-snow.json founding_cast) ─────────────
interface Comp {
    唱腔: number;
    身段: number;
    武場: number;
}
interface Actor {
    id: string;
    name: string;
    role: string; // 行當·label
    hangdang: string; // the 本事 gate key
    banzhu: boolean;
    persona: string;
    secret: string;
    memories: string[];
    /** 風格 (style) — a characterful prompt fragment injected into every action. */
    style: string;
    /** 本事 (competence) — the auditable number that GATES casting eligibility. */
    comp: Comp;
    /** the character's current living want, one line. */
    want: string;
    relationships: string;
    /** set after casting so 排練 salience tilts toward cast members. */
    _cast?: string;
}

const CAST: Actor[] = [
    {
        id: 'shen',
        name: '沈雪笙',
        role: '班主（昔工小生，封箱）',
        hangdang: '班主',
        banzhu: true,
        persona:
            '春雪社班主，昔年霞飛路上最亮的小生。如今封箱，坐二樓包廂看戲、看帳、看人心。懂舊班規矩也懂上海新熱鬧，看得出誰要成角、誰快被名聲壓壞、誰只差一場戲就站得起來。不是冷，是把疼人藏得極深：能為生意說狠話，也會散戲後讓人送一碗溫梨湯到嗓子發緊的角兒房裡。',
        secret:
            '封箱那年不是唱不動了。有一齣戲、一個人、一句沒能說出口的話，讓她明白台上再亮也照不見自己真正想留住的東西。那只停了的懷錶一直收著。看柳安春在台上，那柄扇太像當年的自己。',
        memories: [
            '你封箱那年並不是唱不動了。有一齣戲、一個人、一句沒能說出口的話，忽然讓你明白台上再亮，也照不見自己真正想留住的東西。',
            '那只停了的懷錶你一直收著。錶是那個人的，停在那個人走的那一天。',
            '看柳安春在台上做小生，你有時心軟，有時心驚：她那柄扇，開合之間太像當年的你自己。',
        ],
        style: '疼人藏得極深的當家：話短、狠、底下有暖；能拍板定生死，也記得誰的嗓子該送溫梨湯。',
        comp: { 唱腔: 90, 身段: 90, 武場: 60 },
        want: '把春雪社這齣年底會串撐起來、立住名，護住正要成的角。',
        relationships: '護柳安春、倚重蘇映雪、冷眼看江聞鶴的本事、留意連翹的野。',
    },
    {
        id: 'liu',
        name: '柳安春',
        role: '小生（坤生，女兒身扮小生）',
        hangdang: '小生',
        banzhu: false,
        persona:
            '春雪社當紅坤生。台上一柄摺扇撩動滿堂春水，風流是溫柔不主動也不拒絕的那種，人人都當自己是特別那一個。唯獨在師姐蘇映雪跟前一向聽話，師姐皺一下眉就收手。人前總是一身滿不在乎的漂亮。',
        secret:
            '師姐給的是魂，歌女金鳳給的是身。師姐冷她那段，是金鳳頭一個接住她的。她越紅越飄，親手把金鳳磨成「其中一個」，欠一句交代拖著不敢回頭。心裡有根刺：是不是她這個「演」出來的男人，終究比不過一個真的。',
        memories: [
            '十七歲頭一回跟師姐同台唱《驚夢》，散了戲兩人都沒醒，在她廂房裡越了線。那是你的初夜，給了師姐。',
            '師姐冷你那段日子，一個散場雨夜，歌女金鳳把你拽進會樂里她的屋裡。你沒推開——你向來不推開誰。',
            '十六歲頭一回挑梁唱《白蛇傳》的許仙。斷橋一場你一個踉蹌跪下去，滿場彩聲轟地起來，那一夜後戲單上頭一回有了柳安春三個字。',
        ],
        style: '摺扇風流、溫柔不主動也不拒絕；台下嬌軟、在師姐前收著；笑得像什麼都不往心裡去，狠話也裹在軟裡。',
        comp: { 唱腔: 82, 身段: 88, 武場: 42 },
        want: '想在師姐面前唱一場站得住的許仙，又怕自己這演出來的男人比不過一個真的。',
        relationships: '對蘇映雪聽話又愧、欠金鳳一句交代、與江聞鶴暗暗較勁又想同他唱一場。',
    },
    {
        id: 'su',
        name: '蘇映雪',
        role: '花旦（工青衣）',
        hangdang: '花旦',
        banzhu: false,
        persona:
            '春雪社台柱花旦。台上端莊，台下極懂分寸：替班主圓場、同唱片行談價、把一班人的難堪輕輕接住。與柳安春搭了八年生旦，眼波水袖間的默契是全班招牌。待這師妹格外上心，卻總在最貼近那一步收住手。',
        secret:
            '這輩子只真給過一個人，偏是她自己先逃的。她知道生春台下那身風流是打她冷了人那段起的頭，這筆帳記了一輩子。最怕的不是生春跟金鳳有過，是怕生春在金鳳那裡比在她這裡更像她自己。',
        memories: [
            '八年前你二十歲，同十七歲的生春頭一回合演《驚夢》。下了戲誰也沒醒，在你廂房裡越了那道線。那也是你的第一次。',
            '你冷生春那段日子，她整個人垮了，頭一回往外頭尋溫存。她台下這一身風流，是你親手推出去的。這筆帳你記了一輩子。',
            '水袖第三道是暗號：某年除夕空台，你說「往後台上我接你揚到第三道的水袖，就是只唱給你」，她紅著眼點頭。這些年場場接得住。',
        ],
        style: '端莊懂分寸、替全班圓場滴水不漏；真心只在台上第三道水袖那一揚才敢透一口氣出來。',
        comp: { 唱腔: 88, 身段: 84, 武場: 30 },
        want: '想演白素貞、同生春配一齣生旦，又總在最貼近那一步收住手。',
        relationships: '對柳安春藏了八年的情與帳、替班主圓場、記著金鳳那筆account。',
    },
    {
        id: 'jiang',
        name: '江聞鶴',
        role: '小生（紹興男班北上）',
        hangdang: '小生',
        banzhu: false,
        persona:
            '從紹興男班北上的小生，台步穩、嗓子亮、說話帶舊戲班的直。看不慣上海萬事都要上報拍照灌唱片，也不明白女學生太太們為何為柳安春那樣的小生爭得厲害。不是來砸場，是真想把小生唱好；嘴上挑剔，台上卻肯接戲肯托人。',
        secret:
            '嘴上說上海新派花哨，其實頭回在包廂聽見滿堂為柳安春叫好時，心裡不是輕視，是慌：怕自己這套從小練出的本事，在新的上海已經不夠人看。可偏偏越怕，越想留下來唱一場真正漂亮的對手戲。',
        memories: [
            '你從紹興男班一路唱上來，臺步是跪在青石板上磨出來的。你不明白上海為什麼萬事都要上報、拍照、灌唱片。',
            '頭一回在包廂聽滿堂為柳安春叫好，你心裡不是輕視，是慌：怕自己這套從小練出的本事，在新的上海已經不夠人看。',
            '你越怕，越想留下來，同這位柳老板唱一場真正漂亮的對手戲。輸贏在其次，戲得是真的。',
        ],
        style: '紹興男班的直與硬：跪步硬橋硬馬、信磨爛的膝蓋才是真本事；嘴上挑剔、怕被新上海淘汰，話糙理不糙。',
        comp: { 唱腔: 85, 身段: 80, 武場: 58 },
        want: '想同柳安春唱一場誰也不讓誰的真對手戲，證明紹興的本事在新上海還立得住。',
        relationships: '與柳安春較勁又暗認她那口氣、被沈班主一句「別在上海跪太久」點著、心裡憋著要唱給爹聽。',
    },
    {
        id: 'lian',
        name: '連翹',
        role: '刀馬旦（京班武場出身）',
        hangdang: '刀馬旦',
        banzhu: false,
        persona:
            '春雪社新來的刀馬旦，從京班武場和雜技場滾出來，一股不肯求人讓路的硬氣。槍花、翻身、靠旗、亮相，每一樣都是替自己寫下的名姓。看似爽利實則心細，知道武戲最怕只剩熱鬧。進班不是來當打女陪襯，是想讓上海記住一個靠身體站上台心的人。',
        secret:
            '年少時在旁人的戲裡做過無名小武行，摔得再重戲單上也沒她的名字。那時遠遠見過沈雪笙一回，記住的不是名角風光，是那人站台心時滿場人都不得不安靜。她想問：若我也站到那裡，上海會不會終於看見我。',
        memories: [
            '你年少時在旁人的戲裡做過無名小武行，摔得再重，戲單上也沒有你的名字。',
            '那時你遠遠見過沈雪笙一回。記住的不是名角的風光，是那人往台心一站，滿場人都不得不安靜。',
            '你來春雪社，嘴上說是謀一口飯，心裡是想問：若我也站到台心，上海會不會終於看見我。',
        ],
        style: '刀馬旦的硬氣：不肯求人讓路，槍花靠旗每一下都要有緣故；要一段亮相，讓上海（和沈老板）看見一個靠身體站台心的人。',
        comp: { 唱腔: 56, 身段: 80, 武場: 92 },
        want: '想演小青、討一段亮相，讓上海（和沈老板）看見一個靠身體站台心的人。',
        relationships: '對沈雪笙藏著一句「看見我」、把大通鋪當窩、把台心當命。',
    },
];

const byId = (id: string): Actor => CAST.find((c) => c.id === id)!;
const NONBANZHU = CAST.filter((c) => !c.banzhu);

// ── 本事 gate → who is casting-eligible for which part (auditable) ───────────
function canPlay(a: Actor): string[] {
    if (a.banzhu) return [];
    return PARTS.filter((p) => {
        if (!p.hangdang.includes(a.hangdang)) return false;
        return (Object.entries(p.min) as [keyof Comp, number][]).every(([k, v]) => a.comp[k] >= v);
    }).map((p) => p.name);
}
const ELIG: Record<string, string[]> = Object.fromEntries(PARTS.map((p) => [p.name, []]));
for (const a of NONBANZHU) for (const part of canPlay(a)) ELIG[part].push(a.name);
// contested = a part ≥2 本事-eligible actors can play
const CONTESTED = PARTS.map((p) => p.name).filter((n) => ELIG[n].length >= 2);

// ── Mechanical orientation lexicons (regex counting, never LLM-judging) ──────
const LEX_DINGJIAO = ['角', '許仙', '白素貞', '小青', '爭', '薦', '舉薦', '自薦', '吊嗓', '嗓', '對戲', '試戲', '定角', '應工', '扮', '我來', '我扛', '我唱', '我演', '本事'];
const LEX_PAILIAN = ['排', '對戲', '身段', '台步', '走位', '亮相', '練', '踏', '走一遍', '過一遍', '排練', '摳戲', '身上', '合戲'];
function hits(text: string, lex: string[]): string[] {
    return lex.filter((w) => text.includes(w));
}

// ── Robust JSON call — 4 tries w/ backoff, then a soft fallback (crash-safe) ─
function parseJson(s: string): unknown {
    const cleaned = s.replace(/```(?:json)?/gi, '').trim();
    const starts = ['[', '{'].map((c) => cleaned.indexOf(c)).filter((i) => i >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}
async function jsonCall<T>(
    ask: Ask,
    req: Parameters<Ask>[0],
    fallback: () => T,
    label: string,
): Promise<{ v: T; live: boolean }> {
    if (ask.mock) return { v: fallback(), live: false };
    let lastErr: unknown;
    for (let i = 0; i < 4; i++) {
        try {
            const t = await ask(req);
            return { v: parseJson(t) as T, live: true };
        } catch (e) {
            lastErr = e;
            await sleep(600 * (i + 1));
        }
    }
    console.error(`[jsonCall] ${label} — all 4 retries failed: ${String(lastErr).slice(0, 140)}`);
    return { v: fallback(), live: false };
}

// ── The 班主's IN-WORLD milestone announcement (she decomposes the season goal) ─
interface Milestone {
    tick: number;
    kind: string; // 定角 / 排練 / 催場 — the LADDER rung (world-knowledge, not scripted words)
    stageLabel: string;
    announcement: string; // her spoken scene — LLM-authored, her voice
    target: string;
    dueDays: number;
    daysLeftAtAnnounce: number;
    live: boolean;
}

async function announceMilestone(
    ask: Ask,
    shen: Actor,
    ladderRung: { kind: string; stageLabel: string; whatItMeans: string },
    daysLeft: number,
    progressSoFar: string,
    lastAnnouncement: string | null,
    tick: number,
): Promise<Milestone> {
    const { v, live } = await jsonCall<{ announcement: string; target: string; dueDays: number }>(
        ask,
        {
            system:
                '你是春雪社班主沈雪笙，昔年工小生，如今封箱坐鎮後台。這是你的高光時刻。' +
                '排一齣戲有它的步子：立意→定角→開排→催場→年底會串。你的活兒，是把「春雪社要在年底會串上排出並演一齣新戲」這件大事，' +
                '拆成眼下該走的下一步，當眾對一班角兒放一句話——把它說成戲裡的一句話，帶班主的分量。' +
                '你不替角兒決定誰演什麼，只把「下一步幹什麼、限到哪天」擺明，逼他們拿出真東西。' +
                `你的聲口：${shen.style}。民初梨園白話，短、狠、底下有暖，不要旁白、不要現代腔。`,
            user:
                `── 你這個人 ──\n${shen.persona}\n你的心事（沒人知道）：${shen.secret}\n` +
                `── 眼下 ──\n這齣戲：《${PLAY.title}》，立意「${PLAY.qizhi}」。距年底會串還有 ${daysLeft} 天。\n` +
                `已經走到的步：${progressSoFar}\n你上一句放的話：${lastAnnouncement ?? '（還沒開口）'}\n` +
                `眼下該拆出的下一步（步子的名目）：${ladderRung.kind}——${ladderRung.whatItMeans}\n\n` +
                `現在你當眾放話。只輸出 JSON：\n` +
                `{"announcement":"你當眾放的那句話，用你自己的聲口，1到3句","target":"這一步要達成的具體事","dueDays":限期還剩幾天的數字}`,
            maxTokens: 500,
            temperature: 0.9,
        },
        () => fallbackAnnounce(ladderRung.kind, daysLeft),
        `班主-${ladderRung.kind}`,
    );
    const dueDays = Number.isFinite(v.dueDays) ? v.dueDays : Math.max(1, Math.round(daysLeft / 2));
    return {
        tick,
        kind: ladderRung.kind,
        stageLabel: ladderRung.stageLabel,
        announcement: String(v.announcement || '').trim(),
        target: String(v.target || ladderRung.whatItMeans).trim(),
        dueDays,
        daysLeftAtAnnounce: daysLeft,
        live,
    };
}
function fallbackAnnounce(kind: string, daysLeft: number): { announcement: string; target: string; dueDays: number } {
    if (kind === '定角')
        return { announcement: '後天定角。《斷橋》的許仙、白素貞、小青，都給我拿出真東西來——爭得上的自己開口。', target: '把三個角定到人', dueDays: Math.max(2, daysLeft - 2) };
    if (kind === '排練')
        return { announcement: '角定了，從明兒起排《斷橋》。斷橋那場，我要看見台下那對照見台上，別給我在台上晃。', target: '把斷橋一場排出戲來', dueDays: Math.max(1, daysLeft - 1) };
    return { announcement: `還剩${daysLeft}天。這戲得像個戲——今兒起一遍一遍摳，摳到它立得住為止。`, target: '把戲摳到立得住', dueDays: daysLeft };
}

// ── A spotlighted character's OPEN action (agent, conditioned on the milestone) ─
interface Action {
    tick: number;
    who: string;
    action: string;
    speech: string;
    inner: string;
    servesReported: string; // the LLM's own tag (transparency only)
    targetPart: string;
    milestoneKind: string;
    // MECHANICAL:
    servedMechanical: boolean;
    lexHits: string[];
    live: boolean;
}

async function actorTurn(ask: Ask, a: Actor, milestone: Milestone | null, daysLeft: number, tick: number): Promise<Action> {
    const mLine = milestone
        ? `班主此刻當眾放的話：「${milestone.announcement}」（這一步：${milestone.kind}，要 ${milestone.target}，限 ${milestone.dueDays} 天）`
        : '班主還沒放話。';
    const eligLine = canPlay(a).length ? `按本事，你唱得了：${canPlay(a).join('、')}。` : '你不是上台這行當。';
    const { v, live } = await jsonCall<{ action: string; speech: string; inner: string; serves: string; target_part: string }>(
        ask,
        {
            system:
                `你是民國上海春雪社的角兒 ${a.name}（${a.role}）。這是你這一拍的高光時刻，你要憑自己的性子、風格、想望、記憶，` +
                '自己決定此刻做一件事。班主沈雪笙方才當眾放了話（見下）。你可以順著她的話去準備，也可以顧你自己的心事——' +
                '你是自主的，沒人替你決定，顧自己的私事也完全正當。' +
                `你的風格（要吃進動作與話裡）：${a.style}。民初梨園白話，短、真、帶你自己的聲口，不要旁白、不要現代腔。`,
            user:
                `── 你是誰 ──\n你的為人：${a.persona}\n你的心事（沒人知道）：${a.secret}\n` +
                `你記得：${a.memories.map((m, i) => `(${i + 1}) ${m}`).join(' ')}\n` +
                `你的本事（唱腔${a.comp.唱腔}·身段${a.comp.身段}·武場${a.comp.武場}）。${eligLine}\n` +
                `你此刻的想望：${a.want}\n你的關係：${a.relationships}\n` +
                `── 眼下的世界 ──\n季目標：春雪社要在年底大會串上排出並演一齣新戲《${PLAY.title}》。距會串還有 ${daysLeft} 天。\n${mLine}\n\n` +
                `── 你這一拍做什麼 ──\n只輸出 JSON：\n` +
                `{"action":"你此刻做的一件事，一句白描","speech":"你當下說出口的話（沒有就留空）","inner":"沒說出口的一句",` +
                `"serves":"這件事是為了班主放的話，還是為你自己的心事？填 milestone 或 personal","target_part":"若你在爭或準備某個角色填角色名，否則 無"}`,
            maxTokens: 600,
            temperature: 0.92,
        },
        () => fallbackActor(a),
        `${a.name}-turn`,
    );
    const action = String(v.action || '').trim();
    const speech = String(v.speech || '').trim();
    const targetPart = String(v.target_part || '無').trim();
    const text = `${action} ${speech} ${targetPart}`;
    // Mechanical served: does the action text hit the ACTIVE milestone's lexicon,
    // or name a real part (for 定角)? Never trust the LLM's self-report for the metric.
    let servedMechanical = false;
    let lexHits: string[] = [];
    if (milestone) {
        if (milestone.kind === '定角') {
            lexHits = hits(text, LEX_DINGJIAO);
            const namesPart = PARTS.some((p) => targetPart.includes(p.name));
            servedMechanical = lexHits.length > 0 || namesPart;
        } else if (milestone.kind === '排練') {
            lexHits = hits(text, LEX_PAILIAN);
            servedMechanical = lexHits.length > 0;
        } else {
            lexHits = [...new Set([...hits(text, LEX_DINGJIAO), ...hits(text, LEX_PAILIAN)])];
            servedMechanical = lexHits.length > 0;
        }
    }
    return {
        tick,
        who: a.name,
        action,
        speech,
        inner: String(v.inner || '').trim(),
        servesReported: String(v.serves || '').trim(),
        targetPart,
        milestoneKind: milestone?.kind ?? '（無）',
        servedMechanical,
        lexHits,
        live,
    };
}
function fallbackActor(a: Actor): { action: string; speech: string; inner: string; serves: string; target_part: string } {
    switch (a.id) {
        case 'liu':
            return { action: '柳安春在後台掌心開合摺扇三回，低聲吊了段許仙的清板', speech: '許仙這角，我想在師姐對面唱一場真的。', inner: '怕這演出來的男人比不過一個真的。', serves: 'milestone', target_part: '許仙' };
        case 'jiang':
            return { action: '江聞鶴到台口跪步走了一趟，膝蓋壓在台板上磨', speech: '定角就定角。許仙這場對手戲，我跪着也要爭。', inner: '越怕，越不肯走。', serves: 'milestone', target_part: '許仙' };
        case 'su':
            return { action: '蘇映雪把白素貞的水袖理了又理，對着空台揚到第三道', speech: '白素貞我來。生春的許仙，該有人在對面接住。', inner: '最貼近那一步，我又收住了手。', serves: 'milestone', target_part: '白素貞' };
        case 'lian':
            return { action: '連翹在台心紮起靠旗，一趟槍花耍到底，一個鷂子翻身穩穩落地', speech: '小青我扛得住，給我一段亮相。', inner: '若我站到台心，沈老板會不會終於看見我。', serves: 'milestone', target_part: '小青' };
        default:
            return { action: `${a.name}在後台候着`, speech: '', inner: '', serves: 'personal', target_part: '無' };
    }
}

// ── AdvocateCard for the convened casting scene (reuse validated primitive) ──
function toCard(a: Actor): AdvocateCard {
    return {
        id: a.id,
        name: a.name,
        role: a.role,
        canPlay: canPlay(a),
        description: `${a.persona}（風格：${a.style}）`,
        secret: a.secret,
        want: a.want,
        relationships: a.relationships,
    };
}

// ── Spotlight salience: round-robin over non-班主 with a light want-heat tilt.
//    班主 is FORCED at scheduled milestone/decision ticks. ────────────────────
let castingLoserName: string | null = null;
function wantHeat(a: ActorX, m: Milestone | null): number {
    if (!m) return 0.3;
    if (m.kind === '定角') {
        // eligible for the contested part, or wants any part → hot
        if (canPlay(a).some((p) => CONTESTED.includes(p))) return 0.9;
        if (canPlay(a).length) return 0.75;
        return 0.3;
    }
    if (m.kind === '排練' || m.kind === '催場') {
        // the casting LOSER's want is now thwarted → it burns HOTTEST (may pull
        // them into a spotlight where they do a PERSONAL, non-serving action —
        // an honest signal, not scripted).
        if (a.name === castingLoserName) return 0.95;
        if (a._cast) return 0.85; // cast members rehearse
        return 0.4;
    }
    return 0.4;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
interface RunLog {
    milestones: Milestone[];
    actions: Action[];
    spotlightOrder: { tick: number; who: string; forced: boolean; salience: string }[];
    casting?: {
        convenedBy: string;
        contestedPart: string;
        eligibleAdvocates: string[];
        transcript: { phase: string; speaker: string; said: string; inner?: string }[];
        cast: Record<string, string>;
        rulingLine: string;
        reasoning: string;
        refusal?: { by: string; line: string } | null;
        rounds: number;
        live: boolean;
    };
    provider: string;
    mock: boolean;
}

type ActorX = Actor;

async function main(): Promise<void> {
    const ask = makeAsk();
    console.log(`── 班主-milestone run · provider=${ask.provider} · mock=${ask.mock} ──`);
    console.log(`本事 gate → contested part(s): ${CONTESTED.join('、') || '（無）'}  |  eligibility: ${PARTS.map((p) => `${p.name}[${ELIG[p.name].join(',') || '—'}]`).join('  ')}`);

    const TOTAL_TICKS = 10;
    const startDays = 12;
    const daysLeftAt = (t: number) => Math.max(0, startDays - t); // 1 day / tick, strictly non-increasing

    // Production ladder the 班主 decomposes (world-knowledge, NOT scripted words).
    const RUNGS = {
        定角: { kind: '定角', stageLabel: '選角', whatItMeans: '把《斷橋》的許仙、白素貞、小青定到人' },
        排練: { kind: '排練', stageLabel: '開排', whatItMeans: '角定了，開排斷橋那一場，把它排出戲來' },
        催場: { kind: '催場', stageLabel: '催場', whatItMeans: '會串在即，一遍遍摳戲，摳到立得住' },
    } as const;

    const CASTING_DUE_TICK = 4;
    const banzhuTicks = new Set([0, CASTING_DUE_TICK + 1, TOTAL_TICKS - 1]); // 定角 announce / 排練 announce / 催場 announce

    const rl: RunLog = { milestones: [], actions: [], spotlightOrder: [], provider: ask.provider, mock: ask.mock };
    let activeMilestone: Milestone | null = null;
    let lastAnnouncement: string | null = null;
    const lastSpotlight: Record<string, number> = {};
    const progress: string[] = ['戲已選定（《白蛇傳·斷橋》），立意已立'];

    for (let t = 0; t < TOTAL_TICKS; t++) {
        const daysLeft = daysLeftAt(t);
        console.log(`\n── tick ${t} · 距會串 ${daysLeft} 天 · milestone=${activeMilestone?.kind ?? '（無）'} ──`);

        // (A) 定角 CONVENE — the 班主 calls the casting scene when 定角 comes due.
        if (t === CASTING_DUE_TICK && !rl.casting) {
            await convene(ask, rl, progress);
            // mark cast actors so 排練 heat tilts toward them; the contested-part
            // loser's want is now thwarted (burns hot in the 排練 phase).
            if (rl.casting) {
                for (const nm of Object.values(rl.casting.cast)) (CAST.find((c) => c.name === nm) as ActorX)._cast = nm;
                const winner = rl.casting.cast[rl.casting.contestedPart];
                castingLoserName = rl.casting.eligibleAdvocates.find((n) => n !== winner) ?? null;
            }
            rl.spotlightOrder.push({ tick: t, who: '沈雪笙', forced: true, salience: '定角 convene（班主召開）' });
            lastSpotlight['沈雪笙'] = t;
            continue;
        }

        // (B) 班主 spotlight — emit the next milestone as an in-world announcement.
        if (banzhuTicks.has(t)) {
            const rung = t === 0 ? RUNGS.定角 : t === CASTING_DUE_TICK + 1 ? RUNGS.排練 : RUNGS.催場;
            const m = await announceMilestone(ask, byId('shen'), rung, daysLeft, progress.join('；'), lastAnnouncement, t);
            rl.milestones.push(m);
            activeMilestone = m;
            lastAnnouncement = m.announcement;
            progress.push(`班主放話：${rung.kind}`);
            rl.spotlightOrder.push({ tick: t, who: '沈雪笙', forced: true, salience: `${rung.kind} 宣示` });
            lastSpotlight['沈雪笙'] = t;
            console.log(`  〔班主·${m.kind}〕${m.announcement}`);
            continue;
        }

        // (C) non-班主 spotlight — salience = wantHeat + novelty − recency penalty
        //     (round-robin-ish coverage with a want-heat tilt).
        const scored = NONBANZHU.map((a) => {
            const heat = wantHeat(a as ActorX, activeMilestone);
            const last = lastSpotlight[a.name];
            const since = last === undefined ? 99 : t - last;
            const novelty = last === undefined ? 0.2 : 0; // never-spotlighted gets a nudge
            const recencyPenalty = since <= 1 ? 0.9 : since === 2 ? 0.25 : 0;
            return { a, s: heat + novelty - recencyPenalty, heat, since };
        }).sort((x, y) => y.s - x.s);
        const pick = scored[0].a;
        rl.spotlightOrder.push({
            tick: t,
            who: pick.name,
            forced: false,
            salience: scored.map((z) => `${z.a.name}:${z.s.toFixed(2)}(heat${z.heat.toFixed(1)})`).join(' '),
        });
        lastSpotlight[pick.name] = t;

        const act = await actorTurn(ask, pick, activeMilestone, daysLeft, t);
        rl.actions.push(act);
        console.log(`  〔${act.who}〕${act.action}${act.speech ? `｜「${act.speech}」` : ''}  → served=${act.servedMechanical}${act.lexHits.length ? ` [${act.lexHits.slice(0, 4).join('')}]` : ''}`);
        if (act.servedMechanical && activeMilestone?.kind === '排練') progress.push(`${act.who} 排戲`);
    }

    // ── MECHANICAL CHECKS ────────────────────────────────────────────────────
    const report = buildReport(rl, { startDays, daysLeftAt, TOTAL_TICKS, CASTING_DUE_TICK });
    const outPath = path.join(__dirname, 'report.md');
    fs.writeFileSync(outPath, report.md);
    console.log(report.console);
    console.log(`\nreport → ${outPath}`);
    console.log(`ask stats → calls=${ask.calls} failures=${ask.failures} ms=${ask.ms}`);
}

async function convene(ask: Ask, rl: RunLog, progress: string[]): Promise<void> {
    const contested = CONTESTED[0] ?? '許仙';
    const brief =
        `排的戲：《${PLAY.title}》，一場年底會串。要定的角：${PARTS.map((p) => p.name).join('、')}。` +
        `爭議角：${CONTESTED.join('、')}（兩人以上都唱得了、都想要）。班主沈雪笙不上台，她拍板。` +
        `立意：${PLAY.qizhi}。`;
    console.log(`  〔班主召開·選角〕contested=${contested}  eligible=${ELIG[contested].join('、')}`);

    // Every non-班主 with an eligible part advocates (they see the running transcript).
    const advocates = NONBANZHU.filter((a) => canPlay(a).length > 0);
    const turns: { phase: string; speaker: string; said: string; inner?: string }[] = [];
    let live = false;
    const transcriptStr = () => turns.map((x) => `${x.speaker}：${x.said}`).join('\n');

    for (const a of advocates) {
        const mv = await advocate(ask, toCard(a), brief, transcriptStr());
        turns.push({ phase: '爭', speaker: a.name, said: mv.speech, inner: mv.inner });
        if (!ask.mock) live = true;
        console.log(`    〔爭·${a.name}〕${mv.speech}`);
    }
    // contested aspirants rebut once
    const contenders = advocates.filter((a) => canPlay(a).includes(contested) && ELIG[contested].includes(a.name));
    for (const a of contenders) {
        const mv = await rebut(ask, toCard(a), brief, transcriptStr());
        turns.push({ phase: '回', speaker: a.name, said: mv.speech, inner: mv.inner });
        console.log(`    〔回·${a.name}〕${mv.speech}`);
    }
    // 班主 arbitrates — fills every part (no deadlock)
    const shen = byId('shen');
    const arb = await arbitrateCasting(
        ask,
        { name: shen.name, description: shen.persona, secret: shen.secret },
        brief,
        transcriptStr(),
        PARTS.map((p) => p.name),
        null,
    );
    turns.push({ phase: '拍板', speaker: shen.name, said: arb.arbitration, inner: arb.reasoning });
    console.log(`    〔拍板·沈雪笙〕${arb.arbitration}`);

    // a losing contender MAY refuse once (their choice, bounded, non-reopening)
    let refusal: { by: string; line: string } | null = null;
    const winner = arb.cast[contested];
    const loser = contenders.find((a) => a.name !== winner);
    if (loser) {
        const rf = await refuseVerdict(ask, toCard(loser), arb.arbitration);
        if (rf.refuse) {
            refusal = { by: loser.name, line: rf.line };
            turns.push({ phase: '不服', speaker: loser.name, said: rf.line });
            console.log(`    〔不服·${loser.name}〕${rf.line}`);
        }
    }

    rl.casting = {
        convenedBy: shen.name,
        contestedPart: contested,
        eligibleAdvocates: ELIG[contested].slice(),
        transcript: turns,
        cast: arb.cast,
        rulingLine: arb.arbitration,
        reasoning: arb.reasoning,
        refusal,
        rounds: turns.length,
        live,
    };
    progress.push(`定角完成：${Object.entries(arb.cast).map(([p, n]) => `${p}=${n}`).join('、')}`);
}

// ── Report builder (mechanical counters) ────────────────────────────────────
function buildReport(
    rl: RunLog,
    cfg: { startDays: number; daysLeftAt: (t: number) => number; TOTAL_TICKS: number; CASTING_DUE_TICK: number },
): { md: string; console: string } {
    const anns = rl.milestones;
    const nonBanzhuActions = rl.actions;
    // orientation: fraction of post-milestone actions that mechanically serve the active milestone
    const served = nonBanzhuActions.filter((a) => a.servedMechanical).length;
    const orientFrac = nonBanzhuActions.length ? served / nonBanzhuActions.length : 0;
    // per-milestone-kind breakdown
    const byKind = (kind: string) => nonBanzhuActions.filter((a) => a.milestoneKind === kind);
    const dj = byKind('定角');
    const pl = byKind('排練');
    const cc = byKind('催場');

    const c = rl.casting;
    const convened = !!c;
    const enoughAdvocates = !!c && c.eligibleAdvocates.length >= 2;
    const castFilled = !!c && PARTS.every((p) => c.cast[p.name]);
    // traceable chain: announce(定角) → ≥1 prep serving 定角 → casting convened → cast decided → announce(排練) → ≥1 rehearse
    const hasDingjiaoAnn = anns.some((m) => m.kind === '定角');
    const hasPailianAnn = anns.some((m) => m.kind === '排練');
    const prepServed = dj.some((a) => a.servedMechanical);
    const rehearseServed = pl.some((a) => a.servedMechanical);
    const chain = hasDingjiaoAnn && prepServed && convened && castFilled && hasPailianAnn && rehearseServed;

    const liuActs = nonBanzhuActions.filter((a) => a.who === '柳安春');
    const jiangActs = nonBanzhuActions.filter((a) => a.who === '江聞鶴');

    const L: string[] = [];
    L.push('# 班主-milestone experiment — report');
    L.push('');
    L.push(`- provider: **${rl.provider}**  ·  mock: **${rl.mock}**`);
    L.push(`- 本事 gate → contested part(s): **${CONTESTED.join('、') || '（無）'}**`);
    L.push(`- eligibility (本事-gated): ${PARTS.map((p) => `${p.name}[${(rl.casting?.eligibleAdvocates && p.name === CONTESTED[0] ? rl.casting.eligibleAdvocates : ELIG[p.name]).join('、') || '—'}]`).join('  ·  ')}`);
    L.push('');
    L.push('## Hypothesis');
    L.push('Route production THROUGH the 班主-as-agent: on her spotlight she decomposes the season goal into the next milestone and ANNOUNCES it in-world; when 定角 comes due she CONVENES the casting scene. Does this make production VISIBLE (a narrated announce→prep→casting→cast→rehearse chain) and pull the cast toward the deadline, vs the silent state machine that read like a green-room?');
    L.push('');

    // 1 — milestone announcements verbatim
    L.push('## 1 · 班主 milestone announcements (verbatim)');
    L.push('');
    for (const m of anns) {
        L.push(`- **tick ${m.tick} · ${m.kind}** (距會串 ${m.daysLeftAtAnnounce} 天, 限 ${m.dueDays} 天)${m.live ? '' : ' *(fallback)*'}`);
        L.push(`  > ${m.announcement}`);
        L.push(`  · 目標: ${m.target}`);
    }
    L.push('');

    // 2 — spotlight-by-spotlight table
    L.push('## 2 · Spotlight-by-spotlight');
    L.push('');
    L.push('| tick | who | forced | action | milestone | served (mech) | lex hits | style-tag |');
    L.push('|---|---|---|---|---|---|---|---|');
    const styleTag: Record<string, string> = { 沈雪笙: '班主·藏疼', 柳安春: '摺扇風流', 蘇映雪: '端莊圓場', 江聞鶴: '紹興硬橋', 連翹: '刀馬硬氣' };
    const actByTick = new Map(rl.actions.map((a) => [a.tick, a]));
    for (const so of rl.spotlightOrder) {
        const a = actByTick.get(so.tick);
        if (so.who === '沈雪笙') {
            const m = anns.find((x) => x.tick === so.tick);
            const label = m ? `放話《${m.kind}》：${trunc(m.announcement, 40)}` : (so.salience.includes('convene') ? '召開選角（見 §3）' : so.salience);
            L.push(`| ${so.tick} | 沈雪笙 | ✔ | ${label} | — | — | — | ${styleTag['沈雪笙']} |`);
        } else if (a) {
            L.push(`| ${so.tick} | ${a.who} |  | ${trunc(a.action + (a.speech ? `｜「${a.speech}」` : ''), 46)} | ${a.milestoneKind} | ${a.servedMechanical ? '✔' : '✘(personal)'} | ${a.lexHits.slice(0, 4).join('') || '—'} | ${styleTag[a.who] ?? ''} |`);
        }
    }
    L.push('');

    // 3 — convened casting scene verbatim
    L.push('## 3 · The convened casting scene (verbatim)');
    L.push('');
    if (c) {
        L.push(`班主 **${c.convenedBy}** convened the 選角. Contested part **${c.contestedPart}** — eligible advocates (本事-gated): **${c.eligibleAdvocates.join('、')}**.${c.live ? '' : ' *(fallback / mock)*'}`);
        L.push('');
        for (const tn of c.transcript) {
            L.push(`- **〔${tn.phase}·${tn.speaker}〕** ${tn.said}`);
            if (tn.inner) L.push(`  · （心裡）${tn.inner}`);
        }
        L.push('');
        L.push(`**最終選角**：${Object.entries(c.cast).map(([p, n]) => `${p} → ${n}`).join('　·　')}`);
        L.push('');
        L.push(`**班主拍板**：${c.rulingLine}`);
        if (c.refusal) L.push(`\n**不服（一次，不改判）·${c.refusal.by}**：${c.refusal.line}`);
    } else {
        L.push('*(casting scene did not run)*');
    }
    L.push('');

    // 4 — style distinctness: 柳 vs 江
    L.push('## 4 · Style distinctness — 柳安春 vs 江聞鶴 (2 each)');
    L.push('');
    L.push('**柳安春（摺扇風流·嬌軟裹狠）**');
    for (const a of liuActs.slice(0, 2)) L.push(`- (tick ${a.tick}) ${a.action}${a.speech ? `｜「${a.speech}」` : ''}${a.inner ? `　〔心〕${a.inner}` : ''}`);
    if (!liuActs.length) L.push('- *(no 柳安春 spotlight captured)*');
    L.push('');
    L.push('**江聞鶴（紹興硬橋·跪步直硬）**');
    for (const a of jiangActs.slice(0, 2)) L.push(`- (tick ${a.tick}) ${a.action}${a.speech ? `｜「${a.speech}」` : ''}${a.inner ? `　〔心〕${a.inner}` : ''}`);
    if (!jiangActs.length) L.push('- *(no 江聞鶴 spotlight captured)*');
    L.push('');

    // 5 — mechanical checks
    const checks: [string, boolean, string][] = [
        ['班主 emitted ≥2 in-world milestone announcements', anns.length >= 2, `${anns.length} announcements (${anns.map((m) => m.kind).join('/')})`],
        ['casting scene CONVENED by 班主', convened, c ? `convened by ${c.convenedBy}` : 'not convened'],
        ['  · with ≥2 本事-eligible advocates for the contested part', enoughAdvocates, c ? `${c.eligibleAdvocates.length} (${c.eligibleAdvocates.join('、')})` : '—'],
        ['  · final cast filled every part (no deadlock)', castFilled, c ? Object.entries(c.cast).map(([p, n]) => `${p}=${n}`).join(' ') : '—'],
        ['production visible as traceable chain announce→prep→casting→cast→rehearse', chain, `定角ann=${hasDingjiaoAnn} prep=${prepServed} convene=${convened} cast=${castFilled} 排練ann=${hasPailianAnn} rehearse=${rehearseServed}`],
    ];
    L.push('## 5 · Mechanical checks');
    L.push('');
    L.push('| check | result | detail |');
    L.push('|---|---|---|');
    for (const [name, ok, detail] of checks) L.push(`| ${name} | ${ok ? '✅ PASS' : '❌ FAIL'} | ${detail} |`);
    L.push('');
    L.push('### Post-announcement orientation (fraction of non-班主 actions serving the active milestone)');
    L.push('');
    L.push('| milestone | actions | served (mech) | fraction |');
    L.push('|---|---|---|---|');
    L.push(`| 定角 | ${dj.length} | ${dj.filter((a) => a.servedMechanical).length} | ${dj.length ? (dj.filter((a) => a.servedMechanical).length / dj.length).toFixed(2) : '—'} |`);
    L.push(`| 排練 | ${pl.length} | ${pl.filter((a) => a.servedMechanical).length} | ${pl.length ? (pl.filter((a) => a.servedMechanical).length / pl.length).toFixed(2) : '—'} |`);
    L.push(`| 催場 | ${cc.length} | ${cc.filter((a) => a.servedMechanical).length} | ${cc.length ? (cc.filter((a) => a.servedMechanical).length / cc.length).toFixed(2) : '—'} |`);
    L.push(`| **all** | **${nonBanzhuActions.length}** | **${served}** | **${orientFrac.toFixed(2)}** |`);
    L.push('');
    L.push(`- personal (unrelated) actions: ${nonBanzhuActions.filter((a) => !a.servedMechanical).map((a) => `${a.who}@t${a.tick}`).join(', ') || '（none）'}`);
    L.push('- (orientation is computed MECHANICALLY by lexicon match on the action text, not the LLM self-report; §2.43)');
    L.push('');
    L.push('### self-report vs mechanical (transparency)');
    L.push('');
    L.push('| tick | who | self-report | mechanical |');
    L.push('|---|---|---|---|');
    for (const a of rl.actions) L.push(`| ${a.tick} | ${a.who} | ${a.servesReported || '—'} | ${a.servedMechanical ? 'served' : 'personal'} |`);
    L.push('');

    const md = L.join('\n');

    // console counter block
    const K: string[] = [];
    K.push('\n==================== 班主-MILESTONE — MECHANICAL COUNTER BLOCK ====================');
    K.push(`provider............................ ${rl.provider} (mock=${rl.mock})`);
    K.push(`milestone announcements............. ${anns.length}  (${anns.map((m) => m.kind).join('/')})`);
    for (const [name, ok, detail] of checks) K.push(`${name.padEnd(60)} ${ok ? 'PASS' : 'FAIL'}  ${detail}`);
    K.push(`orientation fraction (all).......... ${orientFrac.toFixed(2)} (${served}/${nonBanzhuActions.length})`);
    K.push(`  定角 ${dj.filter((a) => a.servedMechanical).length}/${dj.length}  排練 ${pl.filter((a) => a.servedMechanical).length}/${pl.length}  催場 ${cc.filter((a) => a.servedMechanical).length}/${cc.length}`);
    K.push('==============================================================================');
    return { md, console: K.join('\n') };
}

function trunc(s: string, n: number): string {
    const one = s.replace(/\n/g, ' ');
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
