/**
 * MIND PILOT — a character is a PERSISTENT AGENT SESSION, not a briefed prompt.
 * ============================================================================
 * First-principles rebuild (user-approved pilot): the season harness
 * re-instantiates each character dozens of times a day from a compressed
 * dossier — a mind with amnesia plus a briefing packet. Here instead:
 *
 *   · A mind = ONE growing transcript (system = canon persona, messages = its
 *     LIVED LIFE verbatim: every percept it received, everything it did/said/
 *     thought). Nothing is re-generated or re-briefed, ever.
 *   · The world = physics + postman: clock, co-location, rhythm facts, and
 *     delivery of exactly what each mind can perceive. It never curates minds.
 *   · 正史 = the postman's objective event log (what actually happened);
 *     解讀 = each mind's own transcript (its honest experience). Native
 *     two-layer, nothing stitched.
 *
 * Pilot: 柳生春 × 金鳳, 3 world-days (6 時辰/day), fresh canon start.
 * Output: minds' transcripts + objective log + a readable 3-day markdown for
 * blind comparison against the season harness's 金柳 days.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-pilot/run.ts <outDir>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES } from '../agent-season/world.ts';

const OUT = path.resolve(process.argv[2] ?? 'experiments/mind-pilot/out');
fs.mkdirSync(OUT, { recursive: true });

const DAYS = Number(process.env.PILOT_DAYS ?? 3);
const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
const VENUE_NAMES = VENUES.map((v) => v.name);

type Msg = { role: 'user' | 'assistant'; content: string };

interface MindAct {
    心裡: string;
    做: string;
    說?: string;
    去?: string;
}

async function llmChat(system: string, messages: Msg[], maxTokens: number): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: client.defaultModel, system, messages, maxTokens, temperature: 0.85 });
    return res.text ?? '';
}

class Mind {
    readonly id: string;
    readonly name: string;
    readonly system: string;
    transcript: Msg[] = [];
    venue: string;

    constructor(id: string, startVenue: string) {
        this.id = id;
        const c = CANON[id];
        this.name = c.name;
        this.venue = startVenue;
        // A mind KNOWS its own secret and its own past — they live in the system
        // prompt once, never re-briefed. Format rules are part of being embodied.
        this.system = [
            `你是${c.name}（${c.role}），活在 1920 年代的上海。這不是扮演練習——你就是這個人，活在連續的時間裡。`,
            `【你是誰】${c.description}`,
            `【你心底的事（只有你自己知道）】${c.secret}`,
            `【你記得的過往】\n${c.memories.map((m) => `・${m.text}`).join('\n')}`,
            `【這個世界】${WORLD_PREMISE}`,
            `地方：${VENUE_NAMES.join('、')}。你住在${startVenue}一帶。`,
            '',
            '【你怎麼活】你會不斷收到「此刻的感知」（時辰、身在何處、誰在場、誰對你說了什麼）。',
            '每次收到感知，回覆你此刻真實的反應，嚴格只輸出 JSON：',
            '{"心裡":"你此刻真實的念頭(一兩句)","做":"你客觀做了什麼(一兩句,第三人稱)","說":"你說出口的話(沒有就空字串)","去":"你要動身去的地方(留在原地就空字串)"}',
            '規矩：話用人話說，比方留給真到了那一步的時刻；「命/一輩子」是一生說一兩次的字；',
            '你只知道你親歷親聞的事；你有自己的營生與功課，不是每個時辰都要找人。',
        ].join('\n');
    }

    async perceiveAndAct(percept: string): Promise<MindAct> {
        this.transcript.push({ role: 'user', content: percept });
        const raw = await llmChat(this.system, this.transcript, 500);
        this.transcript.push({ role: 'assistant', content: raw });
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            const o = JSON.parse(m ? m[0] : raw) as Partial<MindAct>;
            return { 心裡: o.心裡 ?? '', 做: o.做 ?? '', 說: o.說 ?? undefined, 去: o.去 ?? undefined };
        } catch {
            return { 心裡: '', 做: raw.slice(0, 120) };
        }
    }

    /** Night reflection: the mind speaks to itself; the reply simply LIVES in
     *  the transcript — no external distillation machinery. */
    async reflect(day: number): Promise<string> {
        this.transcript.push({ role: 'user', content: `（夜深了，第${day}日過完。這一天在你心裡留下什麼？只對自己說，說人話。）` });
        const raw = await llmChat(this.system, this.transcript, 400);
        this.transcript.push({ role: 'assistant', content: raw });
        return raw.trim();
    }

    save(): void {
        fs.writeFileSync(path.join(OUT, `mind-${this.id}.json`), JSON.stringify(this.transcript, null, 1));
    }
}

/** The postman's objective log (正史). */
const history: string[] = [];
const log = (s: string): void => {
    history.push(s);
    console.log(s);
};

/** World facts delivered as percepts — never commands. PHYSICS v2 adds:
 *  ① whereabouts intel (六七年舊識自然曉得彼此的日程 — knowledge is what makes
 *    seeking POSSIBLE; v1 minds couldn't find each other even if they wanted),
 *  ② the day-3 大會串: each livelihood independently pulls both to the SAME
 *    stage — the world's collision, their choice to answer it. */
