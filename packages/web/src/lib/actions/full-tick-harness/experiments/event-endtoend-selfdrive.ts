/**
 * 端到端 · 事件管線 + 上鏈轉化（v2：收場拍序列 + repute 量值/風味拆分）—— runs the new event
 * pipeline and LABELS each artifact with its on-chain destination.
 *
 * v2 refinements (from v1 findings):
 *  1) CLOSING SEQUENCE, not an instant cut — when a character proposes close, every OTHER present
 *     participant still gets ONE final reaction/exit beat, so the objective transcript is complete
 *     enough to anchor the POVs (v1: 柳 closed on turn 1 → thin transcript → POVs had to improvise).
 *  2) reputeLeans → split `reputeDeltas`(signed magnitude for the §2.22 accumulator; ~0 for pure
 *     social events) + `reputeFlavors`(qualitative reputation tag). v1 conflated them into 孤高傲慢.
 *
 *   ① 事件開 → ⛓ open event   ② transcript → 📜 屬地客觀   ③ resolution → ⛓ resolve tx (具體結尾)
 *   ④ POV → 📜 per-char        ⑤ weave → 📜 event_cut (compiler EXISTS)
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/event-endtoend-selfdrive.ts [maxTurns]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

type C = { name: string; persona: string; state: string; rel: string };
const CAST: C[] = [
    { name: '柳生春', persona: '春雪社當紅女小生（坤生），台上風流、台下嬌軟愛黏人；志向第一女小生（暗流），主要為眼前人事而活。', state: '剛散戲卸了一半妝，累得骨頭發酸，被帖子打擾，只想賴著師姐歇。', rel: '蘇映雪是你最親最黏的師姐；白韻秋是迷你戲的千金，你領情卻無意。' },
    { name: '蘇映雪', persona: '春雪社台柱花旦，台上端莊台下懂分寸；秘密：把師妹柳生春當自己的小郎君，不肯讓糖。', state: '正替生春解護領的扣子，挨得近；帖子一來心裡先酸。', rel: '柳生春是你藏著戀慕、不願分人的人；白家請她去洋樓，你聽著就堵。' },
    { name: '白家管家', persona: '白公館老管家，盡責規矩、不諳風月；奉命下帖討一句準話好交差。', state: '捧著燙金帖子，小姐還等回話，急著要個準信。', rel: '你只認小姐吩咐；柳蘇都客氣，但你要一句準話。' },
];
const SETUP =
    '【場】散戲後的後台妝閣。柳生春剛卸了一半妝，蘇映雪正替她解著護領的扣子，兩人挨得近。白家管家捧著燙金帖子進來：「煩柳老闆得空賞光去敝府洋樓給小姐作陪、說段戲。小姐候您一句準話，老奴好交差。」三人都在。';

interface Decision { beat: string; inner: string; addressed: string; close: 'none' | 'leave' | 'resolve' | 'stall'; closeReason: string }
function parseDecision(raw: string): Decision | null {
    const b = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(b[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            const close = s(o.close) as Decision['close'];
            if (s(o.beat)) return { beat: s(o.beat), inner: s(o.inner), addressed: s(o.addressed), close: ['leave', 'resolve', 'stall'].includes(close) ? close : 'none', closeReason: s(o.closeReason) };
        } catch { /* earlier */ }
    }
    return null;
}
async function chatRetry(client: ReturnType<typeof llmText.createTextClient>, req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}

