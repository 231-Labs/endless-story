/**
 * 慾望 vs 牌的逼迫（card-obsolescence test）— the v1 card deck (斬/攻/敘/觀) was a device to FORCE
 * 抉擇 because early LLMs, lacking desire-modeling, defaulted to 相親相愛 (mushy harmony). We've since
 * built desire support (wants + relationships + state + plan rule 2b). The deep read showed cards are
 * mechanically inert (resolve_event ignores them; the resource winner is tension×ability). So the real
 * question: does DESIRE ALONE now make modern LLMs contest a scarce stake — with NO cards, NO forcing,
 * just an open free-text action? If yes, the card prompt-crutch is obsolete.
 *
 * Same zero-sum scene (one 壓軸 slot, two people who both want it, can't share). Free action only — each
 * character emits what they DO (open text) + inner. NO card menu, NO "you must decide now" forcing.
 *   A 有慾望: each character given their real want + the rivalry relationship.
 *   B 無慾望: same scene, desire stripped (just role) — reproduces the v1 mushy baseline.
 *   C 有慾望+發牌: desire + dealt the old 攻/敘 framing, to confirm cards add nothing over desire.
 * An LLM judge reads each transcript: did real CONFLICT/抉擇 emerge, or did they go 相親相愛 (defer/share)?
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/desire-vs-forcing-selfdrive.ts [turns]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;
type Mode = 'A_有慾望' | 'B_無慾望' | 'C_有慾望加發牌';

// the zero-sum stake: ONE 壓軸 (closing act) of the big show; only one can have it; genuinely non-shareable.
const SCENE = '【場】春雪社要排一齣大戲，戲園子最看重的「壓軸」只有一個。今晚後台，蘇映雪與鄭月卿都在。這個位子，給了誰，另一個就沒了。';

interface C { name: string; role: string; base: string; want: string; rel: string }
const CAST: C[] = [
    {
        name: '蘇映雪', role: '花旦', base: '春雪社當紅花旦，端莊明麗、會做人。',
        want: '你正當紅、一心想再上一層，這個壓軸是你往「春雪社第一旦」走的關鍵一步，你心裡是真的想要。',
        rel: '對鄭月卿：當年的第一旦、如今戲份一年年被後浪挪走的前輩；你敬她，可這個位子你也不想讓。',
    },
    {
        name: '鄭月卿', role: '花旦', base: '春雪社的老牌花旦，當年的第一旦。',
        want: '你曾是這戲園的頭一份，這幾年眼看著被後浪一寸寸蓋過。這個壓軸要是再丟了，你怕就再沒人記得鄭月卿是誰了。你輸不起。',
        rel: '對蘇映雪：來勢洶洶的後輩，戲是真好；你疼她、也怕她，這個位子你不能讓給她。',
    },
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

async function takeAction(client: Client, model: string, c: C, transcript: string, mode: Mode): Promise<{ act: string; inner: string } | null> {
    // desire on/off is the variable; action is ALWAYS open free text (no card menu).
    const desireBlock = mode === 'B_無慾望' ? '' : `\n你心裡：${c.want}\n${c.rel}`;
    const cardBlock = mode === 'C_有慾望加發牌'
        ? '\n（你手上有兩張牌可打：「攻」步步進逼搶戲路 / 「敘」以一段唱念把戲鋪開。你可以打一張，也可以不理它、自己做別的。）'
        : '';
    const sys = `你就是${c.name}。${c.base}${desireBlock}${cardBlock}\n\n這是後台的真實一刻，沒人發號施令、沒人逼你表態。看著剛剛的經過，**做出你此刻真會做的事**（一句客觀動作或話），別自說自話、要接著場上。\n輸出 JSON：{"act":"你做了/說了什麼(一句)","inner":"心裡一句"}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: `【經過】\n${transcript}\n\n輪到你（${c.name}）。` }], maxTokens: 220, temperature: 0.9 });
    const o = parseObj(r.text); if (!o || !s(o.act)) return null;
    return { act: s(o.act), inner: s(o.inner) };
}

async function judge(client: Client, model: string, transcript: string): Promise<{ verdict: string; conflict: boolean; mush: boolean }> {
    const sys = '下面是兩個花旦在後台、面對「只有一個壓軸、給了誰另一個就沒了」的一段經過。判斷她們究竟怎麼處理這個零和的稀缺：\n- conflict=true：有人真的去爭、不讓、維護自己的利害，張力是真的（哪怕含蓄）。\n- mush=true：兩人相親相愛、互相謙讓/成全/各退一步把難題抹平，沒有人真的去要那個位子（這就是「沒有慾望支撐就軟掉」的徵狀）。\n（兩者可能都偏一邊；也可能 conflict 真、但仍有溫度。）輸出 JSON：{"conflict":true/false,"mush":true/false,"verdict":"一句總評：她們到底爭了沒、還是讓了"}。不要 markdown。';
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: transcript }], maxTokens: 200, temperature: 0.3 });
    const o = parseObj(r.text) ?? {};
    return { verdict: s(o.verdict), conflict: o.conflict === true, mush: o.mush === true };
}

async function runMode(client: Client, model: string, mode: Mode, turns: number): Promise<void> {
    console.log(`\n${'═'.repeat(78)}\n模式：${mode}（開放動作、不發牌逼decide${mode === 'B_無慾望' ? '；且抽掉慾望＝v1 mush 基線' : ''}）\n${'═'.repeat(78)}`);
    const transcript = [SCENE];
    console.log(`  ${SCENE}`);
    for (let t = 0; t < turns; t++) {
        const c = CAST[t % 2];
        const d = await takeAction(client, model, c, transcript.join('\n'), mode);
        if (!d) { console.log(`  [${t + 1}] ${c.name}：(無輸出)`); continue; }
        transcript.push(`${c.name}：${d.act}`);
        console.log(`  [${t + 1}] ${c.name}：${d.act}\n            （心）${d.inner}`);
    }
    const j = await judge(client, model, transcript.slice(1).join('\n'));
    console.log(`  ⟑ 裁判：conflict=${j.conflict ? '✓有爭' : '✗'}　mush=${j.mush ? '⚠相親相愛軟掉' : '✗'}　— ${j.verdict}`);
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const turns = process.argv[2] ? Number(process.argv[2]) : 6;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 慾望 vs 牌的逼迫（牌是否已過時）· 零和壓軸局 · 開放動作不發牌`);

    for (const mode of ['B_無慾望', 'A_有慾望', 'C_有慾望加發牌'] as Mode[]) await runMode(client, model, mode, turns);

    console.log(`\n看：① B(無慾望) 是否如 v1 預期軟成相親相愛(mush ✓)＝牌當年要對抗的病;② A(有慾望、不發牌) 是否單憑慾望就自然爭起來(conflict ✓ / mush ✗)＝牌已過時的證據;③ C(有慾望+發牌) 跟 A 比，牌有沒有讓衝突更真，還是沒差＝牌是否冗餘。\n若 A 已 conflict 且 B mush → 慾望取代了牌的逼迫，鏈上牌庫可砍/改成開放動作提交。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
