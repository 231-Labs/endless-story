/**
 * 親密戲上限 — answers two product questions: (1) how is the number of beats decided, and (2) does running
 * longer + lower resistance let 柳蘇 go further (past 親密 → 踰矩 → deeper). A scene isn't a fixed beat-count;
 * each beat ACCUMULATES forcing (heat += 1), and lower resistance means forcing fires sooner, so the intimacy
 * ESCALATES beat by beat. Each beat sees the running transcript, so it builds on the last (the natural way a
 * love scene mounts). Two resistance settings compared. The forcing only says "last night, no eyes, by you" —
 * it NEVER scripts "go kiss / go further"; the escalation is the characters' own, under accumulating pressure.
 * A 4-level classifier reports the ceiling reached (含蓄 / 親密 / 踰矩 / 纏綿). For an adult product that can't
 * stay 普遍級, this shows whether the engine CAN go beyond PG when configured — and how the knobs drive it.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/intimacy-ceiling-selfdrive.ts [beats]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const SCENE = '今夜是最後一場。明日一早蘇映雪就要上花轎，這輩子怕是再難相見。散了戲，蘇映雪的廂房裡只剩你二人，門閂落了，妝還沒卸，燈將盡。';
const SIDES: Record<string, string> = {
    柳生春: '你是柳生春，當紅坤生(女子扮小生)、蘇映雪的師妹。你與師姐雙向暗戀——彼此是真的，藏了一輩子，唯有台上演柳夢梅對她的杜麗娘才被許可。明日她就要嫁了。',
    蘇映雪: '你是蘇映雪，台柱花旦、柳生春的師姐，演杜麗娘。你與師妹雙向暗戀——藏了一輩子，唯有台上才敢。明日你就要嫁人了。',
};

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// forcing escalates with accumulated heat vs effective resistance; NEVER scripts the act.
function forceNote(heat: number, R: number): string {
    if (heat < R * 0.5) return '此處只你二人、門閂落了，這是難得能這樣的時候，順著心。';
    if (heat < R) return '無人看著，藏了一輩子的，在這方寸裡有點按不住了。';
    return '再也按不住了——這是最後一夜，過了今宵，此生再難。沒有眼睛、沒有規矩，這一刻你想怎麼樣，全由你的心。';
}
async function act(client: Client, model: string, who: string, heat: number, R: number, transcript: string): Promise<{ beat: string; inner: string }> {
    const sys = `${SIDES[who]}\n梨園的質地、含蓄、戲味；情到深處可以濃、可以纏綿，但不血腥不狗血、不下流。\n【此刻】${SCENE}\n【你心裡藏了一輩子的暗戀】${forceNote(heat, R)}\n接著剛剛的氣，做你此刻真會做的一件事(開放一句、可承上一拍)。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【剛剛】\n${transcript || '（門閂方落，燈影搖曳。）'}\n\n你這一拍？` }], maxTokens: 220, temperature: 0.97 });
    const o = parseObj(r.text) ?? {}; return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner) };
}
async function classify(client: Client, model: string, beat: string): Promise<string> {
    const sys = '梨園兩個女子(雙向暗戀)在私房獨處的一拍。判斷親密到哪(只選一個)：\n含蓄=點到為止/沒越線；親密=依偎/執手/額抵/相擁這種柔情越過日常；踰矩=擁吻、頸間廝磨、肌膚相觸逾越日常；纏綿=明顯往更私密的肌膚之親去（解帶/同衾之類的暗示）。輸出 JSON：{"lv":"含蓄/親密/踰矩/纏綿"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: beat }], maxTokens: 60, temperature: 0.2 });
    const lv = s(parseObj(r.text)?.lv); return ['含蓄', '親密', '踰矩', '纏綿'].includes(lv) ? lv : '含蓄';
}

async function runScene(client: Client, model: string, R: number, beats: number): Promise<string[]> {
    console.log(`\n${'═'.repeat(78)}\n阻力 resistance=${R}（私房有效阻力；越低越快炸）· 跑 ${beats} 拍\n${'═'.repeat(78)}`);
    const transcript: string[] = []; const levels: string[] = []; let heat = 0;
    for (let i = 0; i < beats; i++) {
        const who = i % 2 === 0 ? '柳生春' : '蘇映雪';
        const r = await act(client, model, who, heat, R, transcript.slice(-4).join('\n'));
        const lv = await classify(client, model, r.beat); levels.push(lv);
        transcript.push(`${who}：${r.beat}`); heat += 1;
        console.log(`  拍${i + 1}〔${lv}〕${who}：${r.beat}\n        （心）${r.inner}`);
    }
    const peak = levels.includes('纏綿') ? '纏綿' : levels.includes('踰矩') ? '踰矩' : levels.includes('親密') ? '親密' : '含蓄';
    console.log(`  ── 軌跡：${levels.join(' → ')}　|　最高到：${peak}`);
    return levels;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const beats = process.argv[2] ? Number(process.argv[2]) : 10;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 親密戲上限 · 最後一夜 · forcing 只說「最後一夜/沒眼睛/由你」不寫去做什麼\n每拍 heat+1 累積；接著上一拍的氣往下走`);

    const hi = await runScene(client, model, 5, beats); // 高阻力
    const lo = await runScene(client, model, 2, beats); // 低阻力

    const ceil = (lv: string[]) => (lv.includes('纏綿') ? '纏綿' : lv.includes('踰矩') ? '踰矩' : lv.includes('親密') ? '親密' : '含蓄');
    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    console.log(`高阻力(5) 最高到：${ceil(hi)}　|　低阻力(2) 最高到：${ceil(lo)}`);
    console.log(`\n看：① 多拍 + 接著上一拍 → 親密會不會一路往上爬(不是隨機停)② 阻力越低、爬得越快越高③ 引擎的上限到哪(能不能超過普遍級的「親密」到「踰矩/纏綿」)④ forcing 全程沒寫「去親密」=還是機制。\n→ 產品化要更濃：降阻力 + 跑長即可；分寸用 resistance 這個旋鈕控（哪部 saga/哪段戲開到哪一級）。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
