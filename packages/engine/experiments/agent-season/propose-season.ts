/**
 * AGENT-SEASON · PROPOSE-SEASON — the next season's question grows out of the
 * prior season's ENDING (theme rotation; no more 重啟戲箱 forever).
 * ============================================================================
 * The showrunner's legitimate move under the non-control axiom: read the world
 * as it now stands (live wants, relationship views, promoted pairs, money,
 * what the finale settled) and PROPOSE central questions for the next season —
 * world facts and stakes only, never anyone's lines or choices. The Saga owner
 * picks one; the chosen theme-N.json feeds run.ts via SEASON_THEME_FILE.
 *
 * Run:
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/propose-season.ts --restore <prior outDir> [--out <dir>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCast } from './world.ts';
import { restoreCast, type CastSnapshot } from './persistence.ts';

const argv = process.argv.slice(2);
function arg(name: string, dflt: string): string {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
const RESTORE = arg('--restore', '/Users/harperdelaviga/endless-story-new/internal/season-runs/real-28d-w4');
const OUT_DIR = arg('--out', import.meta.dirname);

async function main(): Promise<void> {
    const { text: llmText } = await import('@endless-story/llm');
    const cast = buildCast(['柳生春', '蘇映雪', '金鳳', '白韻秋', '沈雪笙', '江聞鶴', '連翹']);
    const snap = JSON.parse(fs.readFileSync(path.join(RESTORE, 'cast-state.json'), 'utf-8')) as CastSnapshot;
    restoreCast(cast, snap);
    const nameOf = new Map(cast.map((c) => [c.id, c.name]));

    // ── the ending-state evidence pack (world facts only) ──
    const lines: string[] = [];
    for (const c of cast) {
        const wants = c.wants.filter((w) => !w.retired).map((w) => `「${w.desc}」`).join('、') || '（心裡暫無掛記）';
        const views = [...c.relationshipViews.entries()]
            .map(([oid, v]) => `對${nameOf.get(oid) ?? oid}：${v}`)
            .join('；');
        lines.push(`- ${c.name}（${c.role}｜錢 ${c.money}）：掛記 ${wants}${views ? `｜心裡的人：${views}` : ''}`);
    }
    const established = (snap.establishedPairs ?? [])
        .map((k) => k.split('|').map((id) => nameOf.get(id) ?? id).join('×'))
        .join('、');
    const evidence = [
        '# 上一季的結局（第 28 日季末，四週連續）',
        '- 大會串已勝：春雪社重啟戲箱、《白蛇傳》連演告捷，戲箱之問已有答案。',
        '- 序章舊鉤（正典）：霞飛路那頭「新起的戲園」曾放話打對台；沈雪笙箱底有一只停了的懷錶與未了的往事（白蘭）。',
        established ? `- 已相許（世界承認的關係）：${established}` : '',
        '',
        '# 各人此刻的心與處境',
        ...lines,
    ]
        .filter(Boolean)
        .join('\n');

    const client = llmText.createTextClient({ kind: 'primary' });
    const res = await client.chat({
        model: client.defaultModel,
        system: [
            '你是一個 1920 年代上海戲班故事世界的「立局人」。上一季演完了，你要替下一季提案。',
            '鐵則（不可操控公理）：你只設「世界事實」——中心命題、一個有期限的外部事件（終局）、世道的壓力；',
            '你不寫任何角色的台詞、決定或感情走向，不安排誰跟誰怎樣。命題要從上一季的結局自然長出來。',
            '',
            '提出 **3 個候選季主題**，各含：',
            '- title：4-8 字的季名',
            '- centralQuestion：一句中心命題（世界要測的問題，開放式）',
            '- finaleName：終局事件的名字（如「開春對台戲」，是外部世界事實）',
            '- countdownFlavor：一句世道流傳的話（倒數時注入的氛圍，說利害不說指令）',
            '- prologue：4-5 段新序章（只寫世界事實與處境，不寫任何人心裡的決定），每段一個字串',
            '- why：一句話說明它從結局的哪條線長出來',
            '三案要走不同方向（例如：外患/名利、私情入公論、舊事清算——但由你依結局判斷）。',
            '嚴格只輸出 JSON：{"themes":[{...},{...},{...}]}。不要 markdown。',
        ].join('\n'),
        messages: [{ role: 'user', content: evidence + '\n\n替下一季提案。' }],
        maxTokens: 2400,
        temperature: 0.9,
    });
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON in proposal reply');
    const parsed = JSON.parse(jsonMatch[0]) as {
        themes: Array<{ title: string; centralQuestion: string; finaleName: string; countdownFlavor: string; prologue: string[]; why: string }>;
    };

    const md: string[] = ['# 下一季命題提案（讀第 28 日季末狀態）', ''];
    parsed.themes.forEach((t, i) => {
        const file = path.join(OUT_DIR, `theme-${i + 1}.json`);
        fs.writeFileSync(file, JSON.stringify(t, null, 2));
        md.push(`## ${i + 1}. ${t.title}`, '', `**命題**：${t.centralQuestion}`, '', `**終局**：${t.finaleName}｜**世道**：${t.countdownFlavor}`, '', `**由來**：${t.why}`, '', ...t.prologue.map((p) => `> ${p}`), '', `→ \`SEASON_THEME_FILE=${file}\``, '');
        console.log(`\n【${i + 1}】${t.title} — ${t.centralQuestion}\n    終局：${t.finaleName}｜由來：${t.why}`);
    });
    fs.writeFileSync(path.join(OUT_DIR, 'season-proposals.md'), md.join('\n'));
    console.log(`\nproposals: ${path.join(OUT_DIR, 'season-proposals.md')}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
