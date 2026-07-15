/**
 * FURNISH — give a mind the boring memories it never got.
 * ============================================================================
 * 柳生春 carries 35 memories, 22 of them marked importance >= 8. Sixty-three
 * percent of her life is unforgettable. That is not a memory; that is a plot.
 * She has fifty-three Chekhov's guns and not one piece of furniture — so every
 * time she opens her mouth she has to fire one, and the same five props (扇骨 /
 * 小痣 / 晚香玉 / 餛飩 / 相框) turn up in every scene because they are all she owns.
 * Measured: 236 prop mentions across the drift season, top three = 55%.
 *
 * The engine actively prevents furniture from accumulating: distill() compresses
 * BY SALIENCE, which is why 柳生春's self-distillation of those eight days kept
 * the guilt and the love and dropped all four refusals. The mechanism that makes
 * memories only keeps the dramatic ones.
 *
 * This is the inverse pass. It asks the mind for what a real person actually
 * carries: the way she stirred sugar, a bus stop, an argument about nothing, the
 * pattern on a teacup. The prompt must FORCE the trivial, because the model will
 * volunteer turning points every time if you let it — those are what it thinks
 * memories are for.
 *
 * The good years already proved this works: 蔥花配法, that bowl of 餛飩, wiping
 * her mouth with a sleeve, tracing her name on a playbill. Not one is a turning
 * point. That is exactly why they land.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/furnish.ts <名字> <關於誰/哪段> <幾條> <出檔.json>
 */
import * as fs from 'node:fs';
import { CANON } from '../agent-season/canon-seed.ts';
import { WORLD_PREMISE } from '../agent-season/world.ts';

const [who, about, nArg, outPath] = process.argv.slice(2);
const N = Number(nArg ?? 20);

async function main(): Promise<void> {
    const c = CANON[who];
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });

    const system = [
        `你是${c.name}（${c.role}），活在 1920 年代的上海。你就是這個人，活在連續的時間裡。`,
        `【你是誰】${c.description}`,
        `【你心底的事】${c.secret}`,
        `【這個世界】${WORLD_PREMISE}`,
        '',
        '你不是在說故事，你是在回想。回想的時候，人腦子裡浮上來的大半是沒用的東西。',
    ].join('\n');

    // The whole design is in this cue. Every clause is a fence against the model's
    // instinct to hand back turning points — it will produce a plot unless you
    // explicitly forbid one, and forbid it several different ways.
    const cue =
        `（你一個人坐著，想起${about}。不是想那些大事——大事你想了太多回了，今夜不想那些。\n` +
        `你想起的是那些**沒什麼要緊的小事**：她某個習慣性的小動作、某樣東西的氣味或觸感、某句沒頭沒尾的閒話、某天的天氣、某頓飯、某個你當時嫌煩的瑣碎、某次為了芝麻綠豆的事拌嘴、某個你自己都不明白為什麼會記著的畫面。\n\n` +
        `寫${N}條，一條一行。鐵規矩：\n` +
        `一、**每一條都必須是不重要的**。不許是轉折、不許是誓言、不許是心碎、不許是頭一回或最後一回。若一條寫完你覺得「這條有份量」，刪掉重寫。\n` +
        `二、**不許有寓意**。不要在結尾補一句感嘆或體悟。就是那件事，說完就完。\n` +
        `三、**要有具體的東西**：一個物件、一種氣味、一個聲音、一句原話、一個溫度。抽象的感受不算。\n` +
        `四、不許重複用你已經想過八百遍的那幾樣（扇子、後腰的痣、晚香玉、相框）。今夜想別的。\n` +
        `五、說人話，不用 JSON，不加編號以外的裝飾。）`;

    const res = await client.chat({
        model: client.defaultModel,
        system,
        messages: [{ role: 'user', content: cue }],
        maxTokens: 1600,
        temperature: 0.95, // texture wants variance; a tight sampler returns the plot
    });
    const lines = (res.text ?? '')
        .split('\n')
        .map((l) => l.replace(/^[\d一二三四五六七八九十、.．\s・-]+/, '').trim())
        .filter((l) => l.length > 6);

    console.log(`〔${who}〕關於「${about}」的家具 ${lines.length} 件：\n`);
    for (const l of lines) console.log('  ・' + l);
    if (outPath) {
        const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : {};
        // importance 2-4: this IS the point. If furniture scores like a gun, the
        // salience machinery will just fire it, and we are back where we started.
        const add = lines.map((text, i) => ({ text, importance: 2 + (i % 3) }));
        prev[who] = [...(prev[who] ?? []), ...add];
        fs.writeFileSync(outPath, JSON.stringify(prev, null, 2));
        console.log(`\n→ ${outPath}（${who} 累計 ${prev[who].length} 條）`);
    }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
