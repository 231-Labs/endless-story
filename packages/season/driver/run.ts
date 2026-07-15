/**
 * The season driver — runs 《嫌隙》 over 柳生春／金鳳／蘇映雪 and dumps every
 * artifact to ./out, chain-free. This is the "does individualised memory actually
 * produce differentiated behaviour?" verification step.
 *
 * Run:
 *   node packages/season/driver/run.ts --mock          # deterministic model, no key
 *   AI_PROVIDER=poe POE_API_KEY=… node packages/season/driver/run.ts   # real LLM
 *
 * Pass a key by dropping packages/season/.env.local (or reuse ../web/.env.local):
 *   ZAI_API_KEY=…  (or POE_API_KEY / ANTHROPIC_API_KEY)  [+ AI_PROVIDER to force one]
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAsk } from '../src/llm.ts';
import { runSeason } from '../src/engine.ts';
import { analyze } from '../src/metrics.ts';
import { chunxueCast } from '../fixtures/chunxue.ts';
import { season, seasonWithoutPivotal, PIVOTAL_SCENE_ID } from '../fixtures/season.ts';
import { VALENCE_LABEL, LEDGER_LABEL, type CharacterState, type PrivateSceneMemory, type SeasonResult } from '../src/types.ts';

const argv = process.argv.slice(2);
const mock = argv.includes('--mock');
const outArg = argv.indexOf('--out');
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = outArg >= 0 ? resolve(process.cwd(), argv[outArg + 1]) : join(PKG_DIR, 'out');

const name = (r: SeasonResult, id: string) => r.names[id] ?? id;

function memoryMd(r: SeasonResult, m: PrivateSceneMemory): string {
  const sc = season.find((s) => s.id === m.sceneId);
  const attended = m.attended.map((a) => `\`${a.ref}\`（${a.why}）`).join('、') || '—';
  const rel = m.relationshipUpdates
    .map((u) => `對 ${name(r, u.withId)}：信任 ${sign(u.dTrust)}、畏懼 ${sign(u.dFear)}、虧欠 ${sign(u.dDebt)}、懷疑 ${sign(u.dSuspicion)}　——${u.because}`)
    .join('\n    ') || '—';
  const dispo = m.dispositionUpdates.map((d) => `「${d.text}」${sign(d.dStrength)}`).join('、') || '—';
  const led = m.ledgerSeeds.map((l) => `〔${LEDGER_LABEL[l.kind]}〕${l.text}`).join('、') || '—';
  return [
    `### ${m.sceneId}〈${sc?.title ?? ''}〉 · 第 ${m.day} 日`,
    `- **0 注意**：${attended}`,
    `- **1 經歷**：${m.experience}`,
    `- **2 解釋**：${m.interpretation.reading}　【${VALENCE_LABEL[m.interpretation.valence]}／confidence ${m.interpretation.confidence.toFixed(2)}】`,
    `- **3 關係更新**：${rel}`,
    `- **4 自我敘事**：${m.selfNarrative}`,
    `- **5 行為傾向**：${dispo}`,
    `- **可兌現**：${led}`,
  ].join('\n');
}
const sign = (x: number) => (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2));

function characterMd(r: SeasonResult, st: CharacterState): string {
  const dispo = st.dispositions
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .map((d) => `- ${'█'.repeat(Math.round(d.strength * 10)).padEnd(10, '░')} ${d.strength.toFixed(2)}　${d.text}`)
    .join('\n');
  const stances = st.stances
    .map((s) => `- 對 ${name(r, s.withId)}：信任 ${s.trust.toFixed(2)}｜畏懼 ${s.fear.toFixed(2)}｜虧欠 ${s.debt.toFixed(2)}｜懷疑 ${s.suspicion.toFixed(2)}　「${s.read}」`)
    .join('\n');
  const led = st.ledger.map((l) => `- 〔${LEDGER_LABEL[l.kind]}〕${l.text}　（${l.openedScene} 開${l.status === 'redeemed' ? ` → ${l.redeemedScene} 兌現` : '，未了'}）`).join('\n') || '—';
  return [
    `# ${st.persona.name}（${st.persona.role}）`,
    `> ${st.persona.temperament}`,
    ``,
    `## 季末 · 行為傾向（自優化後）`,
    dispo,
    ``,
    `## 季末 · 對人的私自看法`,
    stances,
    ``,
    `## 帳本 · 承諾／怨懟／疑問／風險`,
    led,
    ``,
    `## 私人記憶流（五層）`,
    ...st.memories.map((m) => memoryMd(r, m)),
  ].join('\n');
}

async function main() {
  const ask = makeAsk({ mock });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  console.log(`\n《嫌隙》開排 · provider = ${ask.provider}${ask.mock ? '（deterministic model，無金鑰）' : '（真 LLM）'}\n`);

  const full = await runSeason(chunxueCast, season, ask);
  const ablated = await runSeason(chunxueCast, seasonWithoutPivotal, ask);
  const a = analyze(full, ablated, { pivotalId: PIVOTAL_SCENE_ID, pivotalDay: 3, focus: 'jin', probeSceneId: 's5' });

  const files: string[] = [];
  const put = (n: string, body: string) => { writeFileSync(join(OUT, n), body); files.push(n); };

  put('result.json', JSON.stringify(full, null, 2));

  // 01 — the showcase: one shared affair, three private realities.
  put(
    '01_divergence.md',
    [
      `# 一場談話，三份私人現實`,
      ``,
      `> 客觀上，只有柳生春夜訪映雪、金鳳當面查問這一樁事。三個人卻各記下一份不一樣的版本——`,
      `> 真正推動後續劇情的，就是這三份現實之間的縫隙。`,
      ``,
      ...a.divergence.affair.map((x) => `- **${x.name}**（記於 ${x.sceneId}）：${x.reading}　【${VALENCE_LABEL[x.valence]}】`),
      ``,
      `## 匿名行動 → 認得出是誰（M2 re-identification）`,
      `| 場 | 匿名動作 | 政策預測的作者 | 真作者 | 對 |`,
      `|---|---|---|---|---|`,
      ...a.reId.guesses.map((g) => `| ${g.sceneId} | ${g.move} | ${g.predicted.map((p) => name(full, p)).join('／')} | ${name(full, g.author)} | ${g.correct ? '✓' : '✗'} |`),
      ``,
      `## 有沒有往事，金鳳的選擇就不同（M3 causal ablation）`,
      `- 有 s3 這段查問記憶：金鳳在攤牌時 → **${a.causal.withPivotal?.move}**（${a.causal.withPivotal?.because}）`,
      `- 抽掉 s3（其餘全同）：金鳳在攤牌時 → **${a.causal.withoutPivotal?.move}**（${a.causal.withoutPivotal?.because}）`,
      `- → 過去經驗真的改變了後續選擇，而不只是被台詞提及：**${a.causal.changed ? '成立' : '未成立'}**`,
    ].join('\n'),
  );

  // 10..12 — each character's five-layer memory stream + self-optimised state.
  for (const c of full.cast) put(`10_${c}_${name(full, c)}.md`, characterMd(full, full.finalStates[c]));

  // 00 — the verdict.
  put(
    '00_report.md',
    [
      `# 《嫌隙》· 個體化記憶驗證報告`,
      ``,
      `模式：${ask.mock ? 'deterministic（本機模型，可重現）' : `真 LLM（${ask.provider}）`}　·　角色：柳生春／金鳳／蘇映雪　·　場次：${season.length}`,
      ``,
      ...a.checks.map((c) => `- [${c.pass ? 'PASS' : 'FAIL'}] **${c.id}**\n      ${c.detail}`),
      ``,
      a.allPass ? `**ALL PASS — 個體化記憶會產生可觀察的差異化行為。**` : `**SOME FAIL — 調參數／場次後重跑。**`,
    ].join('\n'),
  );

  console.log('──────── 報告 ────────');
  for (const c of a.checks) console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.id}\n        ${c.detail}`);
  console.log(`\n${a.allPass ? 'ALL PASS' : 'SOME FAIL'}`);
  if (ask.mock) {
    console.log('\nLLM：mock（deterministic 本機模型，未呼叫）');
  } else {
    const verdict = ask.failures === 0 ? '全部成功 ✓' : `⚠️ ${ask.failures}/${ask.calls} 失敗（退回本機模型）`;
    console.log(`\n真 LLM（${ask.provider}）：呼叫 ${ask.calls} 次，${verdict}，耗時 ${(ask.ms / 1000).toFixed(1)}s`);
    if (ask.failures > 0 && ask.lastError) console.log(`  首個錯誤：${ask.lastError}`);
  }
  console.log(`產物：${files.length} 個檔 → ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
