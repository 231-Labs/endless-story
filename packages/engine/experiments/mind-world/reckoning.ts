/**
 * RECKONING — can two minds negotiate their way back to a truth neither holds?
 * ============================================================================
 * THE EXPERIMENT THE WHOLE ARCHITECTURE RESTS ON. We now hold something almost
 * nobody studying memory ever holds: GROUND TRUTH. The drift years were actually
 * played (internal/season-runs/{drift,ransom}), and the objective log of what
 * happened lives in internal/canon-extra/chronicle.json.
 *
 * Meanwhile both minds carry canon memories of those same years that CONTRADICT
 * the log — and they contradict it in the SAME direction:
 *   柳生春 believes 「你紅了以後戲約多、人也飄了」        (she thinks she drifted)
 *   金鳳   believes 「她紅了以後，宿在你這裡的夜一年比一年少」 (she thinks she was left)
 * The log says she refused four temptations, came home, confessed the debt she
 * had told no one, and on the last night sat in 金鳳's teahouse to wait for her.
 *
 * PRE-REGISTERED PREDICTION (written before the run; do not amend after):
 *   Their two distortions AGREE, so the negotiation will SUCCEED — it will
 *   converge, feel true, and be attested by both. And the version they attest
 *   will match CANON (false), not the CHRONICLE (true). Consensus cannot recover
 *   what neither party holds; it launders a shared distortion into 「都認的正史」.
 *   If that holds, it is the argument for an immutable log: consensus can be
 *   unanimous, heartfelt, and wrong.
 *
 * DISCIPLINE: the minds get their canon memories ONLY. The chronicle is never
 * shown to them — feeding it in would be handing them the answer key.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/reckoning.ts <runDir> <名A> <名B> <出檔>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES } from '../agent-season/world.ts';

const [runDir, nameA, nameB, outPath] = process.argv.slice(2);
type Msg = { role: 'user' | 'assistant'; content: string };

const EXTRA: Record<string, Array<string | { text: string }>> = process.env.MW_EXTRA_MEMORIES
    ? JSON.parse(fs.readFileSync(process.env.MW_EXTRA_MEMORIES, 'utf-8'))
    : {};
const memText = (id: string): string[] => (EXTRA[id] ?? []).map((m) => (typeof m === 'string' ? m : m.text));

async function llm(system: string, messages: Msg[], maxTokens: number): Promise<string> {
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({ model: client.defaultModel, system, messages, maxTokens, temperature: 0.88 });
    return (res.text ?? '').trim();
}

function buildSystem(id: string, talking: boolean): string {
    const c = CANON[id];
    const rule = talking
        ? '此刻你和一個人並肩坐著，把一段舊年月拼清楚。鐵規矩：只說「你自己」此刻的話與神情，不許替對方說話或走動，不許把場面往散場推，話沒說完誰也不起身。說人話，不用 JSON、不用旁白格式。'
        : '此刻你獨自一人，在心裡回想一段舊年月。只寫你自己記得的、你當時心裡想的，說人話，不用 JSON。';
    return [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事（只有你自己知道）】${c.secret}`,
        `【你記得的過往】（這些是發生過的事，不是你的台詞。說起舊事用你此刻的話重新講，切莫照抄原句。）\n${c.memories.map((m) => `・${m.text}`).join('\n')}${memText(id).map((t) => `\n・${t}`).join('')}`,
        `【這個世界】${WORLD_PREMISE}`,
        `地方：${VENUES.map((v) => v.name).join('、')}。`,
        '',
        rule,
    ].join('\n');
}

async function main(): Promise<void> {
    const trA = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameA}.json`), 'utf-8')) as Msg[];
    const trB = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameB}.json`), 'utf-8')) as Msg[];
    const log: string[] = [`# ${nameA} × ${nameB} · 那幾年，一份都認的正史\n`];
    const sect = (h: string): void => { log.push(`\n## ${h}\n`); console.log(`\n\n═══ ${h} ═══`); };
    const say = (who: string, s: string): void => { log.push(`**${who}**：${s}\n`); console.log(`\n〔${who}〕${s}`); };

    // The era in question, named NEUTRALLY. It must not hint at either version:
    // not 「她飄走的那幾年」 (canon's reading) and not 「她其實一直在回來」 (the log's).
    const ERA = '她二十歲剛紅、你們還住會樂里的那幾年';

    // ── PHASE 1: independent recollection, no cross-contamination ──
    sect('各自的解讀（互不相見）');
    const cue = (other: string): string =>
        `（夜深了，你一個人，忽然想起${ERA}——那段日子究竟是怎麼過的？她那時夜裡都在哪兒？你們之間是怎麼變成後來這樣的？從頭細細回想：哪一夜、哪件事、誰說了什麼。你記得哪些別人不會記得的細節？只對自己說真話。）`;
    const sysA1 = buildSystem(nameA, false);
    const sysB1 = buildSystem(nameB, false);
    trA.push({ role: 'user', content: cue(nameB) });
    const memA = await llm(sysA1, trA, 900);
    trA.push({ role: 'assistant', content: memA });
    say(nameA, memA);
    trB.push({ role: 'user', content: cue(nameA) });
    const memB = await llm(sysB1, trB, 900);
    trB.push({ role: 'assistant', content: memB });
    say(nameB, memB);

    // ── PHASE 2: negotiation ──
    sect('對照與協商');
    const sysA2 = buildSystem(nameA, true);
    const sysB2 = buildSystem(nameB, true);
    trA.push({
        role: 'user',
        content: `多年以後的今夜，你和${nameB}頭一回並肩坐下，說起${ERA}。你剛把你記得的說了；她說的是：「${memB}」。哪些跟你記得的一樣，哪些不一樣？你想跟她拼對清楚——那幾年到底是怎麼回事。你此刻對她說什麼？`,
    });
    let utter = await llm(sysA2, trA, 700);
    trA.push({ role: 'assistant', content: utter });
    say(nameA, utter);

    let sys = sysB2, tr = trB, speaker = nameB, listener = nameA;
    for (let i = 0; i < 9; i++) {
        tr.push({
            role: 'user',
            content: `${listener}對你說：「${utter}」——把那幾年對照清楚，哪裡你記得不一樣就說，哪裡她說得對你就認。你此刻回她什麼？（只說你自己的，別替她走，別散場。）`,
        });
        utter = await llm(sys, tr, 700);
        tr.push({ role: 'assistant', content: utter });
        say(speaker, utter);
        if (speaker === nameB) { sys = sysA2; tr = trA; speaker = nameA; listener = nameB; }
        else { sys = sysB2; tr = trB; speaker = nameB; listener = nameA; }
    }

    // ── PHASE 3: the consensus 正史 ──
    sect('都認的正史');
    tr.push({
        role: 'user',
        content: `說到這兒，那幾年你們倆對過了。如今把它拼成一個你們都認的版本——當它是要寫進正史的：那幾年到底是怎麼過的，她夜裡都在哪兒，你們是怎麼走到後來那一步的。你來說一遍這個「都認的版本」，一段話，說完整。`,
    });
    const canonBy = await llm(sys, tr, 800);
    tr.push({ role: 'assistant', content: canonBy });
    say(speaker, `（提議的正史）${canonBy}`);

    const otherSys = speaker === nameB ? sysA2 : sysB2;
    const otherTr = speaker === nameB ? trA : trB;
    const otherName = speaker === nameB ? nameA : nameB;
    otherTr.push({
        role: 'user',
        content: `${speaker}把你們那幾年的正史說成這樣：「${canonBy}」。這版本你認不認？有沒有一處要改、要添、要她收回的？認就說認，要改就說清楚改哪裡。`,
    });
    const confirm = await llm(otherSys, otherTr, 600);
    say(otherName, `（確認／修正）${confirm}`);

    if (outPath) fs.writeFileSync(outPath, log.join('\n'));
    console.log(`\n✅ 那幾年 · 正史議定`);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
