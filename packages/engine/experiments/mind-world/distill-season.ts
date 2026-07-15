/**
 * DISTILL-SEASON — turn a lived season into memories the present-day mind carries.
 * ============================================================================
 * The 憶季 pipeline, generalised: a season was played, its transcript exists, and
 * the mind that lived it should walk out carrying what it learned — not a raw
 * transcript (that is the era self, twenty years old and time-confused), but
 * distilled memories, exactly as internal/canon-extra/memories-huileli.json holds
 * the good years.
 *
 * WHY THIS EXISTS (the user caught it): the reckoning run resumed 柳生春 from
 * mind-world-5, so she carried only the canon memory 「人也飄了」 and had NO
 * memory of the four refusals. Her confession proved nothing about consensus —
 * only that a mind with false memories recalls falsely. To test whether consensus
 * can override a TRUE memory, the mind must first hold one.
 *
 * Uses run.ts's fixed distill prompt (事+緣由 in one line, d372eab).
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/mind-world/distill-season.ts <seasonDir> <名字> <出檔.json>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const [seasonDir, who, outPath] = process.argv.slice(2);
type Msg = { role: 'user' | 'assistant'; content: string };

async function main(): Promise<void> {
    const tr = JSON.parse(fs.readFileSync(path.join(seasonDir, `mind-${who}.json`), 'utf-8')) as Msg[];
    const { text } = await import('@endless-story/llm');
    const client = text.createTextClient({ kind: 'primary' });

    // Same wording as run.ts distill() — keeps the WHY, not just the image.
    const cue =
        '（多年以後，你回望這段日子。把真正刻進心裡的，寫成六到八條記憶——一條一行。' +
        '每條都要有一件具體的事（或一句具體的話、一個具體的物件），' +
        '**並且要帶著你當時為什麼那麼做、當時心裡是什麼滋味**——事跟緣由寫在同一條裡，別只留畫面。' +
        '說人話，不用 JSON，不加編號以外的裝飾。）';
    const res = await client.chat({
        model: client.defaultModel,
        system: '你就是這個人，活在連續的時間裡。只寫你自己親歷親聞的，不編造。',
        messages: [...tr, { role: 'user', content: cue }],
        maxTokens: 900,
        temperature: 0.85,
    });
    const lines = (res.text ?? '')
        .split('\n')
        .map((l) => l.replace(/^[\d一二三四五六七八九十、.．\s・-]+/, '').trim())
        .filter((l) => l.length > 8);

    console.log(`〔${who}〕蒸餾出 ${lines.length} 條：`);
    for (const l of lines) console.log('  ・' + l);
    if (outPath) {
        const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : {};
        prev[who] = lines.map((text) => ({ text }));
        fs.writeFileSync(outPath, JSON.stringify(prev, null, 2));
        console.log(`\n→ ${outPath}`);
    }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
