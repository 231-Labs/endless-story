/**
 * 豐厚人物 · 曖昧關係 — the same 白韻秋 good-offer scene, but 柳生春 is no longer a single-pole
 * 黏師姐 automaton: she gets a FULL self (戲痴 / 第一女小生志向暗流 / 怕老怕被後浪蓋 / 師父「戲比天大」/
 * her own weariness) + multi-pole seeded memories, and the 柳↔蘇 bond is reframed from a single
 * `romance/戀慕` label into the SPECIAL 生旦 in-between: 姊妹/知己/老搭檔/戲假情真/近乎情愛卻不全是,
 * 誰也不點破. The test: (1) does 柳生春 now weigh the offer with her WHOLE life (art, ambition, fear,
 * the troupe) rather than just 暖湯 vs 洋點心, and could she plausibly hesitate / even consider it?
 * (2) does 柳↔蘇 read as the special in-between rather than 情侶?
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/rich-character-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。', emotionalStance: 'tender' };

// the good-白韻秋 offer, as the shared objective beats
const BEATS = [
    '白韻秋：沒帶銀票也沒遞帖子，獨自來，怯怯地說只有幾句體己話想單獨同柳生春說。',
    '柳生春：散戲乏著，懶懶應，既沒帶銀票，有話便說。',
    '蘇映雪：把行頭往桌上一擱，側身擋在柳生春前頭，端茶遞給白韻秋，要她潤了喉慢慢說。',
    '白韻秋：我想接柳老闆出去，不用再唱了、不用再受這份累，我置辦了宅子清清靜靜，您願意就走，不願意只當我沒來過——我養您。',
];
const TRIG = '散戲後台，好人白韻秋沒帶帖子銀票，獨自來把藏了許久的真心、和一個讓你不必再這麼累的邀約誠懇說了；她不逼你，要不要全憑你。師姐蘇映雪在一旁。';

// 柳生春 — a FULL person, many poles; 師姐 is one (big) part, NOT the sun she orbits.
const LIU: characterWorker.CharacterSnapshot = {
    id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '後台妝閣',
    physicalFacts: '春雪社當紅女小生（坤生）。七歲坐科、挨過打、熬過倒倉，憑真功夫熬到今天。瘦高、帥美，台上風流不羈的少年郎、享受台下目光，台下其實嬌軟。',
    attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 },
};
const LIU_STATE: characterWorker.CharacterState = { hunger: 0.3, fatigue: 0.6, mood: 0, note: '你對這門戲痴到骨子裡，暗暗想熬成第一女小生；你也怕老、怕被後浪蓋過。戲班又累又緊，這份邀約是真能讓你歇。你是個有自己一整個世界的人，不為任何人而活。' };
const LIU_MEM = [
    '十六歲那年你唱紅《白蛇》，頭一回滿堂彩，那聲浪你記了一輩子——你是真愛這門戲，愛到骨頭裡。',
    '師父臨終把這把摺扇交到你手裡，只說「戲比天大」，你至今沒敢忘。',
    '你看著當年的第一女小生鄭月卿一年年被後浪蓋過、戲份一點點挪走，你怕那天也輪到你——你還沒熬到頂呢。',
    '戲班的日子又累又緊，趕場趕到吐血你也咬牙撐過；可夜深時你也問過自己，這麼熬，圖的到底是什麼。',
    '你跟師姐搭《驚夢》那回，台上她的杜麗娘看你的眼神，你到散場都分不清那是戲、是親、還是別的；你也沒去細想，只覺得這世上她最懂你。',
];
const LIU_REL = ['對蘇映雪：你的師姐，打小一塊兒坐科、搭了七八年的生旦，台上演過千百回的杜麗娘與柳夢梅。你倆說不清——像姊妹、像知己、像最默契的老搭檔，又有一層誰也不點破、戲假情真、近乎情愛卻又不全是的牽絆。她最懂你、你最放不下她，但你不是為她而活。', '對白韻秋：一個真心待你、看懂你辛苦的好人。'];

// 蘇映雪 — her side of the same ambiguous bond, NOT framed as 戀慕小郎君.
const SU: characterWorker.CharacterSnapshot = {
    id: '0xsu', name: '蘇映雪', role: '花旦', gender: '女', ageYears: 26, sagaName: '春雪社', sceneName: '後台妝閣',
    physicalFacts: '春雪社台柱花旦，端莊明麗、會圓場；和柳生春搭了七八年生旦。', attributes: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 },
};
const SU_STATE: characterWorker.CharacterState = { hunger: 0.3, fatigue: 0.4, mood: -0.3, note: '白韻秋是個好人，給的是真心和安穩；你捨不得生春被分走，可那捨不得裡是什麼，你自己也沒去認。' };
const SU_REL = ['對柳生春：你的師妹，打小一塊兒坐科、搭了七八年的生旦。你護她疼她，那情分裡有姊妹、有知己、有戲假情真、有一層你自己都不去細認的東西——你只當是「捨不得她被旁人分走」，從沒往「愛」那個字上去想。', '對白韻秋：一個你恨不起來的、真心的好人。'];

async function chatRetry(client: ReturnType<typeof llmText.createTextClient>, req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}
async function pov(client: ReturnType<typeof llmText.createTextClient>, model: string, snap: characterWorker.CharacterSnapshot, st: characterWorker.CharacterState, rel: string[], mem: string[]): Promise<string> {
    const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
    const user = characterWorker.buildPovUserPrompt({ character: snap, triggerNarrative: TRIG, recentMemorySnippets: mem, relationshipHints: rel, sceneBeats: BEATS, state: st });
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1300, temperature: 0.85 });
    return r.text.trim();
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 豐厚的柳生春 + 曖昧的生旦牽絆 · 面對好人白韻秋的邀約\n`);

    console.log(`━━━━ 柳生春 POV（一個有整個世界的人在掂量）━━━━\n${await pov(client, model, LIU, LIU_STATE, LIU_REL, LIU_MEM)}\n`);
    console.log(`━━━━ 蘇映雪 POV（那段說不清的牽絆）━━━━\n${await pov(client, model, SU, SU_STATE, SU_REL, [])}\n`);

    console.log('看:① 柳生春是否用她的整個世界(戲痴/志向/怕被蓋過/師父「戲比天大」/疲憊)在掂量，而非只是「暖湯 vs 洋點心」、是否會猶豫甚至動念;② 柳↔蘇 是否寫成那個介於親情友情愛情同事之間的特殊牽絆，而非情侶;③ 比之前那個黏師姐版本厚多少。');
}

main().catch((e) => { console.error(e); process.exit(1); });
