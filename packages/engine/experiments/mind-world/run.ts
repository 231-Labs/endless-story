/**
 * MIND WORLD — full migration: every character is a persistent agent session.
 * ============================================================================
 * Pilot-validated architecture (mind-pilot v1/v2), generalized:
 *   · Mind = one growing transcript (system = canon, once; messages = lived
 *     life verbatim). Self-compression: past budget, the mind condenses its
 *     own early days into a memoir — memory formation as self-summarization.
 *   · Postman = physics only: clock, CLUSTER-level presence (v2 gap fix:
 *     one wall apart is perceivable — 「你聽見那頭的動靜」), whereabouts intel,
 *     street sightings, occupation rhythm facts, the finale deadline.
 *   · Multi-party scenes: co-located minds hold round-robin exchanges.
 *   · 正史 = postman log; 解讀 = each transcript. Native two layers.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/run.ts <outDir>
 *
 * Env: MW_CAST='柳生春,金鳳,蘇映雪,沈雪笙,方競西'  MW_DAYS=3
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES, buildCast } from '../agent-season/world.ts';
import { VENUE_CLUSTER, clusterOf } from '../agent-season/rhythm.ts';

const OUT = path.resolve(process.argv[2] ?? 'experiments/mind-world/out');
fs.mkdirSync(OUT, { recursive: true });
const DAYS = Number(process.env.MW_DAYS ?? 3);
const CAST = (process.env.MW_CAST ?? '柳生春,金鳳,蘇映雪,沈雪笙,方競西').split(',').map((s) => s.trim());
const PARTS = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
const VENUE_NAMES = VENUES.map((v) => v.name);
/** transcript char budget before self-compression. */
const MEMOIR_AT = 24000;

type Msg = { role: 'user' | 'assistant'; content: string };
interface MindAct { 心裡: string; 做: string; 說?: string; 去?: string }

async function llmChat(system: string, messages: Msg[], maxTokens: number): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: client.defaultModel, system, messages, maxTokens, temperature: 0.85 });
    return res.text ?? '';
}

/** Occupation rhythm — generated from cast data, never hand-written per char. */
function dutyFact(occ: string, work: string, part: string, day: number): string {
    const finale = day === DAYS && (part === '黃昏' || part === '入夜');
    if (finale) return ''; // finale fact handled globally
    switch (occ) {
        case 'troupe':
            return part === '日午' || part === '晡時' ? `這個時辰班裡照例排戲吊嗓（${work}），你的營生在那裡。` : '';
        case 'geinu':
            return part === '入夜' ? `入夜是你唱堂會的時辰（${work}），你的營生在那裡。` : '';
        case 'banzhu':
            return part === '日午' || part === '晡時' || part === '黃昏' ? `這個時辰你照例在${work}坐鎮，看帳、盯排戲。` : '';
        case 'reporter':
            return part === '深宵' ? `深宵回報館趕稿（${work}），截稿是天。` : part === '清晨' ? '趕完稿天亮才睡下，晌午前起不來。' : '';
        default:
            return '';
    }
}

/** What everyone plausibly knows of each other's routines (small town). */
function intelLine(others: Mind[]): string {
    return `（你曉得旁人的日子：${others.map((o) => `${o.name}${o.routine}`).join('；')}。）`;
}

class Mind {
    readonly id: string;
    readonly name: string;
    readonly occ: string;
    readonly work: string;
    readonly routine: string;
    system: string;
    transcript: Msg[] = [];
    venue: string;