async function takeBeat(client: ReturnType<typeof llmText.createTextClient>, model: string, p: C, transcriptStr: string, closingNote?: string): Promise<Decision | null> {
    const closeRule = closingNote
        ? closingNote
        : '能自然收場就收（resolve事定了/leave離場/stall僵住）。但**若場上還有人該回應你、或還有人沒表態，先別急著一拍收死**，給場子留一兩拍。';
    const system = `你就是${p.name}。${p.persona}\n此刻身心：${p.state}\n你眼中的人：${p.rel}\n\n這是一場正在進行的戲，下面【客觀經過】是在場所有人看得見聽得見的。**輪到你，先讀懂剛剛發生的、回應它**，別自說自話、別重複別人說過的。${closeRule}\n輸出 JSON：{"beat":"客觀一句(別人看得見聽得見)","inner":"心裡一句","addressed":"對誰","close":"none/leave/resolve/stall","closeReason":"若收場為何"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system, messages: [{ role: 'user', content: `【客觀經過】\n${transcriptStr}\n\n輪到你（${p.name}）。輸出 JSON。` }], maxTokens: 240, temperature: 0.9 });
    return parseDecision(r.text);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTurns = process.argv[2] ? Number(process.argv[2]) : 12;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 端到端 v2 · 收場拍序列 + repute 量值/風味\n`);
    console.log(`⛓ STATE｜① 事件開(open event 物件:scene+cast+time)\n${SETUP}\n${'─'.repeat(80)}`);

    // ② 多輪互動 loop → 客觀 transcript
    const transcript: string[] = [SETUP];
    const lastSpoke = new Map<string, number>(CAST.map((p) => [p.name, -1]));
    let nextName = '柳生春';
    let closedBy = '', closeKind = '', closeReason = '';
    let turn = 0;
    while (turn < maxTurns) {
        turn++;
        const p = CAST.find((x) => x.name === nextName)!;
        const d = await takeBeat(client, model, p, transcript.join('\n'));
        if (!d) { console.log(`[${turn}] ${p.name}（parse miss）`); break; }
        transcript.push(`${p.name}：${d.beat}`);
        lastSpoke.set(p.name, turn);
        console.log(`[${turn}] ${p.name}　${d.beat}\n        〈心裡〉${d.inner}${d.close !== 'none' ? `　⟐提議收場(${d.close})：${d.closeReason}` : ''}`);
        if (d.close !== 'none') {
            // CLOSING SEQUENCE: every OTHER present participant gets ONE final reaction/exit beat
            closedBy = p.name; closeKind = d.close; closeReason = d.closeReason;
            const note = `（場子要收了：${p.name} 已決定收場「${d.closeReason}」。這是你**最後一拍**——回應、接話圓場、或退場下場；別再起新話題、別把場子重新撐開，給它一個乾淨收束。close 一律填 leave 或 none。）`;
            for (const o of CAST.filter((x) => x.name !== p.name)) {
                if (turn >= maxTurns) break;
                turn++;
                const od = await takeBeat(client, model, o, transcript.join('\n'), note);
                if (!od) continue;
                transcript.push(`${o.name}：${od.beat}`);
                console.log(`[${turn}] ${o.name}（收場拍）　${od.beat}\n        〈心裡〉${od.inner}`);
            }
            break;
        }
        const addr = CAST.find((x) => x.name === d.addressed && x.name !== p.name);
        nextName = addr ? addr.name : [...CAST].sort((a, b) => lastSpoke.get(a.name)! - lastSpoke.get(b.name)!)[0].name;
    }
    const objectiveChapter = transcript.slice(1).join('\n');
    console.log(`\n📜 CONTENT｜② 客觀 transcript（屬地客觀章回 → Walrus + commitment::commit, subject=scene）\n${objectiveChapter}\n${'─'.repeat(80)}`);

    // ③ 收場 → 結構化 resolution（⛓STATE 具體結尾）— repute 拆量值/風味
    const resoSys = '你是這個世界的結算員。一場戲收場了。讀【客觀經過】與【收場】，把這場對**世界狀態的具體改變**抽成結構化結果——要上鏈的「具體結尾」，客觀、可執行、不寫文采。tone 從 {romance,affection,mentorship,rivalry,wary,tension,estrangement,acquaintance,neutral} 取。\n**reputeDeltas** 是這事對角色「往台柱/第一的聲望**量值**累積」的有號改變（小整數，如 +2/+1/0/-1；**純社交/關係事件多半是 0 或很小**，演出/自律/比拼才有明顯量值）；**reputeFlavors** 是這事給的名聲**性質**標籤（如 孤高/親民/敬業/輕浮），與量值無關。兩者分開。\n輸出 JSON：{"outcome":"客觀結局/決定(一句)","relationshipDeltas":[{"from":"","to":"","tone":"","direction":"+|-","why":""}],"reputeDeltas":[{"character":"","axis":"聲望軸(台風/敬業/聲量/身段…)","delta":0,"why":""}],"reputeFlavors":[{"character":"","flavor":"","why":""}],"memories":[{"character":"","text":"留在他記憶裡的一句"}],"resourceTransfers":[]}。不要 markdown。';
    const reso = await chatRetry(client, { model, system: resoSys, messages: [{ role: 'user', content: `【客觀經過】\n${transcript.join('\n')}\n\n【收場】由 ${closedBy} ${closeKind}：${closeReason}\n\n抽出結構化 resolution。` }], maxTokens: 600, temperature: 0.4 });
    console.log(`\n⛓ STATE｜③ 結構化 resolution（= event::resolve_event(payload)：關掉 event + apply deltas）`);
    console.log(`   〔reputeDeltas→§2.22 量值累積(社交事件多半 0)、reputeFlavors→名聲標籤、relationshipDeltas→關係邊、memories→記憶錨〕\n${reso.text.trim()}\n${'─'.repeat(80)}`);

    // ④ 各自 POV（詮釋同一份完整 transcript）→ 📜CONTENT
    const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。', emotionalStance: 'tender' };
    const sceneBeats = transcript.slice(1);
    const povCast: { snap: characterWorker.CharacterSnapshot; state: characterWorker.CharacterState; rel: string[]; trig: string }[] = [
        { snap: { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '春雪社當紅小生（坤生），瘦高、帥美，台上風流台下嬌軟，最怕胖。', attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } }, state: { hunger: 0.3, fatigue: 0.7, mood: 0.3, note: '散戲累著，師姐替我擋了白家的帖子，我賴在她肩窩，心裡踏實。' }, rel: ['對蘇映雪：你最親最黏的師姐，方才她替你擋了白家。'], trig: '散戲後台，白家管家來下洋樓的帖子，你回絕了，師姐替你把場圓到底、打發了管家，你賴在她肩窩。' },
        { snap: { id: '0xsu', name: '蘇映雪', role: '花旦', gender: '女', ageYears: 26, sagaName: '春雪社', sceneName: '後台妝閣', physicalFacts: '春雪社台柱花旦，端莊明麗；台下懂分寸、會圓場。', attributes: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 } }, state: { hunger: 0.3, fatigue: 0.45, mood: 0.5, note: '當著管家把生春圈在身邊、替她回了白家，心裡又酸又得意。' }, rel: ['對柳生春：你藏著戀慕、不肯讓糖的人，方才當眾把她圈住了。'], trig: '散戲後台，白家管家來請生春去洋樓，你替她回絕、把場圓到底、打發了管家；白家的帖子叫你心裡先酸。' },
    ];
    for (const c of povCast) {
        const system = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
        const user = characterWorker.buildPovUserPrompt({ character: c.snap, triggerNarrative: c.trig, recentMemorySnippets: [], relationshipHints: c.rel, sceneBeats, state: c.state });
        const r = await chatRetry(client, { model, system, messages: [{ role: 'user', content: user }], maxTokens: 1100, temperature: 0.84 });
        console.log(`\n📜 CONTENT｜④ ${c.snap.name} POV（詮釋同一 transcript → commitment, subject=character）\n${r.text.trim()}\n`);
    }

    console.log(`${'─'.repeat(80)}\n📜 CONTENT｜⑤ 織成回（event_chapter-compiler → event_cut commitment）— 既有，本實驗未重跑。`);
    console.log('\n看:① 收場拍序列後 transcript 是否完整(蘇/管家都有拍、POV 不必再瞎編);② reputeDeltas 是否多半 0(社交事件)、reputeFlavors 是否抓到名聲性質;③ 兩份 POV 詮釋同一份完整 transcript 的質地。');
}

main().catch((e) => { console.error(e); process.exit(1); });
