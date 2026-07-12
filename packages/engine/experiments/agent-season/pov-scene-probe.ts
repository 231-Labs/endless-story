/**
 * AGENT-SEASON · POV-SCENE PROBE (decoupled, one scene, three lenses).
 * ============================================================================
 * Validates SCENE-LEVEL subjective rendering before any wiring: take ONE real
 * rendered scene (the W1 day-1 撞破, verbatim beats) and have each participant
 * retell it in first person — biased by their persona + secret + relationship
 * view — WITHOUT changing what objectively happened. The "two different plays"
 * effect must come from attention and interpretation, never from new events.
 *
 * Verdict criteria (printed at the end):
 *   · FIDELITY  — every version contains the scene's objective anchor facts
 *                 (機械 substring check on 錨點 tokens).
 *   · DIVERGENCE — pairwise 5-gram overlap between versions is LOW (they are
 *                 not the same text with pronouns swapped).
 *   · My own read (human judge) decides whether the drift is INTERPRETIVE
 *                 (soul) or factual (bug).
 *
 * Run (real LLM):
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local experiments/agent-season/pov-scene-probe.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCast } from './world.ts';

// ── the scene under test: W1 · 第1日·黃昏 · 後台小廂房 · 修羅場 (verbatim) ────
const SCENE_META = {
    venue: '後台小廂房',
    venueHint: '柳生春在戲台後頭的住處',
    clock: '第1日·黃昏',
    kind: '修羅場（蘇映雪聞聲趕來、破門闖進，撞見金鳳×柳生春）',
};
const BEATS: Array<{ name: string; text: string }> = [
    { name: '蘇映雪', text: '扶住門框站定，目光在兩人交纏處一掠而過，隨即垂下眼，聲音穩得像什麼也沒撞見：「金鳳姑娘，班主在前頭找你呢。」' },
    { name: '金鳳', text: '指尖在柳生春後腰那顆痣處不輕不重地一按，這才慢條斯理地抽回手，轉過身去對門口的人笑：「勞蘇姑娘傳話，這就來。」' },
    { name: '柳生春', text: '趁金鳳轉身的當口，一把攥住她的手腕，力道緊得骨節都泛了白，頸邊青筋一跳啞聲道：「金鳳……別走。」' },
    { name: '蘇映雪', text: '抬手將搭在臂上的帕子抖落，替她將領口那粒鬆了的盤扣不疾不徐地繫上，擋住後腰那處紅痕，聲音穩得挑不出一絲褶皺：「師妹，扣子散了，仔細台前人笑。」' },
    { name: '柳生春', text: '鬆開金鳳的手，任師姐替自己繫扣子，垂著眼不敢看她，只低低應了一聲：「曉得了。」' },
];
/** Objective anchor facts every POV version must keep (substring tokens). */
const ANCHORS = ['盤扣', '班主', '傳話'];

const POV_CHARS = ['蘇映雪', '金鳳', '柳生春'];

async function main(): Promise<void> {
    const { text: llmText } = await import('@endless-story/llm');
    const cast = buildCast(['柳生春', '蘇映雪', '金鳳']);
    const byName = new Map(cast.map((c) => [c.name, c]));
    const sceneText = BEATS.map((b) => `${b.name}：${b.text}`).join('\n');
    const outDir = import.meta.dirname;
    const md: string[] = ['# POV-scene probe — 同一場撞破，三個鏡頭', '', `> ${SCENE_META.clock} @ ${SCENE_META.venue} · ${SCENE_META.kind}`, '', '## 客觀分鏡（正史）', ''];
    for (const b of BEATS) md.push(`> **${b.name}**：${b.text}`);
    md.push('');

    const versions = new Map<string, string>();
    for (const who of POV_CHARS) {
        const c = byName.get(who)!;
        const others = cast.filter((o) => o.id !== c.id);
        const ties = others
            .map((o) => {
                const v = c.relationshipViews.get(o.id);
                return v ? `對${o.name}：${v}` : '';
            })
            .filter(Boolean)
            .join('\n');
        // The character's OWN memories that bear on this scene (their private soil).
        const soil = c.thickMemories
            .filter((m) => /金鳳|師姐|映雪|生春|肌膚|暗戀/.test(m.tag + m.text))
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 4)
            .map((m) => `- ${m.text}`)
            .join('\n');
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system: [
                `你就是${c.name}。${c.persona}`,
                `【你心底的事（只有你自己知道）】${c.secret}`,
                ties ? `【你對人的真實感受】\n${ties}` : '',
                soil ? `【你身上帶著的舊事】\n${soil}` : '',
                '',
                '下面是方才那一場的客觀經過（誰做了什麼、說了什麼，一字不差）。',
                '用你的眼睛把這一場重新講一遍：第一人稱、當下時態的敘事（不是日記），四到六段。',
                '鐵則：',
                '- 客觀發生的事一件不許改、一件不許漏——誰的手在哪、誰說了哪句，都照實；',
                '- 但你只寫你「看見、聽見、感覺到」的：你的注意力落在哪、哪個細節刺你、你把它解讀成什麼——這才是你的版本；',
                '- 你看不進別人心裡：別人的心思只能從其言行猜，猜測就寫成猜測；',
                '- 你自己此刻沒說出口的，寫出來。',
                '只輸出敘事正文，不要標題、不要 markdown。',
            ]
                .filter(Boolean)
                .join('\n'),
            messages: [{ role: 'user', content: `【那一場的客觀經過】${SCENE_META.clock}，${SCENE_META.venue}（${SCENE_META.venueHint}）。\n${sceneText}\n\n輪到你（${c.name}）講你的版本。` }],
            maxTokens: 900,
            temperature: 0.9,
        });
        versions.set(who, res.text.trim());
        md.push(`## ${who} 的版本`, '', res.text.trim(), '');
        console.log(`✓ ${who} 版本完成（${res.text.trim().length} 字）`);
    }

    // ── mechanical verdicts ──
    md.push('## 機械判準', '');
    console.log('\n── 機械判準 ──');
    const grams = (s: string, n = 5): Set<string> => {
        const clean = s.replace(/[\s「」『』，。！？；：、—…·()（）]/g, '');
        const out = new Set<string>();
        for (let i = 0; i + n <= clean.length; i++) out.add(clean.slice(i, i + n));
        return out;
    };
    for (const who of POV_CHARS) {
        const v = versions.get(who)!;
        const missing = ANCHORS.filter((a) => !v.includes(a));
        const line = `FIDELITY ${who}: ${missing.length ? `缺錨點 ${missing.join('、')}` : '錨點事實全數在場 ✓'}`;
        console.log(line);
        md.push(`- ${line}`);
    }
    for (let i = 0; i < POV_CHARS.length; i++) {
        for (let j = i + 1; j < POV_CHARS.length; j++) {
            const a = grams(versions.get(POV_CHARS[i])!);
            const b = grams(versions.get(POV_CHARS[j])!);
            let hit = 0;
            for (const x of a) if (b.has(x)) hit++;
            const pct = Math.round((hit / Math.max(1, Math.min(a.size, b.size))) * 100);
            const line = `DIVERGENCE ${POV_CHARS[i]}↔${POV_CHARS[j]}: 5-gram 重疊 ${pct}%（低=真分歧）`;
            console.log(line);
            md.push(`- ${line}`);
        }
    }
    const outPath = path.join(outDir, 'pov-scene-report.md');
    fs.writeFileSync(outPath, md.join('\n'));
    console.log(`\nreport: ${outPath}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