    constructor(id: string, occ: string, home: string, work: string) {
        this.id = id;
        const c = CANON[id];
        this.name = c.name;
        this.occ = occ;
        this.work = work;
        this.venue = home;
        this.routine =
            occ === 'troupe' ? `白日多在戲園排戲（${work}）` :
            occ === 'geinu' ? `入夜在${work}唱堂會、白日多在住處` :
            occ === 'banzhu' ? `白日在${work}坐鎮` :
            occ === 'reporter' ? `深宵在${work}趕稿、白日在街面採風` : '起居隨意';
        this.system = [
            `你是${c.name}（${c.role}），活在 1920 年代的上海。這不是扮演——你就是這個人，活在連續的時間裡。`,
            `【你是誰】${c.description}`,
            `【你心底的事（只有你自己知道）】${c.secret}`,
            `【你記得的過往】\n${c.memories.map((m) => `・${m.text}`).join('\n')}`,
            `【這個世界】${WORLD_PREMISE}`,
            `地方：${VENUE_NAMES.join('、')}。`,
            '',
            '【你怎麼活】你會不斷收到「此刻的感知」。每次收到，回覆你此刻真實的反應，嚴格只輸出 JSON：',
            '{"心裡":"念頭(一兩句)","做":"你客觀做了什麼(一兩句,第三人稱)","說":"說出口的話(沒有就空)","去":"要動身去的地方(留原地就空)"}',
            '規矩：話用人話說；「命/一輩子」是一生說一兩次的字；你只知道親歷親聞的事；',
            '你有自己的營生與功課，不是每個時辰都要找人；對人說話時「說」裡直接說。',
        ].join('\n');
    }

    private async maybeCompress(): Promise<void> {
        const size = this.transcript.reduce((s, m) => s + m.content.length, 0);
        if (size < MEMOIR_AT) return;
        const cut = Math.floor(this.transcript.length / 2);
        const early = this.transcript.slice(0, cut);
        const memoirPrompt: Msg[] = [
            ...early,
            { role: 'user', content: '（把以上這段日子，用你自己的話濃縮成一段回憶——留下真正刻進心裡的事、人、話。三五句。）' },
        ];
        const memoir = (await llmChat(this.system, memoirPrompt, 400)).trim();
        this.transcript = [
            { role: 'user', content: `（此前的日子，你自己記得的）${memoir}` },
            { role: 'assistant', content: '（都在心裡。）' },
            ...this.transcript.slice(cut),
        ];
    }

    async act(percept: string): Promise<MindAct> {
        await this.maybeCompress();
        this.transcript.push({ role: 'user', content: percept });
        const raw = await llmChat(this.system, this.transcript, 500);
        this.transcript.push({ role: 'assistant', content: raw });
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            const o = JSON.parse(m ? m[0] : raw) as Partial<MindAct>;
            return { 心裡: o.心裡 ?? '', 做: o.做 ?? '', 說: o.說 || undefined, 去: o.去 || undefined };
        } catch {
            return { 心裡: '', 做: raw.slice(0, 120) };
        }
    }

    async reflect(day: number): Promise<string> {
        this.transcript.push({
            role: 'user',
            content: `（夜深了，第${day}日過完。這一天在你心裡留下什麼？只對自己說，說人話——這裡不用那個 JSON 格式，直接把心裡話寫出來就好。）`,
        });
        const raw = await llmChat(this.system, this.transcript, 400);
        // De-shell: acting format leaks into reflections (```json {"心裡":…}).
        // Store the CLEAN voice in the transcript so the habit doesn't compound.
        let clean = raw.trim();
        const jsonish = clean.match(/\{[\s\S]*\}/);
        if (jsonish) {
            try {
                const o = JSON.parse(jsonish[0]) as Record<string, unknown>;
                const parts = Object.values(o).filter((v): v is string => typeof v === 'string' && v.length > 0);
                if (parts.length) clean = parts.join(' ');
            } catch {
                clean = clean.replace(/```json|```/g, '').trim();
            }
        }
        this.transcript.push({ role: 'assistant', content: clean });
        return clean;
    }

    hear(note: string): void {
        this.transcript.push({ role: 'user', content: note });
        this.transcript.push({ role: 'assistant', content: '（看在眼裡，記在心裡。）' });
    }

    save(): void {
        fs.writeFileSync(path.join(OUT, `mind-${this.id}.json`), JSON.stringify(this.transcript, null, 1));
    }
}

const history: string[] = [];
const log = (s: string): void => {
    history.push(s);
    console.log(s);
};

