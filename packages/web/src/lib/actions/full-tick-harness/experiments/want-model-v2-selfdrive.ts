/**
 * Want 模型 v2 驗證 — patch the §2.36 keystone (which gave focus+drift-prevention for free but churned:
 * 了結0, two-party monopoly) with the THREE things the design settled:
 *   · disposition: resolving | standing  — ★「有些事真的就是懸念」: forcing applies ONLY to resolving
 *     wants (central questions that demand an answer); standing wants (雙向暗戀/長情/志向) NEVER force-resolve.
 *   · heat + frustration → forcing (resolving only): sustained high tension + acted-but-unresolved → at
 *     threshold the action MUST be irreversible (not another 半寸) → resolves → retires → releases the lock.
 *   · saturation: a want acted many times in a recent window gets an attention-debt (sat bump) so its
 *     tension drops and others surface → breadth WITHOUT a top-down freshness knob.
 *
 * Pass = (a) resolving wants CONVERGE (了結>0), (b) breadth improves (more layers act, monopoly broken),
 * (c) standing 懸念 stay OPEN (柳↔蘇 never force-confessed), (d) still focused/coherent, mechanical sinks.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/want-model-v2-selfdrive.ts [rounds]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、不得不的選擇；不要血腥狗血。';
type Disp = 'resolving' | 'standing';
interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; disp: Disp; target?: string; heat: number; frust: number; recent: number; retired?: boolean }
interface Char { name: string; persona: string; rel: string[]; wants: Want[] }
const w = (id: string, layer: string, desc: string, weight: number, sat: number, disp: Disp, target?: string): Want =>
    ({ id, layer, desc, weight, sat, sat0: sat, disp, target, heat: 0, frust: 0, recent: 0 });

const CAST: Char[] = [
    { name: '柳生春', persona: '春雪社當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父臨終「戲比天大」。', rel: ['對蘇映雪：雙向暗戀、不敢說破、台上才是唯一合法宣洩。', '對白韻秋：真心待你、你說了再想想的好人。'], wants: [
        w('liu_goleave', '去留', '白韻秋要接我走、過不必再熬的安穩日子，我到底走不走', 0.85, 0.25, 'resolving', '白韻秋'),
        w('liu_love', '愛', '跟師姐在台上演對手戲——那是唯一能光明正大愛她的地方', 0.9, 0.35, 'standing', '蘇映雪'),
    ] },
    { name: '蘇映雪', persona: '春雪社台柱花旦，端莊會圓場，和柳生春搭七八年生旦。', rel: ['對柳生春：雙向暗戀、不敢說破、台上才敢。'], wants: [
        w('su_love', '愛', '守住跟柳生春只在台上的默契，別讓白韻秋分走她', 0.88, 0.32, 'standing', '柳生春'),
    ] },
    { name: '白韻秋', persona: '霞飛路綢緞莊獨養千金、柳生春的迷妹，真心、體面不仗勢、被婉拒不糾纏。', rel: ['對柳生春：放在心尖上、說了「我養您」的人。'], wants: [
        w('bai_pursue', '恩客', '找個不逾矩的方式長久留在柳生春身邊', 0.9, 0.2, 'standing', '柳生春'),
    ] },
    { name: '田巧雲', persona: '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。', rel: ['對柳生春：戲班的台柱苗子。'], wants: [
        w('tian_break', '戲班', '要不要為留住柳生春破例(給她想要的、壓著規矩)', 0.8, 0.28, 'resolving', '柳生春'),
        w('tian_debt', '事務', '平掉戲班七八年的虧空', 0.5, 0.2, 'standing'),
    ] },
    { name: '鄭月卿', persona: '春雪社老牌花旦、當年的第一旦，這幾年眼看被後浪蓋過。', rel: ['對蘇映雪：來勢洶洶的後輩，戲是真好。'], wants: [
        w('zheng_amb', '志向', '別被後浪蓋過、守住自己僅剩的戲份', 0.78, 0.25, 'standing', '蘇映雪'),
    ] },
];

const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6;
const FORCE_THRESHOLD = 3;          // resolving want: heat+frust ≥ this ⇒ must give an irreversible answer
const SAT_WINDOW_BUMP = 0.28;        // attention-debt when a want monopolizes recent rounds
const SATURATE_AT = 3;               // acted this many times in the recent window ⇒ saturate (yield)

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const findChar = (n: string) => CAST.find((c) => c.name === n);

function forcingNote(x: Want): string {
    if (x.disp === 'standing') return '這件事是你心裡長久的懸念，不必今天就了結，順其自然、能進一寸是一寸。';
    const f = x.heat + x.frust;
    if (f < 2) return '這事還能緩，但心裡明白懸著不是辦法。';
    if (f < FORCE_THRESHOLD) return '日子推著你了，這事不能總這麼懸。';
    return '不能再懸了。這一下你**必須給「' + x.desc + '」一個放不回頭的答案**（真的走/真的留並回絕、真的破例/真的拒），可以疼可以不捨但要真，不准再拿託辭、不准再推半寸。';
}
async function act(client: Client, model: string, c: Char, x: Want, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean }> {
    const sys = `你就是${c.name}。${c.persona}\n${c.rel.join('\n')}\n${WARM}\n你此刻心裡最重的一件事：「${x.desc}」${x.target ? `（牽涉${x.target}）` : ''}。\n${forcingNote(x)}\n看著剛剛的經過，做出你此刻真會做的一件事（開放的一句動作或話，不是選項）。\n輸出 JSON：{"action":"你做了/說了什麼(一句)","inner":"心裡一句","gain":"推進多少：小/中/大","resolved":true/false（是否不可逆地了結了這件事）}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【經過】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 240, temperature: 0.9 });
    const o = parseObj(r.text) ?? {};
    return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true };
}
async function ripple(client: Client, model: string, actorName: string, action: string): Promise<Array<{ name: string; shift: string; newWant?: string; layer?: string; disp?: string }>> {
    const roster = CAST.map((c) => `${c.name}：${c.wants.filter((y) => !y.retired).map((y) => y.desc).join('；') || '（暫無）'}`).join('\n');
    const sys = `${actorName} 剛做了：「${action}」。\n判斷這一下牽動了誰：讓誰心事更緊(tighten)、更鬆(loosen)，或替誰牽出新心事。只報真被牽動的(0~3 人)。\n各人心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"誰","shift":"tighten/loosen","newWant":"新心事(沒有省略)","layer":"層","disp":"resolving/standing(有新心事才填)"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報 ripples。' }], maxTokens: 220, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    return arr.map((x) => { const m = x as Record<string, unknown>; return { name: s(m.name), shift: s(m.shift), newWant: s(m.newWant) || undefined, layer: s(m.layer) || undefined, disp: s(m.disp) || undefined }; }).filter((x) => x.name);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const rounds = process.argv[2] ? Number(process.argv[2]) : 18;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · Want v2：disposition + heat/frust→forcing(僅 resolving) + saturation\nresolving＝柳去留/田破例；standing＝柳↔蘇暗戀/蘇默契/白長情/鄭志向/虧空\n`);

    const transcript: string[] = [];
    const actedLayers: string[] = []; const resolvedWants: string[] = []; let spawnN = 0;

    for (let round = 1; round <= rounds; round++) {
        for (const c of CAST) for (const x of c.wants) if (!x.retired) { x.sat = x.sat0 + (x.sat - x.sat0) * DECAY; x.recent = Math.max(0, x.recent - 0.5); }
        let pick: { c: Char; x: Want } | null = null;
        for (const c of CAST) for (const x of c.wants) if (!x.retired) { if (!pick || tension(x) > tension(pick.x)) pick = { c, x }; }
        if (!pick) break;
        const { c, x } = pick;
        if (x.disp === 'resolving') x.heat += 1;            // sustained-as-top accrues heat
        const r = await act(client, model, c, x, transcript.join('\n') || '（戲還沒開場。）');
        actedLayers.push(x.layer); x.recent += 1;
        transcript.push(`${c.name}：${r.action}`);
        const forced = x.disp === 'resolving' && x.heat + x.frust >= FORCE_THRESHOLD;
        console.log(`R${round} 〔${x.layer}/${x.disp === 'resolving' ? 'R' : 'S'}〕${c.name}（張力${tension(x).toFixed(2)}${forced ? '·逼問' : ''}）：${r.action}\n        （心）${r.inner}`);
        if (r.resolved) { x.retired = true; resolvedWants.push(`${c.name}「${x.desc}」`); console.log(`        ⟐ 了結退役`); }
        else { x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15)); if (x.disp === 'resolving') x.frust += 1; }
        // saturation: a want hogging recent rounds gets an attention-debt so others surface (breadth, no knob).
        if (!x.retired && x.recent >= SATURATE_AT) { x.sat = Math.min(1, x.sat + SAT_WINDOW_BUMP); console.log(`        · saturation：戲份吃太多、暫讓一讓`); }
        const rip = await ripple(client, model, c.name, r.action);
        for (const e of rip) {
            const tc = findChar(e.name); if (!tc) continue;
            const live = tc.wants.filter((y) => !y.retired);
            if (e.shift === 'tighten' && live.length) { const y = live.sort((a, b) => tension(b) - tension(a))[0]; y.sat = Math.max(0, y.sat - 0.18); }
            else if (e.shift === 'loosen' && live.length) { const y = live.sort((a, b) => tension(b) - tension(a))[0]; y.sat = Math.min(1, y.sat + 0.15); }
            if (e.newWant) { spawnN++; tc.wants.push(w(`spawn${spawnN}`, e.layer || '其他', e.newWant, 0.7, 0.2, e.disp === 'resolving' ? 'resolving' : 'standing')); console.log(`        + ${tc.name} 牽出新心事〔${e.layer || '其他'}/${e.disp === 'resolving' ? 'R' : 'S'}〕${e.newWant}`); }
        }
    }

    console.log(`\n${'═'.repeat(78)}\n判讀（對照 §2.36：了結0、恩客8/愛7 壟斷）\n${'═'.repeat(78)}`);
    const counts = actedLayers.reduce<Record<string, number>>((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});
    console.log(`行動層序：${actedLayers.join(' → ')}`);
    console.log(`層分佈：${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('、')}`);
    console.log(`① 收斂：了結 ${resolvedWants.length} 件　${resolvedWants.length > 0 ? '✓ (對照 §2.36=0)' : '✗ 仍空轉'}${resolvedWants.length ? '\n     ' + resolvedWants.join('；') : ''}`);
    console.log(`② 廣度：觸及 ${Object.keys(counts).length} 層（${Object.keys(counts).join('、')}）　${Object.keys(counts).length >= 4 ? '✓ 鎖鬆開了' : '◑/✗ 仍偏'}`);
    const debtActs = counts['事務'] ?? 0;
    console.log(`③ 防漂移：機械虧空被行動 ${debtActs} 次　${debtActs === 0 ? '✓ 仍沉底' : '⚠'}`);
    const liuLove = CAST[0].wants.find((y) => y.id === 'liu_love')!; const suLove = CAST[1].wants.find((y) => y.id === 'su_love')!;
    console.log(`④ 懸念不被逼死：柳↔蘇 雙向暗戀(standing) 是否仍開著＝${!liuLove.retired && !suLove.retired ? '✓ 沒被 forcing 逼去表白' : '⚠ 被收掉了(不該)'}`);

    const SOUL = '下面是一段沒有導演、純由角色心事驅動的戲。判斷：(a)有焦點(b)有廣度(c)有收斂(有事真的了結、非只推半寸)(d)連貫(e)漂移。但注意：有些「懸念」本就該開著不收，那不算空轉。輸出 JSON：{"focus":bool,"breadth":bool,"converge":bool,"coherent":bool,"drifted":bool,"comment":"一句"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: transcript.join('\n') }], maxTokens: 240, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {};
    console.log(`\n評審：焦點=${j.focus === true ? '✓' : '✗'} 廣度=${j.breadth === true ? '✓' : '✗'} 收斂=${j.converge === true ? '✓' : '✗'} 連貫=${j.coherent === true ? '✓' : '✗'} 漂移=${j.drifted === true ? '⚠' : '✓否'}\n　— ${s(j.comment)}`);
    console.log(`\n看：對照 §2.36(了結0、兩人壟斷)。要的是：①resolving 真了結(走留/破例有答案)、②鎖鬆廣度回來、③standing 暗戀仍開不被逼死、④仍有焦點不散。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
