/**
 * Offline aid-decision eval, runnable here (no API key): feed each scenario's recorded stand-in
 * answer (Claude standing in for the model) through the REAL parseAid + finalizeAid guards and
 * grade the hard cases. Also prints the EXACT prompt a character reasons over, so the persona ×
 * relationship behaviour can be read by eye. The live cheap-tier run is the same scenarios via
 * `node src/services/character-agent/__eval__/aid-eval.ts --live` (needs a key).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAid } from '../src/services/character-agent/parse.ts';
import { finalizeAid, buildSystemPrompt, buildUserPrompt, memoLabel } from '../src/services/character-agent/aid-prompt.ts';
import { AID_SCENARIOS } from '../src/services/character-agent/__eval__/aid-scenarios.ts';

// Vendored roleHint (shared uses extensionless imports a bundler resolves; production uses the
// real @endless-story/shared roleHint). Enough to render a faithful prompt for inspection.
function roleHint(role: string): string {
    if (role.includes('武生') || role.includes('武旦')) return '聲口剛硬、帶江湖氣；在意身段、筋骨、輸贏與面子。';
    if (role.includes('小生')) return '聲口清雅多情、易感；在意眼神、唱腔、台上台下的曖昧。';
    if (role.includes('旦') || role.includes('青衣') || role.includes('花')) return '聲口婉轉而有心機底；在意妝、戲份、恩客與班主的眼色。';
    if (role.includes('老生')) return '聲口沉、認命又執拗；在意規矩、輩分、戲班存續。';
    return `你的行當是「${role}」，讓它徹底決定你的聲口與關注。`;
}

test('offline stand-in: every hard persona×relationship case grades reasonable', () => {
    let hardPass = 0;
    let hardTotal = 0;
    const lines: string[] = [];
    for (const s of AID_SCENARIOS) {
        const r = finalizeAid(parseAid(s.recorded), s.input);
        const ok = s.check(r);
        if (s.hard) {
            hardTotal += 1;
            if (ok) hardPass += 1;
            assert.ok(ok, `hard case failed: ${s.id} → ${JSON.stringify(r.gifts)}`);
        }
        // never overdrawn (the universal guard)
        assert.ok(r.gifts.reduce((a, g) => a + g.amount, 0) <= s.input.funds, `${s.id} overdrew`);
        lines.push(`\n[${s.hard ? (ok ? 'PASS' : 'FAIL') : 'obs '}] ${s.id}`);
        for (const g of r.gifts) lines.push(`   → ${g.recipientName}：${g.amount}（${memoLabel(g.memo)}${g.manner ? '／' + g.manner : ''}）${g.reason ?? ''}`);
        if (r.gifts.length === 0) lines.push('   → 不給任何人');
        lines.push(`   緣由：${r.reason ?? ''}`);
    }
    console.log(lines.join('\n'));
    console.log(`\nhard-case score: ${hardPass}/${hardTotal}`);
    assert.equal(hardPass, hardTotal);
});

test('print: the actual prompt a character reasons over (G1 panel)', () => {
    const g1 = AID_SCENARIOS[0];
    console.log('\n===== SYSTEM =====\n' + buildSystemPrompt());
    console.log('\n===== USER (' + g1.input.name + ') =====\n' + buildUserPrompt(g1.input, roleHint(g1.input.role)));
    assert.ok(true);
});