async function main(): Promise<void> {
    const specs = buildCast(CAST);
    const minds = specs.map((c) => new Mind(c.id, c.occupation, c.homeVenue, c.workVenue));
    const byId = new Map(minds.map((m) => [m.id, m]));

    for (let day = 1; day <= DAYS; day++) {
        for (const part of PARTS) {
            if (part === '深宵') break;
            log(`\n── 第${day}日·${part} ──`);
            const finaleFact =
                day === DAYS && (part === '黃昏' || part === '入夜')
                    ? '今夜年關大會串在雲錦台戲台開鑼——春雪社領銜，霞飛路歌場受邀助唱，滿城的人都往那兒去。'
                    : '';

            // group by venue for multi-party exchanges
            const atVenue = new Map<string, Mind[]>();
            for (const m of minds) atVenue.set(m.venue, [...(atVenue.get(m.venue) ?? []), m]);

            const moved: Mind[] = [];
            for (const [venue, group] of atVenue) {
                const others = (m: Mind): Mind[] => minds.filter((o) => o !== m);
                const nearby = (m: Mind): string => {
                    const sameCluster = minds.filter((o) => o !== m && o.venue !== m.venue && clusterOf(o.venue) === clusterOf(m.venue));
                    return sameCluster.length ? `你聽得見那頭的動靜——${sameCluster.map((o) => `${o.name}在${o.venue}`).join('、')}。` : '';
                };
                const present = (m: Mind): string => {
                    const here = group.filter((o) => o !== m);
                    return here.length ? `${here.map((o) => o.name).join('、')}也在這裡。` : '';
                };
                const percept = (m: Mind, extra?: string): string =>
                    [
                        `【第${day}日·${part}】你在${m.venue}。`,
                        present(m),
                        nearby(m),
                        dutyFact(m.occ, m.work, part, day),
                        finaleFact,
                        intelLine(others(m)),
                        extra ?? '',
                        '此刻你？',
                    ]
                        .filter(Boolean)
                        .join(' ');

                if (group.length === 1) {
                    const m = group[0];
                    const act = await m.act(percept(m));
                    log(`  ${m.name} @ ${m.venue}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                    if (act.去 && VENUE_NAMES.includes(act.去) && act.去 !== m.venue) {
                        m.venue = act.去;
                        moved.push(m);
                        log(`  → ${m.name} 動身去了 ${act.去}`);
                    }
                } else {
                    // multi-party round-robin: up to 2 rounds, everyone hears everyone
                    let carry = '';
                    let ended = false;
                    for (let round = 0; round < 2 && !ended; round++) {
                        for (const m of group) {
                            const act = await m.act(round === 0 && !carry ? percept(m) : `${carry} 此刻你？`);
                            log(`  ${m.name}｜${act.做}${act.說 ? `「${act.說}」` : ''}`);
                            carry = `${m.name}${act.說 ? `說：「${act.說}」` : ''}（${act.做}）`;
                            if (act.去 && VENUE_NAMES.includes(act.去) && act.去 !== m.venue) {
                                m.venue = act.去;
                                moved.push(m);
                                log(`  → ${m.name} 起身去了 ${act.去}`);
                                for (const o of group) if (o !== m) o.hear(`（${m.name}起身走了，往${act.去}去。）`);
                                ended = true;
                                break;
                            }
                        }
                    }
                }
            }
            // street sightings: two movers this tick glimpse each other — unless
            // they are heading to the SAME place (converging, not crossing;
            // they'll simply meet there next tick).
            for (let i = 0; i < moved.length; i++)
                for (let j = i + 1; j < moved.length; j++) {
                    if (moved[i].venue === moved[j].venue) continue;
                    moved[i].hear(`（路上你遠遠瞧見${moved[j].name}也在街面上，往${moved[j].venue}那頭去了。）`);
                    moved[j].hear(`（路上你遠遠瞧見${moved[i].name}也在街面上，往${moved[i].venue}那頭去了。）`);
                    log(`  〔街面〕${moved[i].name} 與 ${moved[j].name} 錯身而過，彼此瞧見了。`);
                }
            for (const m of minds) m.save();
        }
        log(`\n── 第${day}日·深宵（各自的心） ──`);
        for (const m of minds) {
            const r = await m.reflect(day);
            log(`  〔${m.name} 夜語〕${r.slice(0, 220)}`);
            m.save();
        }
    }
    fs.writeFileSync(path.join(OUT, 'history.md'), history.join('\n'));
    console.log(`\n✅ MIND WORLD COMPLETE — ${minds.length} 顆心 × ${DAYS} 日；正史: ${path.join(OUT, 'history.md')}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
