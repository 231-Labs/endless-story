/**
 * Re-grounding 基石測試 — does a coherent, focused, multi-layer, convergent story EMERGE from autonomous
 * characters acting on their OWN wants + collisions, with NO top-down selector, NO breadth knob, NO cards?
 *
 * The re-grounding claim (last turns): move want/pressure INTO each character; the engine becomes thin
 * (resolve collisions). Test it with the engine's own tension model living in the characters:
 *   tension(want) = weight × (1 − satisfaction)
 *   - WHO acts each round = the character whose max-tension want is globally highest (salience; the ONLY
 *     "who goes" rule — not a narrative selector).
 *   - Acting raises that want's satisfaction → drops its tension → another want surfaces. So BREADTH should
 *     emerge from satisfaction dynamics, NOT a freshness knob.
 *   - A mechanical want (虧空) is given LOW weight → its tension rarely tops the list → DRIFT-prevention
 *     should emerge from weight, NOT a structural gate.
 *   - Actions are OPEN free text (no cards). A collision (acting on/toward another) ripples into others'
 *     wants. FOCUS should emerge where the hottest collision is.
 *   - NO forcing baked in: observe whether wants CONVERGE (resolve) or CHURN. Churn ⇒ forcing is still
 *     needed, just relocated into the character (a want under sustained tension → irreversible move).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/emergent-want-engine-selfdrive.ts [rounds]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
const WARM = '底色暖、有情：張力來自愛、思慕、志氣、難言、不得不的選擇；不要血腥狗血。';

interface Want { id: string; layer: string; desc: string; weight: number; sat: number; sat0: number; target?: string; retired?: boolean }
interface Char { name: string; persona: string; rel: string[]; wants: Want[] }
const w = (id: string, layer: string, desc: string, weight: number, sat: number, target?: string): Want => ({ id, layer, desc, weight, sat, sat0: sat, target });

const CAST: Char[] = [
    { name: '柳生春', persona: '春雪社當紅女小生(坤生)，戲痴、台上風流台下嬌軟、師父臨終「戲比天大」。', rel: ['對蘇映雪：雙向暗戀、不敢說破、台上才是唯一合法宣洩。', '對白韻秋：真心待你、你說了再想想的好人。'], wants: [
        w('liu_love', '愛', '跟師姐在台上演對手戲——那是唯一能光明正大愛她的地方', 0.9, 0.3, '蘇映雪'),
        w('liu_amb', '志向', '熬成春雪社第一女小生', 0.6, 0.2),
    ] },
    { name: '蘇映雪', persona: '春雪社台柱花旦，端莊會圓場，和柳生春搭七八年生旦。', rel: ['對柳生春：雙向暗戀、不敢說破、台上才敢。', '對白韻秋：恨不起來的、真心的好人。'], wants: [
        w('su_love', '愛', '守住跟柳生春只在台上的默契，別讓白韻秋分走她', 0.88, 0.32, '柳生春'),
    ] },
    { name: '白韻秋', persona: '霞飛路綢緞莊獨養千金、柳生春的迷妹，真心、體面不仗勢、被婉拒不糾纏。', rel: ['對柳生春：放在心尖上、說了「我養您」的人。'], wants: [
        w('bai_pursue', '恩客', '親近柳生春、找個不逾矩的方式留在她身邊', 0.9, 0.15, '柳生春'),
    ] },
    { name: '田巧雲', persona: '春雪社班主當家，精明持重、算盤先於情分卻也疼底下人。', rel: ['對柳生春：戲班的台柱苗子。', '對鄭月卿：跟了多年的老人。'], wants: [
        w('tian_troupe', '戲班', '留住台柱、保住春雪社不散', 0.8, 0.3),
        w('tian_debt', '事務', '平掉戲班七八年的虧空', 0.5, 0.2),
    ] },
    { name: '鄭月卿', persona: '春雪社老牌花旦、當年的第一旦，這幾年眼看被後浪蓋過。', rel: ['對蘇映雪：來勢洶洶的後輩，戲是真好。'], wants: [
        w('zheng_amb', '志向', '別被後浪蓋過、守住自己僅剩的戲份', 0.78, 0.25, '蘇映雪'),
    ] },
];

const tension = (x: Want) => x.weight * (1 - x.sat);
const GAIN: Record<string, number> = { 小: 0.15, 中: 0.32, 大: 0.55 };
const DECAY = 0.6; // a single beat's satisfaction fades back toward baseline; the want persists until resolved.

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const findChar = (name: string) => CAST.find((c) => c.name === name);

async function act(client: Client, model: string, c: Char, want: Want, transcript: string): Promise<{ action: string; inner: string; gain: string; resolved: boolean }> {
    const sys = `你就是${c.name}。${c.persona}\n${c.rel.join('\n')}\n${WARM}\n你此刻心裡最重的一件事：「${want.desc}」${want.target ? `（牽涉${want.target}）` : ''}。沒人發號施令、沒人逼你；看著剛剛的經過，**做出你此刻真會做的一件事**去靠近它（開放的一句動作或話，不是選項）。\n輸出 JSON：{"action":"你做了/說了什麼(一句)","inner":"心裡一句","gain":"這一下讓你那件心事推進了多少：小/中/大","resolved":true/false（這一下是否把這件心事**不可逆地了結**了，多半 false）}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【經過】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 230, temperature: 0.9 });
    const o = parseObj(r.text) ?? {};
    return { action: s(o.action) || '（沉默。）', inner: s(o.inner), gain: ['小', '中', '大'].includes(s(o.gain)) ? s(o.gain) : '小', resolved: o.resolved === true };
}
async function ripple(client: Client, model: string, actorName: string, action: string): Promise<Array<{ name: string; shift: string; newWant?: string; layer?: string }>> {
    const roster = CAST.map((c) => `${c.name}：${c.wants.filter((x) => !x.retired).map((x) => x.desc).join('；') || '（暫無）'}`).join('\n');
    const sys = `${actorName} 剛做了：「${action}」。\n下面是在場各人此刻的心事。判斷這一下**牽動了誰**：讓誰那件心事更緊(tighten，被刺到/被搶/被冷落)、或更鬆(loosen，被安撫/被滿足)。也可能替某人**牽出一件新的心事**。只報真的被牽動的(0~3 人)。\n各人心事：\n${roster}\n輸出 JSON：{"ripples":[{"name":"誰","shift":"tighten/loosen","newWant":"若牽出新心事寫它(沒有省略)","layer":"新心事屬層(愛/志向/恩客/戲班/其他，有新心事才填)"}]}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '報 ripples。' }], maxTokens: 220, temperature: 0.5 });
    const o = parseObj(r.text); const arr = Array.isArray(o?.ripples) ? o!.ripples : [];
    return arr.map((x) => ({ name: s((x as Record<string, unknown>).name), shift: s((x as Record<string, unknown>).shift), newWant: s((x as Record<string, unknown>).newWant) || undefined, layer: s((x as Record<string, unknown>).layer) || undefined })).filter((x) => x.name);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const rounds = process.argv[2] ? Number(process.argv[2]) : 16;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · re-grounding 基石：want 進角色、開放動作、無 selector、無牌\n規則：tension=weight×(1−sat)，誰最高誰動；行動抬 sat、漣漪改別人；機械「虧空」低 weight 看會不會自然沉底\n`);

    const transcript: string[] = [];
    const actedLayers: string[] = []; let spawnN = 0, resolvedN = 0;
    let newWantId = 0;

    for (let round = 1; round <= rounds; round++) {
        // a beat's satisfaction fades back toward baseline (yearning returns); the want persists till resolved.
        for (const c of CAST) for (const x of c.wants) if (!x.retired) x.sat = x.sat0 + (x.sat - x.sat0) * DECAY;
        // salience: globally highest-tension live want acts. THE ONLY "who goes" rule.
        let pick: { c: Char; x: Want } | null = null;
        for (const c of CAST) for (const x of c.wants) if (!x.retired) { if (!pick || tension(x) > tension(pick.x)) pick = { c, x }; }
        if (!pick) break;
        const { c, x } = pick;
        const r = await act(client, model, c, x, transcript.join('\n') || '（戲還沒開場。）');
        actedLayers.push(x.layer);
        transcript.push(`${c.name}：${r.action}`);
        console.log(`R${round} 〔${x.layer}〕${c.name}（張力${tension(x).toFixed(2)}）：${r.action}\n        （心）${r.inner}`);
        if (r.resolved) { x.retired = true; resolvedN++; console.log(`        ⟐ 了結退役：「${x.desc}」`); }
        else x.sat = Math.min(1, x.sat + (GAIN[r.gain] ?? 0.15));
        // collision ripple → others' wants tighten/loosen, maybe a new want.
        const rip = await ripple(client, model, c.name, r.action);
        for (const e of rip) {
            const tc = findChar(e.name); if (!tc) continue;
            const live = tc.wants.filter((y) => !y.retired);
            if (e.shift === 'tighten' && live.length) { const y = live.sort((a, b) => tension(b) - tension(a))[0]; y.sat = Math.max(0, y.sat - 0.18); }
            else if (e.shift === 'loosen' && live.length) { const y = live.sort((a, b) => tension(b) - tension(a))[0]; y.sat = Math.min(1, y.sat + 0.15); }
            if (e.newWant) { spawnN++; newWantId++; tc.wants.push(w(`spawn${newWantId}`, e.layer || '其他', e.newWant, 0.7, 0.2)); console.log(`        + ${tc.name} 牽出新心事〔${e.layer || '其他'}〕${e.newWant}`); }
        }
    }

    console.log(`\n${'═'.repeat(78)}\n判讀\n${'═'.repeat(78)}`);
    const counts = actedLayers.reduce<Record<string, number>>((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});
    console.log(`行動層序：${actedLayers.join(' → ')}`);
    console.log(`層分佈：${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('、')}　|　了結 ${resolvedN}、牽出新心事 ${spawnN}`);
    const debtActs = counts['事務'] ?? 0;
    console.log(`機械「事務(虧空)」被行動 ${debtActs} 次　${debtActs === 0 ? '✓ 低 weight 自然沉底、無需結構閘' : debtActs <= 1 ? '◑ 偶爾浮起' : '⚠ 漂移了'}`);

    // emergence verdict
    const SOUL = '你是中立評審。下面是一段「沒有導演、沒有選擇器」、純由角色各自的心事驅動 + 碰撞長出來的戲。判斷五件事，各一句：(a)有焦點嗎(戲有沒有一個中心、還是一盤散沙)？(b)有廣度嗎(多層多人都活、非只一條)？(c)有收斂嗎(心事有推進/了結，還是原地空轉)？(d)連貫嗎(像同一個世界的一個故事)？(e)有沒有漂去不動人的事務線？輸出 JSON：{"focus":bool,"breadth":bool,"converge":bool,"coherent":bool,"drifted":bool,"comment":"一句總評"}。不要 markdown。';
    const jr = await chatRetry(client, { model, system: SOUL, messages: [{ role: 'user', content: transcript.join('\n') }], maxTokens: 240, temperature: 0.3 });
    const j = parseObj(jr.text) ?? {};
    console.log(`\n評審：焦點=${j.focus === true ? '✓' : '✗'}　廣度=${j.breadth === true ? '✓' : '✗'}　收斂=${j.converge === true ? '✓' : '✗（空轉？）'}　連貫=${j.coherent === true ? '✓' : '✗'}　漂移=${j.drifted === true ? '⚠是' : '✓否'}\n　— ${s(j.comment)}`);
    console.log(`\n看：① 焦點/廣度有沒有「自己」長出來(無 selector、無 freshness 旋鈕);② 機械虧空是否靠低 weight 自然沉底(無結構閘);③ 收斂成不成——若空轉(converge ✗)＝forcing 仍必要、只是要搬進角色的 want 動態(持續高張力的 want→逼出不可逆動作)。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
