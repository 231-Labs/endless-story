/**
 * Aid-decision eval runner. Three modes:
 *
 *   node aid-eval.ts --print     # render the EXACT system + per-scenario prompts a character
 *                                # reasons over (no key). This is "what the agent actually sees".
 *   node aid-eval.ts             # offline: feed each scenario's recorded stand-in answer through
 *                                # the REAL parseAid + finalizeAid guards and grade it (no key).
 *   node aid-eval.ts --live      # call the live cheap-tier model per scenario (needs POE/ANTHROPIC key).
 *
 * The judgment is the model's; the harness only checks that clear-cut cases come out reasonable
 * and prints every decision + reason so the persona-driven (judgment) ones can be read by eye.
 */

import { parseAid } from '../parse.js';
import { buildSystemPrompt, buildUserPrompt, finalizeAid, memoLabel, type AidActionInput, type AidActionResult } from '../aid-prompt.js';
import { AID_SCENARIOS, type AidScenario } from './aid-scenarios.js';

// Vendored copy of @endless-story/shared roleHint, used ONLY so this harness renders the real
// prompt under plain `node` (the shared package uses extensionless imports a bundler resolves).
// Production decideAidAction uses the real shared.roleHint — keep these in sync if traits change.
const ROLE_TRAITS: { match: string[]; hint: string }[] = [
    { match: ['武小生', '武生', '武旦', '刀馬'], hint: '聲口剛硬、帶江湖氣；在意身段、筋骨、輸贏與面子；意象多槍花、步點、汗、台毯。' },
    { match: ['小生', '文小生'], hint: '聲口清雅多情、易感；在意眼神、唱腔、台上台下的曖昧；意象多水袖、燈、月、未說出口的話。' },
    { match: ['花旦', '旦', '青衣', '名伶', '坤伶'], hint: '聲口婉轉而有心機底；在意妝、戲份、恩客與班主的眼色；意象多胭脂、鏡、簾、被看與不被看。' },
    { match: ['老生', '鬚生', '老旦'], hint: '聲口沉、認命又執拗；在意規矩、輩分、戲班存續；意象多茶、賬、舊傷、年歲。' },
    { match: ['富商', '商', '老闆', '東家', '金主'], hint: '聲口精明、習慣算計與排場；在意銀錢、人脈、誰欠誰；意象多賬本、酒席、地契、抽水煙。' },
];
function roleHint(role: string | undefined): string {
    const r = (role ?? '').trim();
    if (!r || r === '—') return '依姓名、外形、屬性與你的描述，建構一個自洽且有辨識度的聲口 — 不要落入泛泛的「戲子」通用腔。';
    for (const t of ROLE_TRAITS) if (t.match.some((m) => r.includes(m))) return t.hint;
    return `你的行當是「${r}」。讓這個行當徹底決定你的聲口、用詞、關注的事與慣用意象，每一句都要像「${r}」的人。`;
}

const renderUser = (input: AidActionInput): string => buildUserPrompt(input, roleHint(input.role));

function printPrompts(): void {
    console.log('='.repeat(76) + '\nSYSTEM PROMPT (角色決策時看到的系統提示)\n' + '='.repeat(76));
    console.log(buildSystemPrompt());
    for (const s of AID_SCENARIOS) {
        console.log('\n' + '='.repeat(76));
        console.log(`SCENARIO ${s.id}  ${s.hard ? '[hard]' : '[judgment]'}\n${s.note}`);
        console.log('='.repeat(76));
        console.log(renderUser(s.input));
    }
}

function printDecision(s: AidScenario, r: AidActionResult, ok: boolean): void {
    const verdict = s.hard ? (ok ? 'PASS' : 'FAIL') : ok ? 'ok' : 'note';
    console.log(`\n[${verdict}] ${s.id}`);
    console.log(`  expect: ${s.note}`);
    if (r.gifts.length === 0) {
        console.log('  decision: 不給任何人');
    } else {
        for (const g of r.gifts) {
            console.log(`  → ${g.recipientName ?? g.recipientId}：${g.amount} ENDLESS（${memoLabel(g.memo)}${g.manner ? `／${g.manner}` : ''}）— ${g.reason ?? ''}`);
        }
    }
    console.log(`  總計給出：${r.gifts.reduce((a, g) => a + g.amount, 0)} / 家底 ${s.input.funds}`);
    console.log(`  整體緣由：${r.reason ?? '(none)'}`);
}

async function run(live: boolean): Promise<void> {
    // live mode is dynamically imported so the offline default never loads the LLM/shared deps.
    let judge: ((input: AidActionInput) => Promise<AidActionResult>) | null = null;
    if (live) {
        const { decideAidAction } = await import('../aid.js');
        judge = (input) => decideAidAction(input);
    }
    let hardPass = 0;
    let hardTotal = 0;
    for (const s of AID_SCENARIOS) {
        const r = judge ? await judge(s.input) : finalizeAid(parseAid(s.recorded), s.input);
        const ok = s.check(r);
        if (s.hard) {
            hardTotal += 1;
            if (ok) hardPass += 1;
        }
        printDecision(s, r, ok);
    }
    console.log(`\nhard-case score: ${hardPass}/${hardTotal}${live ? ' (live cheap-tier)' : ' (offline stand-in)'}`);
    if (hardPass < hardTotal) process.exitCode = 1;
}

const arg = process.argv[2];
const main = arg === '--print' ? async () => printPrompts() : () => run(arg === '--live');
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