function rhythmFact(id: string, part: string, day: number): string {
    const finale = day === DAYS;
    if (id === '柳生春') {
        const intel = '（你曉得金鳳的日子：白日多半在會樂里寓所得閒，入夜在霞飛路歌場唱堂會。）';
        if (finale && (part === '黃昏' || part === '入夜')) return `今夜年關大會串，你領銜《白蛇傳》，雲錦台戲台開鑼——聽說霞飛路歌場也受邀來助唱。${intel}`;
        if (part === '日午' || part === '晡時') return `這個時辰班裡照例排戲吊嗓（雲錦台戲台），你的營生在那裡。${intel}`;
        if (part === '深宵') return '夜深了，各處都歇了。';
        return intel;
    }
    if (id === '金鳳') {
        const intel = '（你曉得柳生春的日子：白日在戲園一帶排戲吊嗓，深宵歇在後台小廂房。）';
        if (finale && (part === '黃昏' || part === '入夜')) return `今夜雲錦台年關大會串，歌場受邀去助唱，妳掛頭牌——這是霞飛路的臉面，去不去在妳。柳生春領銜開鑼。${intel}`;
        if (part === '入夜') return `入夜是你唱堂會的時辰（霞飛路歌場），你的營生在那裡。${intel}`;
        if (part === '深宵') return '散場了，夜深了。';
        return intel;
    }
    return '';
}

async function main(): Promise<void> {
    const liu = new Mind('柳生春', '後台小廂房');
    const jin = new Mind('金鳳', '會樂里寓所');
    const minds = [liu, jin];

    for (let day = 1; day <= DAYS; day++) {
        for (const part of PARTS) {
            if (part === '深宵') break; // handled after the loop as reflection
            log(`\n── 第${day}日·${part} ──`);
            const together = liu.venue === jin.venue;

            // Each mind perceives the hour; if apart, acts alone; if together,
            // they EXCHANGE (alternating turns, up to 4 rounds — a real dialogue
            // between two live sessions, not fresh-context beat calls).
            const percept = (m: Mind, extra?: string): string =>
                [
                    `【第${day}日·${part}】你在${m.venue}。`,
                    together ? `${m === liu ? jin.name : liu.name}也在這裡。` : '',
                    rhythmFact(m.id, part, day),
                    extra ?? '',
                    '此刻你？',
                ]
                    .filter(Boolean)
                    .join(' ');

            if (!together) {
                const movedTo: Record<string, string | null> = {};
                for (const m of minds) {
                    const act = await m.perceiveAndAct(percept(m));
                    log(`  ${m.name} @ ${m.venue}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                    movedTo[m.id] = act.去 && VENUE_NAMES.includes(act.去) ? act.去 : null;
                    if (movedTo[m.id]) {
                        m.venue = movedTo[m.id]!;
                        log(`  → ${m.name} 動身去了 ${movedTo[m.id]}`);
                    }
                }
                // STREET SIGHTING (collision physics): both out on the town this
                // tick → each catches a far glimpse of the other; what to do with
                // it lands in their NEXT hour's heart.
                if (movedTo[liu.id] && movedTo[jin.id]) {
                    for (const m of minds) {
                        const other = m === liu ? jin : liu;
                        m.transcript.push({ role: 'user', content: `（路上你遠遠瞧見${other.name}也在街面上，往${other.venue}那頭去了。人聲車聲裡，一晃就過去了。）` });
                        m.transcript.push({ role: 'assistant', content: '（看在眼裡，記在心裡。）' });
                    }
                    log(`  〔街面〕兩人在城裡錯身而過，彼此都瞧見了。`);
                }
            } else {
                // co-located: alternating live exchange
                let speaker = liu;
                let listener = jin;
                let carry: string | undefined;
                for (let turn = 0; turn < 4; turn++) {
                    const act = await speaker.perceiveAndAct(
                        turn === 0 ? percept(speaker) : `${listener.name}${carry ?? ''} 此刻你？`,
                    );
                    log(`  ${speaker.name}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                    carry = act.說 ? `對你說：「${act.說}」（${act.做}）` : `（${act.做}）`;
                    if (act.去 && VENUE_NAMES.includes(act.去)) {
                        speaker.venue = act.去;
                        log(`  → ${speaker.name} 起身去了 ${act.去}`);
                        // the other perceives the departure
                        await listener.perceiveAndAct(`${speaker.name}起身走了，往${act.去}去。此刻你？`).then((a2) => {
                            log(`  ${listener.name}｜${a2.做}${a2.說 ? `「${a2.說}」` : ''}`);
                        });
                        break;
                    }
                    [speaker, listener] = [listener, speaker];
                }
            }
            for (const m of minds) m.save();
        }
        // 深宵 reflection — the mind talks to itself, in its own transcript.
        log(`\n── 第${day}日·深宵（各自的心） ──`);
        for (const m of minds) {
            const r = await m.reflect(day);
            log(`  〔${m.name} 夜語〕${r.slice(0, 200)}`);
            m.save();
        }
    }

    fs.writeFileSync(path.join(OUT, 'history.md'), history.join('\n'));
    console.log(`\n✅ MIND PILOT COMPLETE — 正史: ${path.join(OUT, 'history.md')}；兩顆心: mind-柳生春.json / mind-金鳳.json`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
