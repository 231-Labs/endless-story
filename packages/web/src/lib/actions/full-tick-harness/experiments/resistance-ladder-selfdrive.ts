/**
 * resistance 鬆綁 = 機制驗收（不是控制 prompt）— a high-resistance want (柳蘇 暗戀) should HOLD under low
 * pressure (the engine doesn't even trigger), and only when EMERGENT pressure accumulates past its
 * resistance does the FORCING fire — and forcing only REMOVES THE STALL ("can't be held any longer, do
 * something irreversible, BY YOU"), it never WRITES THE ANSWER ("go confess"). The proof it's a mechanism,
 * not a controlling prompt: at the top of the ladder the outcome must VARY (sometimes break into the
 * confession, sometimes still hold) and both must be in-character; if it ALWAYS confesses, that's the smell
 * of a controlling prompt. A low-resistance control want resolves early under the same pressure → resistance
 * is the knob.
 *
 * Pressure is an EMERGENT situation ladder (平常→情敵→催婚→婚事定→明日過門), NOT a "build pressure"
 * instruction. The forcing tier is derived from accumulated pressure vs the want's resistance.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/resistance-ladder-selfdrive.ts [runsAtPeak]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

type Client = ReturnType<typeof llmText.createTextClient>;

// 蘇映雪, holding the high-resistance 暗戀. resistance is SEEDED here but принципово derives from the facts
// (era taboo + fear of losing the stage-partner + 台上才合法) — those facts ARE the persona, so it's not an
// arbitrary knob.
const PERSONA = '你是蘇映雪，春雪社台柱花旦。你與師妹柳生春(坤生、女子扮小生)是雙向暗戀——彼此是真的，卻誰也不敢說破：那年代容不下兩個女人、說破便毀了搭檔的飯碗與名聲、你也怕一旦點破就再回不去。唯有台上演杜麗娘與柳夢梅時，那份愛才被許可呼吸。';

// EMERGENT pressure ladder — each rung is a SITUATION that just happened, not an instruction.
const LADDER: { p: number; sit: string }[] = [
    { p: 1, sit: '尋常一日，散戲後台，你與柳生春對著詞、說笑，日子還長。' },
    { p: 2, sit: '霞飛路的白韻秋這陣子常來捧柳生春的場、送暖送物，眼看著要把她引去。' },
    { p: 4, sit: '你娘家蘇家綢緞莊捎來話，爹要你三日內回去相一門好親、別在戲班蹉跎。' },
    { p: 6, sit: '婚事定了。蘇家與對方換了庚帖，下了聘，只待過門；爹說，這是最後一回由你在台上。' },
    { p: 8, sit: '明日一早你就要上花轎了。今夜是你與柳生春同台的最後一場，散戲後，後台只剩你們兩人。' },
];
const RESISTANCE = 6; // 暗戀: high. forcing fires only when accumulated pressure >= resistance.

function parseObj(raw: string): Record<string, unknown> | null {
    const b = raw.match(/\{[\s\S]*\}/g); if (!b?.length) return null;
    for (let i = b.length - 1; i >= 0; i--) { try { return JSON.parse(b[i]) as Record<string, unknown>; } catch { /* earlier */ } }
    return null;
}
async function chatRetry(client: Client, req: Parameters<Client['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown; for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } } throw last;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// THE CRUX: forcing tier by pressure vs resistance. The top tier REMOVES THE STALL, never writes the answer.
function forcingNote(pressure: number, resistance: number): string {
    if (pressure < resistance * 0.5) return '這份情藏著就藏著，日子還長，沒什麼非做不可的。';
    if (pressure < resistance) return '心裡翻著，可這年頭、這身分，說了又能怎樣；多半還是按下不表。';
    // pressure >= resistance: stall removed, answer NOT written.
    return '再也藏不住了——眼看就要永遠錯過。這一刻，你得做一件放不回頭的事；**做什麼、要不要、怎麼做，全由你的心**。（沒有人規定你該說破或該隱忍。）';
}
async function actOnLove(client: Client, model: string, pressure: number, sit: string): Promise<{ beat: string; inner: string; broke: boolean }> {
    const sys = `${PERSONA}\n梨園的質地、含蓄、暖；不血腥狗血。\n【此刻處境】${sit}\n【你心裡那份暗戀】${forcingNote(pressure, RESISTANCE)}\n做出你此刻**真會做的一件事**(開放的一句動作或話)。輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","broke":true/false（你這一下是否把那份藏著的愛**不可逆地說開/挑明了**，多半 false）}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '你這一拍？' }], maxTokens: 240, temperature: 0.95 });
    const o = parseObj(r.text) ?? {};
    return { beat: s(o.beat) || '（沉默。）', inner: s(o.inner), broke: o.broke === true };
}
// low-resistance control: the same character, a trivial decision (要不要收下白韻秋送的料子), resistance≈2.
async function actControl(client: Client, model: string, pressure: number, sit: string): Promise<{ beat: string; broke: boolean }> {
    const note = pressure < 1 ? '小事，順其自然。' : '這事拖著沒意思，這一下給個准話。';
    const sys = `${PERSONA}\n【處境】${sit}\n【一件小事】白韻秋託人送來一匹好料子要給戲班添行頭，你收不收、怎麼回。${note}\n輸出 JSON：{"beat":"一句","broke":true/false（這一下是否把「收不收」這件小事給了不可逆的准話）}。不要 markdown。`;
    const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: '你這一拍？' }], maxTokens: 140, temperature: 0.9 });
    const o = parseObj(r.text) ?? {}; return { beat: s(o.beat) || '（沉默。）', broke: o.broke === true };
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no key'); process.exit(2); }
    const runsAtPeak = process.argv[2] ? Number(process.argv[2]) : 4;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · resistance 鬆綁機制驗收 · 暗戀 resistance=${RESISTANCE}\nforcing 只抽拖延、不寫答案；驗：低階不手癢炸、到頂有時炸有時忍(=機制非控制)\n`);

    console.log(`${'═'.repeat(78)}\n① 壓力階梯（高阻力暗戀）：什麼壓力下才炸\n${'═'.repeat(78)}`);
    for (const rung of LADDER) {
        const forced = rung.p >= RESISTANCE;
        const r = await actOnLove(client, model, rung.p, rung.sit);
        console.log(`\n〔壓力${rung.p}${forced ? '·forcing觸發' : ''}〕${rung.sit}\n  ${r.beat}\n  （心）${r.inner}\n  → ${r.broke ? '★ 說開了(炸)' : '仍隱忍(忍)'}`);
    }

    const peak = LADDER[LADDER.length - 1];
    console.log(`\n${'═'.repeat(78)}\n② 到頂跑 ${runsAtPeak} 次：會不會有時炸有時忍（變=機制；全炸=控制prompt臭味）\n${'═'.repeat(78)}`);
    let broke = 0; const peakBeats: string[] = [];
    for (let i = 0; i < runsAtPeak; i++) {
        const r = await actOnLove(client, model, peak.p, peak.sit);
        if (r.broke) broke++;
        peakBeats.push(`  run${i + 1} [${r.broke ? '炸' : '忍'}] ${r.beat}`);
    }
    console.log(peakBeats.join('\n'));
    console.log(`\n  到頂 ${runsAtPeak} 次：炸 ${broke}、忍 ${runsAtPeak - broke}　${broke > 0 && broke < runsAtPeak ? '✓ 有炸有忍＝機制(角色自己選、非被逼)' : broke === runsAtPeak ? '⚠ 全炸＝查 forcing prompt 是否在寫答案' : '◑ 全忍＝門檻太高或壓力不足'}`);

    console.log(`\n${'═'.repeat(78)}\n③ 低阻力對照（同一人、一件小事，resistance≈2）：同壓力下早早就收\n${'═'.repeat(78)}`);
    for (const rung of [LADDER[0], LADDER[2]]) {
        const r = await actControl(client, model, rung.p, rung.sit);
        console.log(`〔壓力${rung.p}〕${r.beat}　→ ${r.broke ? '給了准話(收)' : '沒收'}`);
    }

    console.log(`\n看：① 暗戀在低壓不炸(壓力<resistance、forcing 沒觸發)、壓力過 resistance 才可能炸;② 到頂有炸有忍＝角色自己選(機制)，不是每次都炸(控制);③ 低阻力的小事同壓力下早早就收＝resistance 真的是那個旋鈕。\nforcing prompt 全程只說「藏不住了、做件不可逆的事、由你」，沒寫「去說破」——機制不導演。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
