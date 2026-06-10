/**
 * Aid-decision eval runner. Two modes:
 *
 *   node aid-eval.ts --print     # render the exact system + per-scenario prompts (NO key needed).
 *                                # Lets a human (or another model) read what the agent is asked.
 *
 *   node aid-eval.ts             # call the real cheap-tier LLM per scenario and grade it.
 *                                # Requires POE_API_KEY or ANTHROPIC_API_KEY (see packages/llm).
 *
 * The judgment is the LLM's; this harness only checks that clear-cut cases come out reasonable
 * and prints the model's reason on every case so the borderline (judgment) ones can be read.
 */

import { buildSystemPrompt, buildUserPrompt, decideAidAction } from '../aid.js';
import { AID_SCENARIOS } from './aid-scenarios.js';

async function printPrompts(): Promise<void> {
    console.log('='.repeat(72));
    console.log('SYSTEM PROMPT');
    console.log('='.repeat(72));
    console.log(buildSystemPrompt());
    for (const s of AID_SCENARIOS) {
        console.log('\n' + '='.repeat(72));
        console.log(`SCENARIO ${s.id}  —  ${s.note}  ${s.hard ? '[hard]' : '[judgment]'}`);
        console.log('='.repeat(72));
        console.log(buildUserPrompt(s.input));
    }
}

async function runEval(): Promise<void> {
    let hardPass = 0;
    let hardTotal = 0;
    for (const s of AID_SCENARIOS) {
        const r = await decideAidAction(s.input);
        const ok = s.check(r);
        if (s.hard) {
            hardTotal += 1;
            if (ok) hardPass += 1;
        }
        const verdict = s.hard ? (ok ? 'PASS' : 'FAIL') : ok ? 'ok' : 'note';
        const decision = r.doAid ? `give ${r.amount} → ${r.recipientId} (${r.memo})` : 'no aid';
        console.log(`\n[${verdict}] ${s.id}`);
        console.log(`  expect: ${s.note}`);
        console.log(`  got:    ${decision}`);
        console.log(`  reason: ${r.reason ?? '(none)'}`);
    }
    console.log(`\nhard-case score: ${hardPass}/${hardTotal}`);
    if (hardPass < hardTotal) process.exitCode = 1;
}

const mode = process.argv.includes('--print') ? printPrompts : runEval;
mode().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
