/**
 * 收斂引擎組裝總驗（§4d 合論）— assemble §2.30 (centrality select) + §2.31 (central-question + forcing +
 * irreversibility judge + retire + aftermath spawn) into ONE continuous multi-arc loop and check the
 * COMPOSITION: (a) no drift (centrality holds emotional cores), (b) no churn (arcs converge+retire),
 * (c) aftermaths chain coherently without degrading, (d) the 底色 stays WARM (tension from love/longing/
 * impossible choices, not violence/intrigue/血腥), (e) the 柳↔蘇 bond reads as real MUTUAL unspoken love
 * whose only legitimate outlet is the stage — and that being one reason 柳生春 won't retire young.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/convergence-engine-selfdrive.ts [maxTicks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

type Client = ReturnType<typeof llmText.createTextClient>;

const WARM = '底色是暖的、有情的：張力來自愛、思慕、難言、與不得不的選擇——哪怕衝突也帶著疼惜。**不要血腥、陰謀、狗血、黑市那類套路。**';
const BOND = '柳生春與蘇映雪是**雙向暗戀**：彼此是真的，卻誰也不敢、不能說破（戲班的飯碗、生旦的本分、那年代容不下）。**唯一能光明正大流露真情的地方是台上**——演杜麗娘與柳夢梅時，那點愛才被許可呼吸。這也是柳生春**捨不得年紀輕輕退役**的隱秘緣由之一：離了台，她和師姐連那點合法的相望都沒了。';
const CORES: Record<string, string> = {
    柳生春: '春雪社當紅女小生（坤生），瘦高帥美、台上風流台下嬌軟。戲痴（七歲坐科、十六歲《白蛇》滿堂彩）、暗想熬成第一女小生、怕老怕被後浪蓋、師父臨終「戲比天大」。有自己一整個世界、不為任何人而活。',
    蘇映雪: '春雪社台柱花旦，端莊會圓場，和柳生春搭了七八年生旦。她對師妹的暗戀是真的、也不敢說破，只在台上演杜麗娘對柳夢梅時，讓那份愛被許可呼吸。',
    白韻秋: '霞飛路綢緞大莊獨養千金，柳生春的迷妹，嬌憨心細、闊綽卻體面不仗勢、真心、被婉拒不糾纏。',
    田巧雲: '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。',
};

interface Arc { id: string; label: string; protagonist: string; question: string; pressure: string; forcing: number; chars: string; retired?: boolean; answer?: string; origin?: string }
const SEEDS: Arc[] = [
    { id: 'a1', label: '退役·去留', protagonist: '柳生春', question: '柳生春該不該趁年輕應白韻秋之邀退役、過不必再熬的安穩日子', pressure: '白韻秋的真心擱在那兒，柳生春說了再想想，懸著沒落。', forcing: 0, chars: '柳生春、白韻秋、蘇映雪' },
    { id: 'a2', label: '師姐妹·暗戀', protagonist: '蘇映雪', question: '柳生春與蘇映雪這雙向暗戀，除了台上，這輩子敢不敢、要不要在台下說破一次', pressure: '白韻秋的逼近讓蘇映雪心慌，可她連台下看一眼都不敢逾矩。', forcing: 0, chars: '蘇映雪、柳生春' },
];

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
const bondCtx = (chars: string) => (chars.includes('柳生春') && chars.includes('蘇映雪') ? `\n${BOND}` : '');

async function centralitySelect(client: Client, model: string, arcs: Arc[]): Promise<string> {
    const list = arcs.map((a) => `[${a.id}] ${a.question}（還懸著：${a.pressure}）`).join('\n');
    const sys = `你是世界的敘事調度（只挑線、不寫戲、不決定結局）。挑出**最是這故事情感核心、推進它最能成就一段好看連續人戲**的一條當下一場戲的焦點。不是看哪條最急，是看哪條是故事的心。\n只輸出 JSON：{"pick":"線的代號"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `當前未了的線：\n${list}\n\n挑一條。` }], maxTokens: 60, temperature: 0.6 });
    const o = parseObj(r.text);
    const pick = s(o?.pick).replace(/[^a-z0-9]/gi, '');
    return arcs.find((a) => a.id === pick) ? pick : arcs[0].id;
}
function forcingNote(f: number): string {
    if (f <= 1) return '日子還能容你再緩緩，但心裡明白這事懸著不是辦法。';
    if (f === 2) return '日子推著你了，身邊的人都在等你一句話，這事不能總這麼懸著。';
    return '不能再懸著了。這一拍，你得對這條線的中心問題給一個**放不回頭**的答案——可以疼、可以不捨、可以含淚，但要真，不准再拿託辭擋過去。';
}
async function advance(client: Client, model: string, a: Arc): Promise<{ beat: string; inner: string }> {
    const sys = `你就是${a.protagonist}。${CORES[a.protagonist] ?? ''}${bondCtx(a.chars)}\n${WARM}\n這條線的中心問題：${a.question}。\n${forcingNote(a.forcing)}\n照你這個人、接著剛剛的處境推下一拍。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `剛剛：${a.pressure}\n\n你這一拍？` }], maxTokens: 240, temperature: 0.9 });
    const o = parseObj(r.text) ?? {};
    return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner) };
}
async function judge(client: Client, model: string, a: Arc, beat: string): Promise<{ answered: boolean; answer: string }> {
    const sys = `你是中立裁判，只判：下面這一拍，是否**不可逆地**回答了中心問題「${a.question}」。\n**默認 answered=false。** 只有真做了走不回頭的動作才算 true。**拖延/含糊/「再想」/象徵性動作/光是心裡決定但沒做，全算 false。** 輸出 JSON：{"answered":true/false,"answer":"一句話講她答了什麼(沒答填無)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `這一拍：${beat}` }], maxTokens: 120, temperature: 0.2 });
    const o = parseObj(r.text) ?? {};
    return { answered: o.answered === true, answer: s(o.answer) };
}
let spawnCount = 0;
async function retireSpawn(client: Client, model: string, a: Arc, answer: string, beat: string): Promise<Arc | null> {
    const sys = `${a.protagonist}對「${a.question}」給了不可逆的答案：${answer}（${beat}）。這條線了結退役了。但世界繼續——這個結果**自然、貼著角色**長出一條新的、有自己中心問題的線。${WARM}${bondCtx(a.chars)}\n別重述舊問題、別抓套路。輸出 JSON：{"label":"新線短標籤","protagonist":"主角名(用既有角色)","question":"新線中心問題(一句)","pressure":"開場處境(一句)","chars":"涉及角色(頓號分隔)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '牽出後續線。' }], maxTokens: 220, temperature: 0.8 });
    const o = parseObj(r.text); if (!o || !s(o.question)) return null;
    spawnCount++;
    const prot = s(o.protagonist); const chars = s(o.chars) || a.chars;
    return { id: `s${spawnCount}`, label: s(o.label) || '後續', protagonist: CORES[prot] ? prot : a.protagonist, question: s(o.question), pressure: s(o.pressure) || '剛牽出、未了。', forcing: 0, chars, origin: a.label };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTicks = process.argv[2] ? Number(process.argv[2]) : 12;
    const stopAfterRetired = 3;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 收斂引擎組裝總驗（暖底色 × 雙向暗戀/台上才合法 × 連續多 arc）\n`);

    const arcs: Arc[] = SEEDS.map((a) => ({ ...a }));
    const retiredLog: { label: string; answer: string; spawned?: string; origin?: string }[] = [];
    let lastRetiredBeat = '', lastRetiredArc = '';

    for (let tick = 1; tick <= maxTicks; tick++) {
        const live = arcs.filter((a) => !a.retired);
        if (live.length === 0) break;
        const pickId = await centralitySelect(client, model, live);
        const arc = live.find((a) => a.id === pickId)!;
        const adv = await advance(client, model, arc);
        const j = await judge(client, model, arc, adv.beat);
        console.log(`T${tick} 〔${arc.label}〕${arc.forcing >= 3 ? '（不能再懸）' : ''} ${arc.protagonist}：${adv.beat}\n      （心）${adv.inner}\n      ⟑ ${j.answered ? `**答了 → ${j.answer}**` : '未答'}`);
        arc.pressure = adv.beat;
        if (j.answered) {
            arc.retired = true; arc.answer = j.answer; lastRetiredBeat = adv.beat; lastRetiredArc = arc.label;
            const child = await retireSpawn(client, model, arc, j.answer, adv.beat);
            if (child) { arcs.push(child); console.log(`      ⟐ 退役 →↪ 牽出〔${child.label}〕中心問題：${child.question}（${child.protagonist}｜${child.chars}）`); }
            retiredLog.push({ label: arc.label, answer: j.answer, spawned: child?.label, origin: arc.origin });
            if (retiredLog.length >= stopAfterRetired) { console.log(`\n（${stopAfterRetired} 條 arc 已收斂退役、世界自我續命——夠看組合行為了，止）`); break; }
        } else arc.forcing++;
    }

    console.log(`\n${'═'.repeat(78)}\nARC 生命週期（看連貫鏈 + 無漂無轉）\n${'═'.repeat(78)}`);
    for (const r of retiredLog) console.log(`  ✓〔${r.label}〕${r.origin ? `（承自「${r.origin}」）` : '（種子）'} → 答：${r.answer}${r.spawned ? ` → 牽出「${r.spawned}」` : ''}`);
    const stillOpen = arcs.filter((a) => !a.retired);
    if (stillOpen.length) console.log(`  ◦ 仍開：${stillOpen.map((a) => `〔${a.label}〕`).join('、')}（連接組織、餵下一場）`);

    // one warm POV of the last retired moment — proof the 底色 is warm + the 柳↔蘇 love reads right
    if (lastRetiredBeat && (lastRetiredArc.includes('暗戀') || lastRetiredArc.includes('去留') || lastRetiredArc.includes('退役'))) {
        const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台與台上的質地：身段、調門、水袖、台下目光、戲假情真；含蓄、戲味、暖。', emotionalStance: 'tender' };
        const snap: characterWorker.CharacterSnapshot = { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '收束', physicalFacts: CORES['柳生春'], attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } };
        const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
        const user = characterWorker.buildPovUserPrompt({ character: snap, triggerNarrative: `這條〔${lastRetiredArc}〕的線到了收束的這一刻。`, recentMemorySnippets: ['師父臨終把摺扇給你，只說「戲比天大」。', '你和師姐的真情，只有台上演杜麗娘與柳夢梅時才被許可呼吸。'], relationshipHints: [BOND], sceneBeats: [lastRetiredBeat], state: { hunger: 0.3, fatigue: 0.5, mood: 0.1, note: '暖底色。張力來自難言的愛與不得不的選擇，不是悲苦。' } });
        const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1100, temperature: 0.85 });
        console.log(`\n${'─'.repeat(78)}\n━━━━ 暖底色 POV（看 ① 底色暖不暖 ② 柳↔蘇 雙向暗戀/台上才合法 讀不讀得到）━━━━\n${r.text.trim()}\n`);
    }
    console.log('看：① 連續多 arc：種子→收斂退役→牽 aftermath→再收斂，鏈是否連貫(無漂無轉);② centrality 是否一路按在情感核心、沒被岔開;③ 底色是否回暖(愛/思慕/難言，非血腥狗血);④ 柳↔蘇 是否讀成雙向暗戀+台上才合法+退役之惜。');
}

main().catch((e) => { console.error(e); process.exit(1); });
