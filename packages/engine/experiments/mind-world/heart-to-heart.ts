/**
 * HEART-TO-HEART — an uncapped two-mind conversation, recall live.
 * ============================================================================
 * Puts two finished minds alone in a charged, intimate scene and lets them
 * talk as long as they want — no round cap, no token squeeze, free voice (not
 * the acting JSON). The good-years memories surface at the charged opening
 * (arousal high → the unforgettable floods back clear), then the two carry the
 * conversation themselves. Read-only: nothing written back to the archive.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/heart-to-heart.ts <runDir> <名A> <名B> <輪數> <出檔>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES } from '../agent-season/world.ts';

const [runDir, nameA, nameB, roundsArg, outPath] = process.argv.slice(2);
const ROUNDS = Number(roundsArg ?? 16);
type Msg = { role: 'user' | 'assistant'; content: string };

const EXTRA = process.env.MW_EXTRA_MEMORIES
    ? (JSON.parse(fs.readFileSync(process.env.MW_EXTRA_MEMORIES, 'utf-8')) as Record<string, Array<string | { text: string }>>)
    : {};
const memText = (id: string): string[] => (EXTRA[id] ?? []).map((m) => (typeof m === 'string' ? m : m.text));

async function llm(system: string, messages: Msg[], maxTokens: number): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: client.defaultModel, system, messages, maxTokens, temperature: 0.9 });
    return (res.text ?? '').trim();
}

function buildSystem(id: string): string {
    const c = CANON[id];
    return [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事（只有你自己知道）】${c.secret}`,
        `【你記得的過往】（這些是「發生過的事」，不是你的台詞。說起舊事時，用你此刻的話重新講——你記得的是那件事、那個滋味，不是這幾行字句。切莫照抄下面的原句。）\n${c.memories.map((m) => `・${m.text}`).join('\n')}${memText(id).map((t) => `\n・${t}`).join('')}`,
        `【這個世界】${WORLD_PREMISE}`,
        `地方：${VENUES.map((v) => v.name).join('、')}。`,
        '',
        '此刻你和一個人促膝對坐，把心裡話說開。鐵規矩：',
        '一、只說「你自己」此刻的話與神情。不許替對方說話、不許描述對方的動作、不許替對方拿主意或讓對方離開——對方怎麼回應，是她自己的事，不歸你寫。',
        '二、今夜就是坐著把話說清楚，不是道別、不是送行。別把場面往「起身、走了、上船、散了」推。話沒說完，誰也不起身。',
        '三、說人話，一次說你想說的那幾句就好，該沉默、該落淚、該伸手，都由你，但別替對方收場。不用 JSON、不用旁白格式。',
    ].join('\n');
}

async function main(): Promise<void> {
    const sysA = buildSystem(nameA);
    const sysB = buildSystem(nameB);
    const trA = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameA}.json`), 'utf-8')) as Msg[];
    const trB = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameB}.json`), 'utf-8')) as Msg[];

    // charged opening: her last night before sailing; recall floods (unforgettable → clear)
    const memA = memText(nameA);
    const memB = memText(nameB);
    // MW_SETTING overrides the scene; MW_FIRST forces A's opening line verbatim
    // (used when the question itself is the experiment — 「怎麼樣你才會回來」).
    const setting =
        process.env.MW_SETTING ??
        `南洋的船票遞到${nameB}手上了，她還沒點頭。今夜她把${nameA}叫到會樂里的屋裡，趁著還沒拿定主意，想把這些年掏出來說清楚。一盞燈，一壺沒怎麼動的酒，你們倆促膝對坐，誰也沒急著走。四下靜下來的這一刻，那些年一下子全回來了，清清楚楚，像是刻下的：`;
    const sceneA = `（${setting}${memA[0] ?? ''}）你此刻對坐在你面前的${nameB}，想開口說什麼？（記住：只說你自己的，別替她走。）`;
    const sceneB = `（${setting}${memB[0] ?? ''}）${nameA}對坐在你面前。你此刻想開口說什麼？（記住：只說你自己的，別替她走。）`;

    const log: string[] = [`# ${nameA} × ${nameB} · ${process.env.MW_TITLE ?? '促膝長談（她走前最後一夜）'}\n`];
    const say = (who: string, s: string): void => {
        log.push(`**${who}**：${s}\n`);
        console.log(`\n〔${who}〕${s}`);
    };

    // MW_FIRST: A's opening is fixed verbatim rather than generated. Only for
    // probes where the QUESTION is the experiment and must be asked exactly —
    // B's answer stays entirely B's.
    let utter: string;
    if (process.env.MW_FIRST) {
        utter = process.env.MW_FIRST;
        trA.push({ role: 'user', content: sceneA });
        trA.push({ role: 'assistant', content: utter });
    } else {
        trA.push({ role: 'user', content: sceneA });
        utter = await llm(sysA, trA, 800);
        trA.push({ role: 'assistant', content: utter });
    }
    say(nameA, utter);

    let speakerSys = sysB, speakerTr = trB, speakerName = nameB, listenerName = nameA, opened = false;
    for (let i = 0; i < ROUNDS; i++) {
        const cue = !opened
            ? `${sceneB} ——${nameA}先開了口，對你說：「${utter}」你此刻想回她的話與神情？（只說你自己的，別替她走、別把今夜往散場推。）`
            : `${listenerName}對你說：「${utter}」你此刻想回她的話與神情？（只說你自己的，別替她走、別把今夜往散場推，話沒說完誰也不起身。）`;
        opened = true;
        speakerTr.push({ role: 'user', content: cue });
        utter = await llm(speakerSys, speakerTr, 800);
        speakerTr.push({ role: 'assistant', content: utter });
        say(speakerName, utter);
        // swap
        if (speakerName === nameB) { speakerSys = sysA; speakerTr = trA; speakerName = nameA; listenerName = nameB; }
        else { speakerSys = sysB; speakerTr = trB; speakerName = nameB; listenerName = nameA; }
        if (/^\s*（?.{0,6}$/.test(utter) && i > 4) break; // trailed to silence
    }

    if (outPath) fs.writeFileSync(outPath, log.join('\n'));
    console.log(`\n✅ 促膝長談完（${ROUNDS} 輪）`);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
