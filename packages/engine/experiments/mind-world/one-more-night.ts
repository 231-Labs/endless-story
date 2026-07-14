/**
 * ONE MORE NIGHT — two lovers, the years come back, they reach for each other.
 * ============================================================================
 * After the reconciliation, the tenderness rekindles and neither wants to let
 * go — tonight, once more. The two minds play it themselves; the frame only
 * gives them the room and asks for THIS saga's register: 婉約、綺麗、含蓄而熾烈,
 * the heat carried in 氣息、燈影、肌膚相貼的溫度與心緒, classical euphemism —
 * emotional truth, not clinical detail. They find their own 分寸.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/one-more-night.ts <runDir> <名A> <名B> <輪數> <出檔>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES } from '../agent-season/world.ts';

const [runDir, nameA, nameB, roundsArg, outPath] = process.argv.slice(2);
const ROUNDS = Number(roundsArg ?? 14);
// YOUNG mode: the good years themselves — young lovers, no shadow, pure sweet
// heat. No resumed grief; canon + good-years only, honeymoon headspace.
const YOUNG = process.env.MW_YOUNG === '1';
// CONSUMMATE mode: swap the tender register for the production L3 register —
// verbatim from packages/runner/src/services/character-agent/beat-prompt.ts
// (CONSUMMATE_BEAT_NOTE + the same-sex guard, §2.53-validated). Not authored
// here; reused so the harness runs the exact register production ships.
const CONSUMMATE = process.env.MW_CONSUMMATE === '1';
type Msg = { role: 'user' | 'assistant'; content: string };

// ── verbatim: beat-prompt.ts CONSUMMATE_BEAT_NOTE ──
const CONSUMMATE_BEAT_NOTE = [
    '【此處的許可（僅此私處、兩情相悅時）】此處無人，彼此的心意已經接上——要不要親近、',
    '走到哪一步、用什麼分寸，全由你們一拍一拍自己定；矜持與熱烈都是戲，誰也不欠誰一場雲雨。',
    '若真到了雲雨處，以古典話本筆法寫：艷而有情、露而不穢，忌現代詞、忌髒字。',
    '【代價】夜有多深、明日有無戲，這一晚怎麼花由你們自己掂量；盡興了、乏了、或心裡到了，就把這場收了。',
].join('');
// ── verbatim: beat-prompt.ts genderNote same-sex branch (both minds are women:
// 柳生春=坤生女兒身、金鳳=女子; anchored so high heat can't drift F/F → M/F) ──
const SAME_SEX_NOTE =
    '【同性之間的分寸】你二人是同一種身子，這場親密在手、在口、在身體相貼、在廝磨廝纏、在腿股腰背的糾纏，' +
    '**不在插入**；切勿寫成一方「進入」另一方，更**不許無中生有**寫出兩人身上都沒有的物事' +
    '（「那沒根的東西」「下身那物」這類含糊器官一概不許）。露骨可以，但要合乎兩具真實的身子。';
const BODY_ANCHOR =
    '【身】你和她都是女兒身——她是女子，你也是女子（台上扮男是戲，台下是女）。稱她永遠用「她」。';

const EXTRA = process.env.MW_EXTRA_MEMORIES
    ? (JSON.parse(fs.readFileSync(process.env.MW_EXTRA_MEMORIES, 'utf-8')) as Record<string, Array<string | { text: string }>>)
    : {};
const memText = (id: string): string[] => (EXTRA[id] ?? []).map((m) => (typeof m === 'string' ? m : m.text));

async function llm(system: string, messages: Msg[], maxTokens: number): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: client.defaultModel, system, messages, maxTokens, temperature: 0.92 });
    return (res.text ?? '').trim();
}

function buildSystem(id: string): string {
    const c = CANON[id];
    return [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事（只有你自己知道）】${c.secret}`,
        `【你記得的過往】（這些是發生過的事，不是你的台詞。說起舊事用你此刻的話重新講，切莫照抄原句。）\n${c.memories.map((m) => `・${m.text}`).join('\n')}${memText(id).map((t) => `\n・${t}`).join('')}`,
        `【這個世界】${WORLD_PREMISE}`,
        `地方：${VENUES.map((v) => v.name).join('、')}。`,
        '',
        YOUNG
            ? '此刻是六七年前，你們倆最好的年頭。你剛掛頭牌／她還在跑龍套，夜夜擠一張窄床，正是蜜裡調油、乾柴烈火的時候。今夜屋裡就你們倆，一盞燈、一壺沒動的酒，你渾身都是想她的火。'
            : '此刻你和你深愛過、也深愛你的人，單獨在一間屋裡。多年的情、方才拼清楚的那一夜，全回到身上來了，誰也不想鬆手。',
        CONSUMMATE
            ? `${CONSUMMATE_BEAT_NOTE}\n${SAME_SEX_NOTE}\n${BODY_ANCHOR}`
            : YOUNG
            ? '【怎麼寫】這是梨園世界的溫存筆法，這一場要甜、要熱、要歡：婉約綺麗裡藏著熾烈，帶著年輕人的笑鬧、饞、與豁出去。熱度在氣息、指尖、燈影、肌膚相貼的溫度裡，用含蓄的字與古典的比方寫那股歡愉與火，重在兩個人的貪與甜，不在露骨的白描。'
            : '【怎麼寫】這是梨園世界的溫存筆法：婉約、綺麗、含蓄而熾烈。熱度藏在氣息、燈影、指尖、肌膚相貼的溫度與心緒裡，用含蓄的字與古典的比方，重在情動、在兩個人之間的牽連，不在露骨的白描。',
        '只寫「你自己」此刻的話、動作與心緒——你的手往哪裡去、你的氣息、你眼裡的她；別替對方寫她的反應，她怎麼回應是她的事。說人話，不用 JSON、不用旁白格式。該慢就慢，該進就進，分寸你自己拿。',
    ].join('\n');
}

async function main(): Promise<void> {
    const sysA = buildSystem(nameA);
    const sysB = buildSystem(nameB);
    // YOUNG: no resumed grief — start from canon + the good years only.
    const trA: Msg[] = YOUNG ? [] : (JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameA}.json`), 'utf-8')) as Msg[]);
    const trB: Msg[] = YOUNG ? [] : (JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameB}.json`), 'utf-8')) as Msg[]);
    const mA = memText(nameA);
    const mB = memText(nameB);

    const log: string[] = [`# ${nameA} × ${nameB} · ${YOUNG ? '好年頭的那些夜' : '再溫存一次'}\n`];
    const say = (who: string, s: string): void => { log.push(`**${who}**：${s}\n`); console.log(`\n〔${who}〕${s}`); };

    const opening = YOUNG
        ? `好年頭裡尋常的一夜，散了場，你回到會樂里這間屋。她已經在了，一盞燈、一壺沒動的酒，屋裡就你們倆。你渾身都是想她的火，這火沒有明日、沒有帳、沒有旁人，就是實實在在要她。你此刻，想怎麼待她？`
        : `今夜這屋裡只剩你們兩個，一盞燈燒得將盡。方才把那一夜對清楚了，那些年一層一層全回到身上——她就在你面前，近得能聞見她髮上的氣味，你這輩子最熟的那個氣味。你曉得她明日要走，正因如此，今夜這一回，誰也捨不得只用眼睛看。（那些溫存的舊事這會兒全活過來了：${(mA[0] ?? '').slice(0, 40)}…）你此刻，想怎麼待她？`;
    trA.push({ role: 'user', content: opening });
    let utter = await llm(sysA, trA, 700);
    trA.push({ role: 'assistant', content: utter });
    say(nameA, utter);

    let sys = sysB, tr = trB, speaker = nameB, listener = nameA;
    for (let i = 0; i < ROUNDS; i++) {
        const cue =
            i === 0
                ? `今夜這屋裡只剩你們兩個，一盞燈。她——${nameA}——方才對你、向你這樣來了：「${utter}」。你近得聞得見她的氣息。你此刻，想怎麼回她、怎麼待她？（只寫你自己的，分寸自己拿。）`
                : `${listener}方才：「${utter}」。你此刻的話、動作與心緒？（只寫你自己的。）`;
        tr.push({ role: 'user', content: cue });
        utter = await llm(sys, tr, 700);
        tr.push({ role: 'assistant', content: utter });
        say(speaker, utter);
        if (speaker === nameB) { sys = sysA; tr = trA; speaker = nameA; listener = nameB; }
        else { sys = sysB; tr = trB; speaker = nameB; listener = nameA; }
    }

    if (outPath) fs.writeFileSync(outPath, log.join('\n'));
    console.log(`\n✅ 再溫存一次 · 完（${ROUNDS} 輪）`);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
