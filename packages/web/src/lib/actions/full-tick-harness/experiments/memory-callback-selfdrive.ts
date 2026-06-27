/**
 * 種子記憶 · 語境召回的回聲 — can seeded, anchored initial memories resurface CONTEXTUALLY and
 * colour a POV long after the main event resolved? 白韻秋 was gently refused; some 元宵 later she walks
 * the 戲園前街 alone. Two runs of the SAME scene/state:
 *   A 無種子記憶（對照）— she just sees the 花燈, no history
 *   B 有種子記憶 — seeded with 初遇(那年元宵、戲園前街、滿堂彩、回頭一眼)+ the refusal + DISTRACTORS
 *                  (綢緞莊、童年). If her POV weaves the 元宵/街 memory (and NOT the 綢緞 distractor),
 *                  the contextual-recall-into-POV texture works: the right past surfaces for the place.
 *
 * In the real loop the three-factor recall (semantic+recency+importance) PICKS which seeded memory
 * surfaces; here we hand POV a memory set incl. distractors and watch it pick the context-fit one to
 * weave (the IRON_RULE「化用記憶當血肉」). Genesis-memory seeding is the parked backlog piece.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/memory-callback-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

const SOUL: characterWorker.SagaSoul = {
    toneRegister: '霞飛路洋場閨閣的質地：花燈、綢緞、香片、座鐘；嬌養裡的一點悵惘與藏不住的真心。',
    emotionalStance: 'tender',
};
const BAI: characterWorker.CharacterSnapshot = {
    id: '0xbai', name: '白韻秋', role: '—', gender: '女', ageYears: 20, sagaName: '霞飛路', sceneName: '戲園前街',
    physicalFacts: '霞飛路綢緞大莊的獨養千金，嬌憨心細、家境闊綽卻體面不仗勢；迷柳生春，曾誠懇求她同行被婉拒，未再糾纏。',
    attributes: { appearance: 78, constitution: 64, acuity: 70, disposition: 70 },
};
const STATE: characterWorker.CharacterState = { hunger: 0.2, fatigue: 0.2, mood: -0.3, note: '被柳生春婉拒後過了些時日；又逢元宵，你獨自走過雲錦台前那條戲園前街。' };

// seeded initial memories — anchored to 元宵 / 戲園前街 / 初遇, plus the refusal, plus DISTRACTORS
const SEEDED = [
    '那年元宵，你頭一回在雲錦台看柳生春唱《遊園》，滿堂彩，看得你魂都飛了；散戲後你在這條戲園前街等她，遠遠望著她卸了妝、被師姐摟著走出來，你沒敢上前，只記住了她臨上車回頭那一眼。',
    '後來你連著捧了她半年的場，送點心、下帖子，她總是淡淡的。',
    '上回你鼓起勇氣對她說「我養您」，她只道戲還沒唱完，婉拒了你；你尊重她，沒再糾纏。',
    '你家綢緞莊新到一批上好的杭緞，父親誇你眼光獨到。', // 無關干擾
    '你打小嬌養，要什麼有什麼；只柳生春這一樁，是頭一回錢買不來的東西。',
];

const TRIG = '又是一年元宵。霞飛路上花燈如晝、笙歌喧闐，你獨自一人，信步走過雲錦台前那條戲園前街。';

async function chatRetry(client: ReturnType<typeof llmText.createTextClient>, req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}

async function gen(client: ReturnType<typeof llmText.createTextClient>, model: string, mems: string[]): Promise<string> {
    const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
    const user = characterWorker.buildPovUserPrompt({ character: BAI, triggerNarrative: TRIG, recentMemorySnippets: mems, relationshipHints: ['對柳生春：你誠懇求過、被婉拒、未再糾纏的人。'], state: STATE });
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1100, temperature: 0.84 });
    return r.text.trim();
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 種子記憶的回聲 · 同一場元宵戲園前街 · A 無記憶 / B 有種子記憶\n`);

    console.log(`━━━━ A · 無種子記憶（對照）━━━━\n${await gen(client, model, [])}\n`);
    console.log(`━━━━ B · 有種子記憶（初遇＋婉拒＋綢緞干擾）━━━━\n${await gen(client, model, SEEDED)}\n`);

    console.log('看:① B 是否自己浮出「那年元宵、這條街上等她、回頭那一眼」的回聲;② 婉拒之後她是否仍因這時這地想起柳生春(苦甜);③ B 是否只挑了元宵/街那條記憶織入、沒去碰綢緞莊那條無關的(語境召回的選擇性);④ A 對照下有多平。');
}

main().catch((e) => { console.error(e); process.exit(1); });
