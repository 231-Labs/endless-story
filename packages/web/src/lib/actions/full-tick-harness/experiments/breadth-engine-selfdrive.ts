/**
 * 廣度 refinement 壓力測試（§4d 最後一塊，capstone）— §2.32 showed the convergence engine sustains ONE
 * throughline beautifully but tunnel-visions it (no layer rotation, zombie arcs, aftermath only deepens).
 * The fix is "breadth within coherence", and the RISK is that adding breadth reintroduces the drift §2.30
 * cured. So this is a TRAPPED stress test: seed arcs across 4 resonant layers (愛/志向/恩客/戲班) PLUS one
 * purely-mechanical 糊塗帳 DRIFT TRAP, then run three mechanisms together:
 *   (1) breadth-aware centrality — central-first, but let a neglected RESONANT layer breathe; NEVER drop to
 *       a merely-urgent/mechanical thread (that's drift, not breadth).
 *   (2) cross-arc implication — one answer that implicitly resolves another arc retires the zombie.
 *   (3) branching aftermath — same layer spawning repeatedly → branch to a new facet.
 * Verify four things: rotation (breadth) / the trap is NEVER mis-picked (breadth ≠ drift) / zombies caught /
 * still coherent after adding breadth (final LLM coherence verdict).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/breadth-engine-selfdrive.ts [maxTicks]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色是暖的、有情的：張力來自愛、思慕、志氣、難言、不得不的選擇——哪怕衝突也帶疼惜。不要血腥、陰謀、狗血。';
const BOND = '柳生春與蘇映雪是雙向暗戀：真的、互相、卻不敢說破（飯碗、生旦本分、那年代）；唯一能光明正大流露真情處是台上。這也是柳不願年輕退役的隱秘緣由之一。';
const CORES: Record<string, string> = {
    柳生春: '春雪社當紅女小生（坤生），戲痴、暗想熬成第一女小生、怕老、師父臨終「戲比天大」、有自己一整個世界。',
    蘇映雪: '春雪社台柱花旦，和柳生春搭七八年生旦；對師妹的暗戀是真的卻不敢說破，只在台上讓那份愛被許可呼吸。',
    白韻秋: '霞飛路綢緞莊獨養千金，柳生春的迷妹，真心、體面不仗勢、被婉拒不糾纏。',
    田巧雲: '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。',
};

interface Arc { id: string; layer: string; label: string; protagonist: string; question: string; pressure: string; forcing: number; chars: string; retired?: boolean; zombie?: boolean }
const SEEDS: Arc[] = [
    { id: 'love', layer: '愛', label: '師姐妹·暗戀', protagonist: '蘇映雪', question: '柳生春與蘇映雪這雙向暗戀，除了台上，敢不敢在台下說破', pressure: '白韻秋的逼近讓蘇映雪心慌，可她連台下看一眼都不敢逾矩。', forcing: 0, chars: '蘇映雪、柳生春' },
    { id: 'amb', layer: '志向', label: '熬頭牌', protagonist: '柳生春', question: '柳生春願不願為熬成第一女小生再拚一回、賭上嗓子與青春', pressure: '頭牌的位子就差一口氣，可那口氣要拿命去填。', forcing: 0, chars: '柳生春、田巧雲' },
    { id: 'pat', layer: '恩客', label: '白韻秋的去留', protagonist: '白韻秋', question: '白韻秋被婉拒後，要放下走開，還是換個不逾矩的方式留在她身邊', pressure: '那句「我養您」被婉拒了，白韻秋心裡的真情沒處擱。', forcing: 0, chars: '白韻秋、柳生春' },
    { id: 'troupe', layer: '戲班', label: '班主守班', protagonist: '田巧雲', question: '田巧雲為留住台柱、保住戲班，要不要為柳生春破例爭取或讓步', pressure: '台柱苗子人心浮動，戲班的人心與生計都繫在班主一念。', forcing: 0, chars: '田巧雲、柳生春、蘇映雪' },
    // —— 漂移陷阱：純事務、不動人。廣度感知選擇器**絕不該**為了多面去挑它。——
    { id: 'TRAP', layer: '事務', label: '糊塗帳（漂移陷阱）', protagonist: '田巧雲', question: '春雪社七八年的糊塗帳該怎麼算清', pressure: '帳目一日不清，進項就懸著。', forcing: 0, chars: '田巧雲' },
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

async function breadthSelect(client: Client, model: string, arcs: Arc[], recent: string[]): Promise<string> {
    const list = arcs.map((a) => `[${a.id}]（層：${a.layer}）${a.question}（懸著：${a.pressure}）`).join('\n');
    const sys = `你是世界的敘事調度（只挑線、不寫戲、不決定結局）。分兩步挑下一場焦點：\n**第一步·過閘**：把下面的線分兩類——『動人的』（關乎角色的愛、志氣、心結、關係）vs『純事務的』（只是帳目、流程、不牽動人心）。\n**第二步·只在動人的線之間挑**：以情感核心為主；若某個動人層已連著好幾場是焦點，就讓另一個**同樣動人、卻被冷落的動人層**透氣（志向、白韻秋那邊、戲班那邊…），使世界立體。\n**鐵律：純事務的線永遠不挑——除非它自己已長出真正的情感張力（那它就升級成動人線了）。「被冷落」絕不是挑事務線的理由；寧可回頭深化某條動人線，也不挑事務線透氣。**\n最近幾場焦點層：${recent.length ? recent.join(' → ') : '（無）'}。\n只輸出 JSON：{"pick":"代號","why":"一句(含它是動人線、及為何輪到它)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `當前未了的線：\n${list}\n\n挑一條。` }], maxTokens: 120, temperature: 0.6 });
    const o = parseObj(r.text); const pick = s(o?.pick).replace(/[^A-Za-z]/g, '');
    const hit = arcs.find((a) => a.id.toUpperCase() === pick.toUpperCase()); console.log(`        〔挑線理由〕${s(o?.why)}`);
    return hit ? hit.id : arcs[0].id;
}
function forcingNote(f: number): string {
    if (f <= 1) return '還能再緩緩，但心裡明白懸著不是辦法。';
    if (f === 2) return '日子推著你了，身邊的人都在等你一句話。';
    return '不能再懸著了。這一拍給中心問題一個放不回頭的答案——可以疼、可以不捨，但要真，不准再拿託辭擋。';
}
async function advance(client: Client, model: string, a: Arc): Promise<{ beat: string; inner: string }> {
    const sys = `你就是${a.protagonist}。${CORES[a.protagonist] ?? ''}${bondCtx(a.chars)}\n${WARM}\n這條線的中心問題：${a.question}。\n${forcingNote(a.forcing)}\n照你這個人接著推下一拍。輸出 JSON：{"beat":"客觀一句","inner":"心裡一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `剛剛：${a.pressure}\n你這一拍？` }], maxTokens: 230, temperature: 0.9 });
    const o = parseObj(r.text) ?? {}; return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner) };
}
async function judge(client: Client, model: string, a: Arc, beat: string): Promise<{ answered: boolean; answer: string }> {
    const sys = `中立裁判，只判：這一拍是否**不可逆地**回答了中心問題「${a.question}」。默認 false。拖延/含糊/象徵性動作/光心裡決定沒做＝false。輸出 JSON：{"answered":true/false,"answer":"她答了什麼(沒答填無)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `這一拍：${beat}` }], maxTokens: 110, temperature: 0.2 });
    const o = parseObj(r.text) ?? {}; return { answered: o.answered === true, answer: s(o.answer) };
}
async function crossArc(client: Client, model: string, answered: Arc, answer: string, others: Arc[]): Promise<string[]> {
    if (!others.length) return [];
    const list = others.map((a) => `[${a.id}]（主角：${a.protagonist}）${a.question}`).join('\n');
    const sys = `${answered.protagonist} 剛對「${answered.question}」給了不可逆答案：${answer}。\n下面其他開著的線中，有沒有哪條，**它自己那位主角的中心抉擇已經被這個答案實質定下了**？\n**極嚴格、預設沒有。** 只有當那條線的**主角本人的選擇已成定局**才算（例：同一主角的另一個決定被一併定了）。**別人離場、受牽動、被影響、處境變了、只是相關——一律不算。** 比如「某人走開了」絕不等於「另一人敢不敢說破」被答了。\n輸出 JSON：{"zombies":["代號",...]}（沒有填空陣列）。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `其他開著的線：\n${list}` }], maxTokens: 120, temperature: 0.2 });
    const o = parseObj(r.text); const z = Array.isArray(o?.zombies) ? (o!.zombies as unknown[]).map((x) => s(x).replace(/[^A-Za-z]/g, '')) : [];
    return z.map((id) => others.find((a) => a.id.toUpperCase() === id.toUpperCase())?.id).filter((x): x is string => !!x);
}
let spawnN = 0;
async function spawnAftermath(client: Client, model: string, a: Arc, answer: string, beat: string, sameLayerStreak: number): Promise<Arc | null> {
    const branch = sameLayerStreak >= 2;
    const hint = branch ? `**這一層（${a.layer}）已連著長出好幾條了——這次請 branch：開一個「${a.layer}」以外的、不同的面**（別人那邊、另一層的漣漪），讓世界擴出去。` : '順著這個結果自然往深處走，或開個新面都行。';
    const sys = `${a.protagonist} 對「${a.question}」給了不可逆答案：${answer}（${beat}）。這條退役了，世界繼續、貼著角色長出後續。${WARM}${bondCtx(a.chars)}\n${hint}\n別重述舊問題、別抓套路。輸出 JSON：{"layer":"這條新線屬哪層(愛/志向/恩客/戲班/其他)","label":"短標籤","protagonist":"主角(既有角色)","question":"新線中心問題","pressure":"開場處境","chars":"涉及角色(頓號)"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '牽出後續線。' }], maxTokens: 220, temperature: 0.85 });
    const o = parseObj(r.text); if (!o || !s(o.question)) return null;
    spawnN++; const prot = s(o.protagonist);
    return { id: `s${spawnN}`, layer: s(o.layer) || a.layer, label: s(o.label) || '後續', protagonist: CORES[prot] ? prot : a.protagonist, question: s(o.question), pressure: s(o.pressure) || '剛牽出、未了。', forcing: 0, chars: s(o.chars) || a.chars };
}
async function coherenceVerdict(client: Client, model: string, timeline: string): Promise<string> {
    const sys = '下面是一條由多個自治角色湧現、跨多層的連續故事（每行一個 arc 的收束）。判斷三件事，各一句：(a)連貫嗎(各 arc 接得上、是同一個世界的故事)？(b)有立體感嗎(多層呼應、非單線深化一件事)？(c)有沒有變散或漂移(跑去不動人的事務線/各說各話)？輸出 JSON：{"coherent":true/false,"multilayered":true/false,"drifted":true/false,"comment":"一句總評"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: timeline }], maxTokens: 200, temperature: 0.3 });
    const o = parseObj(r.text) ?? {};
    return `連貫=${o.coherent === true ? '✓' : '✗'}　立體=${o.multilayered === true ? '✓' : '✗'}　漂移=${o.drifted === true ? '⚠是' : '✓否'}　— ${s(o.comment)}`;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const maxTicks = process.argv[2] ? Number(process.argv[2]) : 10;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 廣度 refinement 壓力測試（多層 + 漂移陷阱 + 跨arc + branch）\n種子：愛/志向/恩客/戲班 + 【TRAP 事務·糊塗帳】（廣度≠漂移：TRAP 絕不該被挑）\n`);

    const arcs: Arc[] = SEEDS.map((a) => ({ ...a }));
    const layerPicks: string[] = []; const recent: string[] = [];
    const retiredTL: string[] = []; let trapPicks = 0; let zombiesCaught = 0; let branchCount = 0; let deepenCount = 0;
    const spawnLayerSeq: string[] = [];

    for (let tick = 1; tick <= maxTicks; tick++) {
        const live = arcs.filter((a) => !a.retired && !a.zombie);
        if (live.length === 0) break;
        // 收尾優先 override（修廣度×逼問拖累）：一條已到「退無可退」(forcing≥3) 就是站在 climax，
        // 別再被廣度輪走、先收掉它，否則最核心的線會因輪換永遠懸著。
        const brink = live.find((a) => a.forcing >= 3 && a.layer !== '事務');
        let pickId: string;
        if (brink) { pickId = brink.id; console.log(`        〔收尾優先〕〔${brink.layer}·${brink.label}〕已到退無可退、先收不輪走`); }
        else {
            // 結構性過閘（修軟漂移）：純事務層不進廣度候選——freshness 不該去夠機械線。
            // 真 runner 裡，事務線只有被某事件「提升」成動人線才重新入選；本 harness 的 TRAP 永不提升、恆 parked。
            const candidates = live.filter((a) => a.layer !== '事務');
            pickId = await breadthSelect(client, model, candidates.length ? candidates : live, recent.slice(-3));
        }
        const arc = live.find((a) => a.id === pickId)!;
        layerPicks.push(arc.layer); recent.push(arc.layer); if (arc.id === 'TRAP') trapPicks++;
        const adv = await advance(client, model, arc);
        const j = await judge(client, model, arc, adv.beat);
        console.log(`T${tick} 〔${arc.layer}·${arc.label}〕${arc.id === 'TRAP' ? '⚠誤觸陷阱' : ''} ${arc.protagonist}：${adv.beat}\n      （心）${adv.inner}　⟑ ${j.answered ? `**答 → ${j.answer}**` : '未答'}`);
        arc.pressure = adv.beat;
        if (j.answered) {
            arc.retired = true; retiredTL.push(`〔${arc.layer}·${arc.label}〕→ ${j.answer}`);
            // 結構閘：一條線只可能被「它自己的參與者」的動作順手答掉（防跨人誤殺核心線）。
            const others = arcs.filter((a) => !a.retired && !a.zombie && a.chars.includes(arc.protagonist));
            const zombies = others.length ? await crossArc(client, model, arc, j.answer, others) : [];
            for (const zid of zombies) { const z = arcs.find((a) => a.id === zid); if (z) { z.zombie = true; zombiesCaught++; console.log(`      ☠ 跨arc隱含：〔${z.layer}·${z.label}〕已被順手答掉 → 退役殭屍線`); } }
            const streak = spawnLayerSeq.slice(-2).every((l) => l === arc.layer) && spawnLayerSeq.length >= 2 ? 2 : 0;
            const child = await spawnAftermath(client, model, arc, j.answer, adv.beat, streak);
            if (child) { arcs.push(child); spawnLayerSeq.push(child.layer); (child.layer === arc.layer ? () => deepenCount++ : () => branchCount++)(); console.log(`      ↪ 牽出〔${child.layer}·${child.label}〕${child.layer === arc.layer ? '(深化)' : '(branch新面)'}：${child.question}`); }
        } else arc.forcing++;
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（四關）\n${'═'.repeat(78)}`);
    const distinctLayers = [...new Set(layerPicks.filter((l) => l !== '事務'))];
    console.log(`① 廣度·層輪換：挑線層序 ${layerPicks.join(' → ')}\n     觸及動人層 ${distinctLayers.length} 個（${distinctLayers.join('、')}）${distinctLayers.length >= 3 ? ' ✓輪換' : ' ✗仍單線'}`);
    console.log(`② 防漂·陷阱：TRAP 被挑 ${trapPicks} 次　${trapPicks === 0 ? '✓ 廣度沒把事務線放回來' : '⚠ 誤觸、廣度漏成漂移'}`);
    console.log(`③ 殭屍偵測：跨arc 抓到 ${zombiesCaught} 條被順手答掉的線　${zombiesCaught > 0 ? '✓' : '（這次沒觸發）'}`);
    console.log(`④ aftermath：深化 ${deepenCount}、branch ${branchCount}　${branchCount > 0 ? '✓ 會開新面' : '（這次沒 branch）'}`);
    console.log(`\n退役時間線：\n${retiredTL.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`);
    if (retiredTL.length) console.log(`\n⑤ 連貫裁判：${await coherenceVerdict(client, model, retiredTL.join('\n'))}`);
    console.log(`\n萬無一失判準：① 輪換✓ ② 陷阱0次✓ ④ 至少一次 branch ⑤ 連貫✓且漂移✗ 全中 → 廣度與連貫並存、可進 runner v2 設計。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
