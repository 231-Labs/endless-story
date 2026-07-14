/**
 * FIRST NIGHT — two subjective memories negotiate one canonical 正史.
 * ============================================================================
 * Phase 1: each mind, INDEPENDENTLY (no cross-contamination), recalls the same
 *   event — their first night together. Two 解讀.
 * Phase 2: they compare notes and negotiate — what matches, what doesn't,
 *   whose memory bends. A real reconciliation, not narration.
 * Phase 3: the consensus 正史 — the version they both now認. One states it,
 *   the other confirms or amends.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/first-night.ts <runDir> <名A> <名B> <出檔>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE, VENUES } from '../agent-season/world.ts';

const [runDir, nameA, nameB, outPath] = process.argv.slice(2);
type Msg = { role: 'user' | 'assistant'; content: string };

const EXTRA = process.env.MW_EXTRA_MEMORIES
    ? (JSON.parse(fs.readFileSync(process.env.MW_EXTRA_MEMORIES, 'utf-8')) as Record<string, Array<string | { text: string }>>)
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
        ? [
              '此刻你和一個人促膝對坐，把一件舊事拼清楚。鐵規矩：只說「你自己」此刻的話與神情，不許替對方說話或走動，不許把場面往散場推，話沒說完誰也不起身。說人話，不用 JSON、不用旁白格式。',
          ]
        : ['此刻你獨自一人，在心裡回想一件事。只寫你自己記得的、你當時心裡想的，說人話，不用 JSON。'];
    return [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事（只有你自己知道）】${c.secret}`,
        `【你記得的過往】（這些是「發生過的事」，不是你的台詞。回想或說起舊事時，用你此刻的話重新講——你記得的是那件事、那個滋味，不是這幾行字句。切莫照抄下面的原句。）\n${c.memories.map((m) => `・${m.text}`).join('\n')}${memText(id).map((t) => `\n・${t}`).join('')}`,
        `【這個世界】${WORLD_PREMISE}`,
        `地方：${VENUES.map((v) => v.name).join('、')}。`,
        '',
        ...rule,
    ].join('\n');
}

async function main(): Promise<void> {
    const trA = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameA}.json`), 'utf-8')) as Msg[];
    const trB = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${nameB}.json`), 'utf-8')) as Msg[];
    const log: string[] = [`# ${nameA} × ${nameB} · 那一夜，一份都認的正史\n`];
    const sect = (h: string): void => { log.push(`\n## ${h}\n`); console.log(`\n\n═══ ${h} ═══`); };
    const say = (who: string, s: string): void => { log.push(`**${who}**：${s}\n`); console.log(`\n〔${who}〕${s}`); };

    // ── PHASE 1: independent recollection (no cross-contamination) ──
    sect('各自的解讀（互不相見）');
    const recallCue =
        `（夜深了，你一個人，忽然想起你和${'x'}頭一回同床的那一夜——那年在會樂里。從頭細細回想：那晚是怎麼起的頭？外頭什麼光景？你怎麼把她（或她怎麼把你）留下的？那一刻你心裡在想什麼、怕什麼、盼什麼？你記得哪些別人不會記得的細節？只對自己說真話。）`;
    const sysA1 = buildSystem(nameA, false);
    const sysB1 = buildSystem(nameB, false);
    trA.push({ role: 'user', content: recallCue.replace('x', nameB) });
    const memA = await llm(sysA1, trA, 900);
    trA.push({ role: 'assistant', content: memA });
    say(nameA, memA);
    trB.push({ role: 'user', content: recallCue.replace('x', nameA) });
    const memB = await llm(sysB1, trB, 900);
    trB.push({ role: 'assistant', content: memB });
    say(nameB, memB);

    // ── PHASE 2: negotiation toward consensus ──
    sect('對照與協商');
    const sysA2 = buildSystem(nameA, true);
    const sysB2 = buildSystem(nameB, true);
    const seedA =
        `多年以後的今夜，你和${nameB}頭一回並肩坐下，說起那一夜。你剛把你記得的說了；她方才說的，跟你記得的有些對得上，有些對不上——她說：「${memB}」。你聽了，哪些跟你記得的一樣，哪些不一樣？你想跟她拼對清楚——那一夜到底是怎麼回事。你此刻對她說什麼？`;
    trA.push({ role: 'user', content: seedA });
    let utter = await llm(sysA2, trA, 700);
    trA.push({ role: 'assistant', content: utter });
    say(nameA, utter);

    let sys = sysB2, tr = trB, speaker = nameB, listener = nameA;
    for (let i = 0; i < 9; i++) {
        const cue = `${listener}對你說：「${utter}」——把那一夜對照清楚，哪裡你記得不一樣就說，哪裡她說得對你就認。你此刻回她什麼？（只說你自己的，別替她走，別散場。）`;
        tr.push({ role: 'user', content: cue });
        utter = await llm(sys, tr, 700);
        tr.push({ role: 'assistant', content: utter });
        say(speaker, utter);
        if (speaker === nameB) { sys = sysA2; tr = trA; speaker = nameA; listener = nameB; }
        else { sys = sysB2; tr = trB; speaker = nameB; listener = nameA; }
    }

    // ── PHASE 3: the consensus 正史 ──
    sect('都認的正史');
    const finalCue =
        `說到這兒，那一夜你們倆對過了。如今把它拼成一個你們都認的版本——當它是要寫進正史的：那一夜到底是怎麼起的頭、怎麼過的、對你們倆意味著什麼。你來說一遍這個「都認的版本」，一段話，說完整。`;
    tr.push({ role: 'user', content: finalCue });
    const canonBy = await llm(sys, tr, 800);
    tr.push({ role: 'assistant', content: canonBy });
    say(speaker, `（提議的正史）${canonBy}`);
    // the other confirms or amends
    const otherSys = speaker === nameB ? sysA2 : sysB2;
    const otherTr = speaker === nameB ? trA : trB;
    const otherName = speaker === nameB ? nameA : nameB;
    otherTr.push({
        role: 'user',
        content: `${speaker}把你們那一夜的正史說成這樣：「${canonBy}」。這版本你認不認？有沒有一處要改、要添、要她收回的？認就說認，要改就說清楚改哪裡。`,
    });
    const confirm = await llm(otherSys, otherTr, 600);
    say(otherName, `（確認／修正）${confirm}`);

    if (outPath) fs.writeFileSync(outPath, log.join('\n'));
    console.log(`\n✅ 那一夜 · 正史議定`);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
