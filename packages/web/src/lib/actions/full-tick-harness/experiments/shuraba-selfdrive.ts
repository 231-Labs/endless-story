/**
 * 隱晦的修羅場 — surface all courtesy (屬地客觀), subterranean war (屬人主觀). 白韻秋 comes to the 後台
 * under the socially-flawless pretext of 道賀; 班主 田巧雲 welcomes the rich patron; 蘇映雪 (the ambiguous
 * 生旦 bond) is poised; 柳生春 is hemmed in the middle. Nobody breaks face. They fence with subtext,
 * double meanings, the angle a teacup is offered, a glance held a beat too long. The OBJECTIVE transcript
 * stays polite; each POV peels back the knives underneath. The gap IS the 隱晦修羅場.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/shuraba-selfdrive.ts [maxTurns]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

type Client = ReturnType<typeof llmText.createTextClient>;
type C = { name: string; persona: string; state: string };
const CAST: C[] = [
    { name: '白韻秋', persona: '霞飛路綢緞大莊獨養千金，嬌憨心細、闊綽卻體面有教養；真心疼柳生春、看懂她辛苦，被婉拒後沒糾纏。今兒以「道賀」為名來，藉口挑不出錯，可你心裡明白你是為誰來的。', state: '你不能逼、不能露，只能借這場面再見她一面、再遞一點心意；可一屋子的眼睛盯著，你那點真心只能藏在客套底下。' },
    { name: '蘇映雪', persona: '春雪社台柱花旦，懂分寸最會圓場；和柳生春搭了七八年生旦，那份牽絆介於姊妹知己老搭檔戲假情真之間、近乎情愛卻不點破。', state: '你一眼看穿白韻秋這「道賀」是為生春來的，心裡那點不肯叫名字的私心又翻上來；可你是台柱、是東道，面上半分不能露，只能笑著把場子接圓、把人不著痕跡地擋在生春和她之間。' },
    { name: '柳生春', persona: '春雪社當紅女小生（坤生），痴戲、暗想頭牌、怕老；台上風流台下嬌軟。對白韻秋的真心她領、卻說了再想想；對師姐那份牽絆說不清。', state: '你被圍在中間，白韻秋的真心、師姐的牽絆、班主的算盤，全壓在這一盞茶的工夫裡；你只能體面周旋，把翻江倒海按在笑底下。' },
    { name: '田巧雲', persona: '春雪社班主、當家的，精明持重，算盤先於情分；眼看進項、靠山與全班生計。', state: '白家是塊闊靠山，你要笑臉捧著；可你也看出這「道賀」底下的暗潮——你既要留住這金主，又要看著生春別出岔子，全班的飯轍都在你這場圓滑裡。' },
];
const SETUP = '【場】散戲後的後台妝閣。柳生春剛卸了妝。白韻秋備了一份體面的賀禮，親自來後台道賀柳老闆今晚的好戲。班主田巧雲笑著迎這位闊客，蘇映雪在一旁。茶上了，人人臉上帶笑，話說得周到——可這滿屋子的人，各自心裡都揣著沒說出口的事。';

interface D { beat: string; inner: string; addressed: string; close: 'none' | 'leave' | 'resolve' | 'stall'; closeReason: string }
function parse(raw: string): D | null {
    const b = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { const o = JSON.parse(b[i]) as Record<string, unknown>; const s = (v: unknown) => (typeof v === 'string' ? v.trim() : ''); const cl = s(o.close) as D['close']; if (s(o.beat)) return { beat: s(o.beat), inner: s(o.inner), addressed: s(o.addressed), close: ['leave', 'resolve', 'stall'].includes(cl) ? cl : 'none', closeReason: s(o.closeReason) }; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}
async function takeBeat(client: Client, model: string, c: C, transcript: string, closing?: string): Promise<D | null> {
    const rule = closing ?? '若這場該收了(客客氣氣地散)就收(leave/resolve)；別硬聊，但也別撕破臉。';
    const sys = `你就是${c.name}。${c.persona}（${c.state}）\n\n**這是一場「隱晦的修羅場」**：表面上人人體面客氣、滴水不漏、絕不撕破臉、絕不挑明；底下各懷心事、暗自較勁。\n**你的 beat（說出口/做出來的，別人看得見聽得見）必須是體面的、客氣的，頂多話裡藏一絲不易察覺的刺或雙關；你的 inner 才是底下真正的心思和刀。** 用潛台詞、客套裡的機鋒、遞茶的分寸、一個多停半息的眼神來較勁——不可發作、不可說破。${rule}\n下面【客觀經過】是在場人看得見聽得見的。輪到你，**接著剛剛的話往下圓/往下刺**，別自說自話。\n輸出 JSON：{"beat":"你體面說出口/做出來的(一句)","inner":"你底下真正的心思與刀(一句)","addressed":"對誰","close":"none/leave/resolve/stall","closeReason":"若散場為何"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【客觀經過】\n${transcript}\n\n輪到你（${c.name}）。輸出 JSON。` }], maxTokens: 260, temperature: 0.92 });
    return parse(r.text);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTurns = process.argv[2] ? Number(process.argv[2]) : 8;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 隱晦的修羅場\n${SETUP}\n${'─'.repeat(80)}`);

    const transcript = [SETUP];
    const last = new Map<string, number>(CAST.map((c) => [c.name, -1]));
    let next = '白韻秋', turn = 0;
    while (turn < maxTurns) {
        turn++;
        const c = CAST.find((x) => x.name === next)!;
        const d = await takeBeat(client, model, c, transcript.join('\n'));
        if (!d) break;
        transcript.push(`${c.name}：${d.beat}`); last.set(c.name, turn);
        console.log(`[${turn}] ${c.name}（面）${d.beat}\n        （底）${d.inner}${d.close !== 'none' ? `　⟐散(${d.close})` : ''}`);
        if (d.close !== 'none') {
            const note = `（場子要客氣地散了：${c.name} 起身告辭/收場。你最後一拍——體面地回應/送客，潛台詞可留，別撕破臉。close 填 leave/none。）`;
            for (const o of CAST.filter((x) => x.name !== c.name)) { if (turn >= maxTurns) break; turn++; const od = await takeBeat(client, model, o, transcript.join('\n'), note); if (!od) continue; transcript.push(`${o.name}：${od.beat}`); console.log(`[${turn}] ${o.name}（面）${od.beat}\n        （底）${od.inner}`); }
            break;
        }
        const a = CAST.find((x) => x.name !== c.name && d.beat.includes(x.name));
        next = a ? a.name : [...CAST].sort((x, y) => last.get(x.name)! - last.get(y.name)!)[0].name;
    }

    console.log(`\n${'─'.repeat(80)}\n各人 POV（掀開體面底下的修羅場）`);
    const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。', emotionalStance: 'restrained' };
    const beats = transcript.slice(1);
    const povs: { snap: characterWorker.CharacterSnapshot; rel: string[]; note: string }[] = [
        { snap: { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '當紅女小生（坤生），瘦高帥美，台上風流台下嬌軟，痴戲、暗想頭牌、怕老。', attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } }, rel: ['對蘇映雪：說不清的生旦牽絆。', '對白韻秋：真心待你、你說了再想想的好人。'], note: '你被圍在中間，把翻江倒海按在體面的笑底下。' },
        { snap: { id: '0xsu', name: '蘇映雪', role: '花旦', gender: '女', ageYears: 26, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '台柱花旦，端莊明麗會圓場，和柳生春搭七八年生旦。', attributes: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 } }, rel: ['對柳生春：你不肯叫名字的牽絆。', '對白韻秋：你看穿了她「道賀」底下為誰而來的、恨不起來的好人。'], note: '你笑著接圓場子、不著痕跡擋在中間，那點私心翻著、半分不露。' },
        { snap: { id: '0xbai', name: '白韻秋', role: '—', gender: '女', ageYears: 20, sagaName: '霞飛路', sceneName: '後台妝閣', physicalFacts: '綢緞莊獨養千金，嬌憨心細、體面不仗勢，真心疼柳生春、被婉拒未糾纏。', attributes: { appearance: 78, constitution: 64, acuity: 70, disposition: 70 } }, rel: ['對柳生春：你借道賀來再見一面的、放不下的人。', '對蘇映雪：那個總擋在你和她之間、你也說不清是敵是友的師姐。'], note: '你只能把真心藏在客套底下，借這場面再遞一點心意，一屋子眼睛盯著。' },
        { snap: { id: '0xtian', name: '田巧雲', role: '班主', gender: '女', ageYears: 46, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '班主當家的，精明持重，一雙眼專看進項靠山人心。', attributes: { appearance: 70, constitution: 70, acuity: 88, disposition: 72 } }, rel: ['對白韻秋：要捧的闊靠山。', '對柳生春：戲班的台柱苗子，別出岔子。', '對蘇映雪：護生春的台柱。'], note: '你笑臉捧著金主，一雙眼把這滿屋子的暗潮看得門兒清，全班的飯轍在你這場圓滑裡。' },
    ];
    for (const p of povs) {
        const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
        const user = characterWorker.buildPovUserPrompt({ character: p.snap, triggerNarrative: '散戲後台，白韻秋以道賀為名來了，班主迎著，茶上了，人人帶笑說著周到話。可這滿屋子各懷心事——這是一場誰也沒挑明的隱晦修羅場。把表面的體面客氣、和你底下真正的較勁、心思、那把沒出鞘的刀，都寫進來。', recentMemorySnippets: [], relationshipHints: p.rel, sceneBeats: beats, state: { hunger: 0.3, fatigue: 0.5, mood: -0.2, note: p.note } });
        const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1200, temperature: 0.86 });
        console.log(`\n━━━━ ${p.snap.name} POV ━━━━\n${r.text.trim()}\n`);
    }
    console.log('看:① 客觀 transcript 是否一片體面客氣、不撕破臉(隱);② 四份 POV 是否各自掀開底下的較勁與心思(晦的修羅場);③ 同一句客套，在不同 POV 裡讀出不同的刀。');
}

main().catch((e) => { console.error(e); process.exit(1); });
