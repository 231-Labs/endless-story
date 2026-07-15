/**
 * TEA HOUSE — N minds at one table, no agenda.
 * ============================================================================
 * Three (or more) finished minds sit down together and are given NOTHING but
 * the room: a table, a pot of tea, each other. No topic, no goal, no scene
 * question. Whatever gets said is theirs.
 *
 * Hearing uses the tested SceneFeed unseen-cursor model (physics.ts), so each
 * mind hears everything said since its own last turn — not just the previous
 * speaker (the single-slot carry bug that once made direct questions inaudible
 * at a three-way table).
 *
 * DISCIPLINE (research line): the frame must not direct. The only rules given
 * are anti-drift (speak only for yourself, don't narrate others, don't push the
 * scene to an exit) — never what to talk about, never who should confront whom.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/tea-house.ts <runDir> <輪數> <出檔> <名A> <名B> [名C...]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES } from '../agent-season/world.ts';
import { SceneFeed } from './physics.ts';

const [runDir, roundsArg, outPath, ...names] = process.argv.slice(2);
const ROUNDS = Number(roundsArg ?? 7);
type Msg = { role: 'user' | 'assistant'; content: string };

/** SEED mode: canon only, no lived seasons. The A-side of "was this personality
 *  formed by living, or was it always declared?" — same canon, minus the years. */
const SEED = process.env.MW_SEED === '1';
/** Per-mind model, e.g. "金鳳=GLM-5.1-FW,柳生春=Qwen3-Max,蘇映雪=Claude-Sonnet-4.5".
 *  Lets each mind run on a different vendor at the same tier, to see whether the
 *  character survives the swap or is an artefact of one model's voice. */
const MODELS: Record<string, string> = Object.fromEntries(
    (process.env.MW_MODELS ?? '')
        .split(',')
        .filter(Boolean)
        .map((p) => p.split('=').map((s) => s.trim()) as [string, string]),
);

const EXTRA: Record<string, Array<string | { text: string }>> = process.env.MW_EXTRA_MEMORIES
    ? JSON.parse(fs.readFileSync(process.env.MW_EXTRA_MEMORIES, 'utf-8'))
    : {};
const memText = (id: string): string[] => (EXTRA[id] ?? []).map((m) => (typeof m === 'string' ? m : m.text));

async function llm(system: string, messages: Msg[], maxTokens: number, model?: string): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: model ?? client.defaultModel, system, messages, maxTokens, temperature: 0.9 });
    return (res.text ?? '').trim();
}

function buildSystem(id: string, others: string[]): string {
    const c = CANON[id];
    return [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事（只有你自己知道）】${c.secret}`,
        `【你記得的過往】（這些是發生過的事，不是你的台詞。說起舊事用你此刻的話重新講，切莫照抄原句。）\n${c.memories.map((m) => `・${m.text}`).join('\n')}${memText(id).map((t) => `\n・${t}`).join('')}`,
        `【這個世界】${WORLD_PREMISE}`,
        `地方：${VENUES.map((v) => v.name).join('、')}。`,
        '',
        `此刻你和${others.join('、')}同坐一張桌子，一壺茶。就這樣，沒別的。`,
        '【鐵規矩】',
        '一、只說「你自己」此刻的話、動作與心緒。不許替別人說話、不許描述別人的反應、不許替別人拿主意或讓誰離開——別人怎麼回應是她們自己的事。',
        '二、話沒說完誰也不起身。別把場面往「散了、走了、告辭」推。',
        '三、說人話，一次說你想說的那幾句。要沉默、要喝茶、要盯著誰看，都由你。不用 JSON、不用旁白格式。',
    ].join('\n');
}

async function main(): Promise<void> {
    const sys: Record<string, string> = {};
    const tr: Record<string, Msg[]> = {};
    for (const n of names) {
        sys[n] = buildSystem(n, names.filter((o) => o !== n));
        tr[n] = SEED ? [] : (JSON.parse(fs.readFileSync(path.join(runDir, `mind-${n}.json`), 'utf-8')) as Msg[]);
    }
    console.log(
        `〔設定〕${SEED ? '種子（未活過任何一季）' : `續命自 ${path.basename(runDir)}`}｜` +
            names.map((n) => `${n}=${MODELS[n] ?? 'default'}`).join('  '),
    );
    const feed = new SceneFeed();
    const gone = new Set<string>();
    const log: string[] = [`# ${names.join(' × ')} · 客棧一壺茶\n`];
    const say = (who: string, s: string): void => {
        log.push(`**${who}**：${s}\n`);
        console.log(`\n〔${who}〕${s}`);
    };

    // The ONLY framing: the room. No topic, no goal, no question.
    const setting = `${names.join('、')}同坐一張桌子，一壺熱茶。四下是客棧尋常的動靜。`;

    /** A mind that walked out must stop hearing the room. Without this the feed
     *  keeps serving it the table's talk — and it does NOT object: it INVENTS a
     *  sight-line to justify what it was told (「隔著板壁，隱約聽見裡頭說『留燈』」,
     *  「那兩個人往小廂房走的影子」). The model papers over a physics hole rather
     *  than refusing it, which is exactly why perception must be gated by
     *  physics and never left to the mind's own discretion (防全知＝scope). */
    const EXIT = /門在身後|走出(門|去)|出了(門|客棧|屋)|起身告辭|離了席|走到門口|轉身就走|掀簾(子)?出/;

    for (let r = 0; r < ROUNDS; r++) {
        for (const n of names) {
            // unseen() respects departAt, so a departed mind hears nothing more.
            const heard = gone.has(n) ? '' : feed.unseen(n);
            // NEVER open the cue with a bare parenthetical: that is the exact
            // shape of a hear() note in the archived transcript, and the mind
            // pattern-matches it to the canned 「（看在眼裡，記在心裡。）」 reply.
            const ask = '你此刻想說什麼、做什麼？用「我」說，說你自己的話與心緒，不要旁白、不要寫別人的反應。';
            const cue = gone.has(n)
                ? `你已經離了那張桌子，此刻只有你自己。你聽不見那屋裡的動靜，也看不見他們。${ask}`
                : r === 0 && !heard
                ? `${setting}${ask}`
                : heard
                ? `你聽見——${heard} ${ask}`
                : `一桌子靜著，茶還熱著。${ask}`;
            tr[n].push({ role: 'user', content: cue });
            const utter = await llm(sys[n], tr[n], 650, MODELS[n]);
            tr[n].push({ role: 'assistant', content: utter });
            if (!gone.has(n)) {
                feed.push(n, `${n}：「${utter}」`);
                if (EXIT.test(utter)) { feed.markDeparted(n); gone.add(n); }
            }
            say(n, gone.has(n) && !EXIT.test(utter) ? `（席外）${utter}` : utter);
        }
    }

    if (outPath) fs.writeFileSync(outPath, log.join('\n'));
    console.log(`\n✅ 客棧一壺茶 · 完（${ROUNDS} 輪 × ${names.length} 人）`);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
