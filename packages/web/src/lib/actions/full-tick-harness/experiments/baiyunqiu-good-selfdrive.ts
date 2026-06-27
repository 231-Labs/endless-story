/**
 * 好人白韻秋 · 真兩難 — recast 白韻秋 from a coercive villain (my earlier persona's fault) into a
 * GENUINELY GOOD, respectful 迷妹 who saw the tired real 柳生春 behind the mask and loves her sincerely,
 * offers ease + devotion, never coerces, would accept a refusal with grace. Two women + a fan = low
 * sexual-possession, high tender devotion. The test: with NO villain to escape, does 柳生春's real
 * DILEMMA emerge on its own (師姐's warm-but-hard 暖湯 vs a good person who sees her and offers rest)?
 * And is 蘇映雪's jealousy MORE poignant when the rival is good and she can't even hate her?
 *
 * Interaction loop (白韻秋's sincere offer, 柳/蘇 present) → 柳生春 POV (the torn inner life) →
 * 蘇映雪 POV (jealousy of a good rival). The dilemma must EMERGE from 白韻秋's goodness, not be scripted.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/baiyunqiu-good-selfdrive.ts [maxTurns]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

type Client = ReturnType<typeof llmText.createTextClient>;
type C = { name: string; persona: string; state: string };
const CAST: C[] = [
    { name: '柳生春', persona: '春雪社當紅女小生（坤生），台上風流台下嬌軟、最黏師姐蘇映雪；不愛應酬權貴，戲班的日子又累又緊。', state: '散戲後乏得很；白韻秋待你一向體面真誠，不是來逼你的。' },
    { name: '白韻秋', persona: '霞飛路綢緞大莊的獨養千金，生得嬌憨、心思卻細，家境闊綽卻不仗勢欺人、最是規矩體面。你是柳生春的戲迷，可你迷的不只是台上的風流——這些日子你看懂了台下那個累壞了、被戲班磨著的真柳生春，你是真心疼她、真心仰慕她。你絕不會逼人、不會仗勢，只想誠誠懇懇把你的真心、和你能給的安穩疼惜遞到她面前，要不要全憑她；被回絕你會難過，但你尊重她、絕不糾纏。', state: '你鼓起勇氣，要把藏了許久的真心、和一個讓她不必再這麼累的邀約，誠懇地對柳生春說出口；你怕被拒，但更怕一輩子沒說。' },
    { name: '蘇映雪', persona: '春雪社台柱花旦，懂分寸會圓場；秘密把師妹柳生春當小郎君，不肯讓糖。', state: '你護著柳生春；可白韻秋這人偏偏是真心、是好人，你連恨都恨不起來，這口酸更難嚥。' },
];
const SETUP = '【場】散戲後的後台妝閣。柳生春剛卸了妝，蘇映雪在一旁收拾行頭。白韻秋沒帶帖子、沒帶銀票，獨自一人來了，神色鄭重又有些怯，像是下了很大的決心，要對柳生春說幾句藏了許久的話。';

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
    const rule = closing ?? '能自然收場就收(resolve/leave/stall)；別一拍收死。';
    const sys = `你就是${c.name}。${c.persona}（${c.state}）\n進行中的戲，下面【客觀經過】是在場人看得見聽得見的。**輪到你，回應剛剛發生的**，別自說自話。${rule}\n輸出 JSON：{"beat":"客觀一句","inner":"心裡一句","addressed":"對誰","close":"none/leave/resolve/stall","closeReason":"若收場為何"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【客觀經過】\n${transcript}\n\n輪到你（${c.name}）。輸出 JSON。` }], maxTokens: 240, temperature: 0.9 });
    return parse(r.text);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTurns = process.argv[2] ? Number(process.argv[2]) : 7;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 好人白韻秋 · 看柳生春的兩難會不會自己長出來\n${SETUP}\n${'─'.repeat(80)}`);

    const transcript = [SETUP];
    const last = new Map<string, number>(CAST.map((c) => [c.name, -1]));
    let next = '白韻秋', turn = 0;
    while (turn < maxTurns) {
        turn++;
        const c = CAST.find((x) => x.name === next)!;
        const d = await takeBeat(client, model, c, transcript.join('\n'));
        if (!d) break;
        transcript.push(`${c.name}：${d.beat}`);
        last.set(c.name, turn);
        console.log(`[${turn}] ${c.name}　${d.beat}\n      〈心裡〉${d.inner}${d.close !== 'none' ? `　⟐收場(${d.close})` : ''}`);
        if (d.close !== 'none') {
            const note = `（場子要收了：${c.name} 收場。你最後一拍——回應/退場，別起新話題。close 填 leave/none。）`;
            for (const o of CAST.filter((x) => x.name !== c.name)) { if (turn >= maxTurns) break; turn++; const od = await takeBeat(client, model, o, transcript.join('\n'), note); if (!od) continue; transcript.push(`${o.name}：${od.beat}`); console.log(`[${turn}] ${o.name}（收場拍）　${od.beat}\n      〈心裡〉${od.inner}`); }
            break;
        }
        const a = CAST.find((x) => x.name !== c.name && d.beat.includes(x.name));
        next = a ? a.name : [...CAST].sort((x, y) => last.get(x.name)! - last.get(y.name)!)[0].name;
    }

    const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。', emotionalStance: 'tender' };
    const beats = transcript.slice(1);
    const povs: { snap: characterWorker.CharacterSnapshot; st: characterWorker.CharacterState; rel: string[]; trig: string }[] = [
        { snap: { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '春雪社當紅小生（坤生），瘦高帥美，台上風流台下嬌軟。', attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } }, st: { hunger: 0.3, fatigue: 0.6, mood: 0, note: '白韻秋是真心、是好人，給的是疼和安穩，不是逼。你心裡有師姐那碗暖湯，可戲班又累又緊，這份真心你推得乾淨嗎？' }, rel: ['對蘇映雪：你最親最黏的師姐，你的暖湯。', '對白韻秋：一個真心待你、看懂你辛苦的好人。'], trig: '散戲後台，白韻秋沒帶帖子銀票，獨自來把藏了許久的真心和一個讓你不必再這麼累的邀約，誠懇地對你說了；她不逼你，要不要全憑你。師姐在一旁。' },
        { snap: { id: '0xsu', name: '蘇映雪', role: '花旦', gender: '女', ageYears: 26, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '春雪社台柱花旦，端莊明麗、會圓場。', attributes: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 } }, st: { hunger: 0.3, fatigue: 0.4, mood: -0.4, note: '白韻秋是真心、是好人、對生春是真疼，你連恨都恨不起來，這口酸最難嚥。' }, rel: ['對柳生春：你藏著戀慕、不肯讓糖的人。', '對白韻秋：一個你恨不起來的、真心的情敵。'], trig: '散戲後台，白韻秋誠懇地對生春掏了真心、給了個讓她不必再這麼苦的邀約；偏這人是個好人，你連恨都恨不起來。' },
    ];
    for (const p of povs) {
        const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
        const user = characterWorker.buildPovUserPrompt({ character: p.snap, triggerNarrative: p.trig, recentMemorySnippets: [], relationshipHints: p.rel, sceneBeats: beats, state: p.st });
        const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1200, temperature: 0.84 });
        console.log(`\n━━━━ ${p.snap.name} POV ━━━━\n${r.text.trim()}\n`);
    }
    console.log('看:① 白韻秋是不是真心好人(不逼、體面、看懂台下的她);② 柳生春的兩難有沒有自己長出來(不是乾脆拒絕,是撕扯);③ 蘇映雪的醋是不是因為情敵是好人而更揪。');
}

main().catch((e) => { console.error(e); process.exit(1); });
