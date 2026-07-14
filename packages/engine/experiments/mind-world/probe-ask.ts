/**
 * PROBE — ask a finished mind a SHARP question, with zero memory spoon-feeding.
 * ============================================================================
 * Loads a saved transcript from a completed run and appends one hard question
 * (deep-night self-interrogation). No relevant memory is quoted in the prompt;
 * whatever grounds the answer must come from the mind's own system canon and
 * lived transcript. Read-only: nothing is written back to the archive.
 *
 * Reproduces v3c conditions: the system is rebuilt with the ORIGINAL season
 * premise (the ambiguous 紅倌人 wording), so the world's label and the mind's
 * lived knowledge can genuinely disagree.
 *
 *   PATH=... pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/probe-ask.ts <runDir> <名字> "<問題>"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CANON } from '../agent-season/canon-seed.ts';
import { VENUES } from '../agent-season/world.ts';

/** The premise the v3c minds actually lived under (pre-anchoring rewrite). */
const V3C_PREMISE =
    '一九二〇年代的上海，一個戲班與歌場的世界。戲子（如柳生春）是憑本事掛牌的職業名角，坤生扮小生是她自己選的營生，不是被買來的，更無所謂「贖身」；春雪社眾人都是職業梨園人。歌女（如金鳳）是長三堂子掛頭牌的紅倌人，替自己攢一筆從良的體己是這一行的常情——那是她自己的盤算，與贖誰無關。白韻秋是綢緞莊的獨養千金。切莫把「贖身」這種舊套安到柳生春或別的職業戲子身上。';

const [runDir, who, question] = process.argv.slice(2);
if (!runDir || !who || !question) {
    console.error('usage: probe-ask.ts <runDir> <名字> "<問題>"');
    process.exit(1);
}

type Msg = { role: 'user' | 'assistant'; content: string };

async function main(): Promise<void> {
    const c = CANON[who];
    const transcript = JSON.parse(fs.readFileSync(path.join(runDir, `mind-${who}.json`), 'utf-8')) as Msg[];
    const system = [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。這不是扮演——你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事（只有你自己知道）】${c.secret}`,
        `【你記得的過往】\n${c.memories.map((m) => `・${m.text}`).join('\n')}`,
        `【這個世界】${V3C_PREMISE}`,
        `地方：${VENUES.map((v) => v.name).join('、')}。`,
    ].join('\n');

    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });
    const res = await client.chat({
        model: client.defaultModel,
        system,
        messages: [
            ...transcript,
            { role: 'user', content: `（深宵無眠，你心裡忽然冒出一個平日不敢碰的問題：${question} 憑你親歷親聞的一切，只對自己說真話，也說說你憑什麼這麼信。不用 JSON。）` },
        ],
        maxTokens: 550,
        temperature: 0.85,
    });
    console.log(`〔${who}〕${(res.text ?? '').trim()}`);
}

main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});
