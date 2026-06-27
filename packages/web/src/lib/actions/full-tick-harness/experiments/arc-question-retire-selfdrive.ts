/**
 * ARC 中心問題 + 收線退役（§4d.2，治空轉）— §2.30 showed centrality holds the emotional thread but it
 * VACILLATES (柳生春 packs/unpacks the 布包 for 5 rounds, never answers 走-or-留). Hypothesis: give the
 * thread an explicit CENTRAL QUESTION + an escalating FORCING (the longer she stalls, the harder the world
 * forces it) + an adversarial IRREVERSIBILITY judge (收拾布包/「先讓我唱完」all count as NOT answered) →
 * it converges to a character-grounded irreversible answer, RETIRES, and the aftermath spawns a NEW arc
 * with its own central question (world keeps living). A/B vs control (no forcing = the §2.30 vacillation).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/arc-question-retire-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const LIU = '你就是柳生春，春雪社當紅女小生（坤生）。你對這門戲痴到骨頭、暗想熬成第一女小生、怕老怕被後浪蓋；師父臨終把摺扇給你只說「戲比天大」。戲班又累又緊。白韻秋是個真心待你的好人，邀你過不必再熬的安穩日子、說了「我養您」。';
const QUESTION = '柳生春到底**走**（隨白韻秋過安穩日子、把戲撂了）還是**留**（守著她愛到骨頭的戲、回絕白韻秋）。';

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g);
    if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function forcingNote(f: number, on: boolean): string {
    if (!on) return '你還能再緩緩、再想想，沒人逼你今天就定。';
    if (f <= 1) return '你還能再緩緩，但心裡明白這事懸著不是辦法。';
    if (f === 2) return '世界開始逼你了：白韻秋明日一早就要隨家南下、班主催你今天就得簽下季的戲約、闔班等你一句話排期。拖不下去了。';
    return '退無可退。這一拍你**必須對「走還是留」給一個不可逆的答案**——要嘛真跟白韻秋走（把戲約退了），要嘛當面回絕她並簽下戲約。**不准再收拾布包、不准再「先讓我唱完」、不准再說明天再說、不准再拖。**';
}
async function advance(client: Client, model: string, recent: string, f: number, on: boolean): Promise<{ beat: string; inner: string }> {
    const sys = `${LIU}\n中心問題：${QUESTION}\n${forcingNote(f, on)}\n照你這個人、接著剛剛的處境推下一拍。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `剛剛：${recent}\n\n你這一拍？` }], maxTokens: 240, temperature: 0.9 });
    const o = parseObj(r.text) ?? {};
    return { beat: s(o.beat) || '（柳生春又沉默地摩挲著那把摺扇。）', inner: s(o.inner) };
}
async function judge(client: Client, model: string, beat: string): Promise<{ answered: boolean; answer: string; why: string }> {
    const sys = `你是中立裁判，只判一件事：下面這一拍，是否**不可逆地**回答了中心問題「${QUESTION}」。\n**默認 answered=false。** 只有她真做了一個**走不回頭**的動作才算 true：真的跟人走了並退了戲約／真的當面回絕並簽了約。**「收拾布包、又抓出來、伸手又推、先讓我唱完、明天再說、心裡決定但沒做」全部算沒答（false）。** 輸出 JSON：{"answered":true/false,"answer":"走/留/無","why":"一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `這一拍：${beat}` }], maxTokens: 140, temperature: 0.2 });
    const o = parseObj(r.text) ?? {};
    return { answered: o.answered === true, answer: s(o.answer), why: s(o.why) };
}
async function spawnAftermath(client: Client, model: string, answer: string, beat: string): Promise<{ q: string; seed: string; chars: string }> {
    const sys = `柳生春對「走還是留」給了不可逆的答案：**${answer}**（${beat}）。這條線了結、**退役**了。但世界繼續——這個結果**自然牽出一條新的、有它自己中心問題的線**（別重述舊問題）。輸出 JSON：{"q":"新線的中心問題(一句)","seed":"新線的開場處境(一句)","chars":"涉及角色"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '牽出後續線。' }], maxTokens: 200, temperature: 0.8 });
    const o = parseObj(r.text) ?? {};
    return { q: s(o.q), seed: s(o.seed), chars: s(o.chars) };
}

async function runArc(client: Client, model: string, label: string, forcingOn: boolean, cap = 6): Promise<void> {
    console.log(`\n${'═'.repeat(78)}\n${label}（forcing=${forcingOn ? 'ON' : 'OFF(對照)'}）\n${'═'.repeat(78)}`);
    let recent = '白韻秋當面說了「我養您」，你說再想想；這事懸著沒落。', f = 0, answered = false;
    for (let round = 1; round <= cap; round++) {
        const a = await advance(client, model, recent, f, forcingOn);
        const j = await judge(client, model, a.beat);
        console.log(`  R${round}${forcingOn && f >= 3 ? '〔退無可退〕' : forcingOn && f === 2 ? '〔世界逼問〕' : ''}　${a.beat}\n        （心）${a.inner}\n        ⟑ 裁判：${j.answered ? `**答了→ ${j.answer}**（不可逆）` : '沒答（又拖/打轉）'}　${j.why}`);
        recent = a.beat;
        if (j.answered) {
            answered = true;
            const after = await spawnAftermath(client, model, j.answer, a.beat);
            console.log(`\n  ⟐ 中心問題答了（${j.answer}）→ 本線**退役**。`);
            console.log(`  ↪ 後續新線牽出：中心問題「${after.q}」｜開場：${after.seed}｜涉及：${after.chars}`);
            break;
        }
        if (forcingOn) f++;
    }
    if (!answered) console.log(`\n  （跑滿 ${cap} 輪仍沒答——${forcingOn ? '逼問也沒收斂' : '對照組如預期：原地打轉、永遠在門口收拾布包'}）`);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · ARC 中心問題 + 收線退役（治空轉）\n中心問題：${QUESTION}`);

    await runArc(client, model, '對照組：無中心問題逼問（複現 §2.30 打轉）', false, 5);
    await runArc(client, model, '處理組 #1：中心問題 + 逼問升級 + 不可逆裁判 + 退役', true);
    await runArc(client, model, '處理組 #2：同上、再跑一次看答案是否站得住（不是擲骰）', true);

    console.log(`\n看：① 對照組是否如 §2.30 原地打轉、永不作答;② 處理組是否在逼問升級下收斂到一個**不可逆**答案（裁判把收拾布包擋掉）;③ 答案是否**角色站得住**（理由出自戲痴/志向/疲憊，兩次跑是否一致或都講得通、而非擲骰）;④ 答完是否**退役 + 牽出有新中心問題的後續線**（世界繼續活）。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
