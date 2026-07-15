// One-shot verdict: run the season (deterministic model) with and without the
// pivotal scene, then print a PASS/FAIL gate on the six evaluation criteria +
// invariants. Pure offline — the "does individualised memory do real work?" gate,
// the same discipline as packages/economy/driver/report.ts. Run from anywhere:
//   node packages/season/driver/report.ts

import { makeAsk } from '../src/llm.ts';
import { runSeason } from '../src/engine.ts';
import { analyze } from '../src/metrics.ts';
import { chunxueCast } from '../fixtures/chunxue.ts';
import { season, seasonWithoutPivotal, PIVOTAL_SCENE_ID } from '../fixtures/season.ts';

const ask = makeAsk({ mock: true });
const full = await runSeason(chunxueCast, season, ask);
const ablated = await runSeason(chunxueCast, seasonWithoutPivotal, ask);
const a = analyze(full, ablated, { pivotalId: PIVOTAL_SCENE_ID, pivotalDay: 3, focus: 'jin', probeSceneId: 's5' });

const lines: string[] = [];
lines.push('# 個體化記憶驗證報告（deterministic）\n');
lines.push('一場談話 → 三份私人現實：');
for (const x of a.divergence.affair) lines.push(`  ${x.name.padEnd(4)} 記於 ${x.sceneId}：${x.reading}【${x.valence}】`);
lines.push('\n## 六項評估 + 不變量');
let allPass = true;
for (const c of a.checks) {
  if (!c.pass) allPass = false;
  lines.push(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.id}\n        ${c.detail}`);
}
lines.push(`\n${allPass ? 'ALL PASS — 機制驗證通過（gate open）' : 'SOME FAIL — 調參數／場次後重跑'}`);

process.stdout.write(lines.join('\n') + '\n');
if (!allPass) process.exit(1);
