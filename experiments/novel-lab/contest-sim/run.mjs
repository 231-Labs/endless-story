/**
 * Decoupled contest-model sim — NO product imports. Pure model exploration.
 *
 * Question (from the design review): how should a contested drama resource be WON?
 *   · A  current product  → highest TENSION (unmet desire) wins; skill-blind.
 *   · B  proposed         → relevant SKILL × desire wins (唱片→唱腔, 頭牌→台緣…).
 *   · C  proposed+innate   → desire × (0.7·skill + 0.3·innate-attr).
 *
 * We run many noisy contests across the 5 spring-snow resources with the real
 * 8-cast (skills derived exactly like the product's deriveSagaSkills) and report
 * who wins each resource under each model — to see which produces COHERENT,
 * 行當-true outcomes (with drama variance, no degenerate lock-in), and to surface
 * design gaps (e.g. does any resource serve the 武 行當?).
 *
 * Run: node experiments/novel-lab/contest-sim/run.mjs
 */

// ── deriveSagaSkills (copied from packages/web/src/lib/chain/saga-skills.ts) ──
const SKILL_PROFILES = [
  { match: ['刀馬旦','武旦','武生','武小生'], profile: { martial:88, movement:86, stage_presence:72, vocal:55, networking:50, literati:42 } },
  { match: ['花旦','青衣','正旦','坤伶','旦'], profile: { vocal:84, stage_presence:86, movement:74, networking:66, literati:56, martial:42 } },
  { match: ['坤生','乾生','小生'], profile: { vocal:82, stage_presence:84, movement:76, literati:64, networking:56, martial:58 } },
  { match: ['老生','鬚生','老旦'], profile: { vocal:86, literati:80, stage_presence:74, networking:58, movement:56, martial:44 } },
  { match: ['丑'], profile: { networking:84, stage_presence:78, movement:76, literati:70, vocal:60, martial:56 } },
  { match: ['淨','大面','花臉','銅錘'], profile: { martial:82, vocal:78, stage_presence:78, movement:72, networking:50, literati:48 } },
  { match: ['班主','掌事','當家','東家'], profile: { networking:86, literati:78, stage_presence:78, vocal:60, movement:52, martial:48 } },
  { match: ['記者','報','筆','文人','掮客'], profile: { literati:88, networking:84, stage_presence:56, vocal:40, movement:40, martial:38 } },
  { match: ['衣箱','管箱','箱'], profile: { networking:70, literati:68, stage_presence:48, movement:46, vocal:42, martial:42 } },
];
const BALANCED = { vocal:60, movement:60, stage_presence:60, martial:55, literati:58, networking:60 };
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
function deriveSkills(role, w = {}) {
  const base = SKILL_PROFILES.find((g) => g.match.some((kw) => role.includes(kw)))?.profile ?? BALANCED;
  const n = (v) => (typeof v === 'number' ? (v - 70) / 5 : 0);
  const body = n(w.constitution), look = n(w.appearance), wit = n(w.acuity), heart = n(w.disposition);
  return {
    vocal: clamp(base.vocal + heart), movement: clamp(base.movement + body),
    stage_presence: clamp(base.stage_presence + look + heart*0.5), martial: clamp(base.martial + body),
    literati: clamp(base.literati + wit), networking: clamp(base.networking + wit*0.5 + heart*0.5),
  };
}

// ── cast (spring-snow founding_cast: role + innate minAttributes) ──
const CAST = [
  { name:'沈雪笙', role:'班主',   attrs:{appearance:70,constitution:64,acuity:84,disposition:82} },
  { name:'蘇映雪', role:'花旦',   attrs:{appearance:88,constitution:62,acuity:74,disposition:80} },
  { name:'柳生春', role:'坤生',   attrs:{appearance:86,constitution:66,acuity:80,disposition:72} },
  { name:'江聞鶴', role:'乾生',   attrs:{appearance:82,constitution:80,acuity:84,disposition:66} },
  { name:'連翹',   role:'刀馬旦', attrs:{appearance:82,constitution:86,acuity:74,disposition:76} },
  { name:'何阿喜', role:'丑',     attrs:{appearance:58,constitution:66,acuity:84,disposition:74} },
  { name:'唐桂蘭', role:'衣箱',   attrs:{appearance:54,constitution:58,acuity:78,disposition:70} },
  { name:'方競西', role:'記者',   attrs:{appearance:62,constitution:56,acuity:86,disposition:72} },
].map((c) => ({ ...c, skills: deriveSkills(c.role, c.attrs) }));

// ── resources: relevant skill weights + which innate attr backs the skill ──
// (the design proposal — what skill should decide who WINS this resource)
const RESOURCES = [
  { key:'recording', label:'首張唱片灌錄權', skill:{vocal:1.0, stage_presence:0.4}, innate:'disposition' },
  { key:'spotlight',  label:'頭牌名額',      skill:{stage_presence:1.0, vocal:0.4}, innate:'appearance' },
  { key:'partnership',label:'搭檔權',        skill:{stage_presence:0.7, movement:0.6}, innate:'appearance' },
  { key:'naming',     label:'報紙頭條',      skill:{networking:1.0, stage_presence:0.5}, innate:'acuity' },
  { key:'patronage',  label:'堂會包銀',      skill:{vocal:0.8, networking:0.7}, innate:'disposition' },
];

// ── desire: 行當 ambition per resource (who even contends). Backstage 衣箱/記者
//    don't compete for performer resources; everyone else has 行當-shaped wants. ──
function desire(c, resKey) {
  const r = c.role;
  const backstage = /衣箱|記者|箱|報|筆/.test(r);
  if (backstage) return 0;                      // not a performer contender
  const A = { 花旦:{recording:.8,spotlight:.9,partnership:.6,naming:.7,patronage:.5},
              坤生:{recording:.8,spotlight:.85,partnership:.7,naming:.6,patronage:.5},
              乾生:{recording:.8,spotlight:.8,partnership:.7,naming:.6,patronage:.5},
              刀馬旦:{recording:.3,spotlight:.7,partnership:.7,naming:.5,patronage:.4},
              丑:{recording:.3,spotlight:.5,partnership:.4,naming:.6,patronage:.6},
              班主:{recording:.2,spotlight:.3,partnership:.2,naming:.4,patronage:.5} };
  const row = A[r] ?? { recording:.5,spotlight:.5,partnership:.5,naming:.5,patronage:.5 };
  return row[resKey] ?? 0.4;
}

function skillScore(c, res) {
  let s = 0; for (const [k,w] of Object.entries(res.skill)) s += (c.skills[k] ?? 0) * w;
  return s; // ~0..140
}
const noise = (amt) => 1 + (Math.random() * 2 - 1) * amt;

// ── three contest models → winner among contenders ──
function winner(model, res, contenders) {
  let best = null;
  for (const c of contenders) {
    const d = desire(c, res.key); if (d <= 0) continue;
    let score;
    if (model === 'A') score = d * 100 * noise(0.15);                 // tension-only (skill-blind)
    else if (model === 'B') score = d * skillScore(c, res) * noise(0.15); // skill × desire
    else score = d * (0.7 * skillScore(c, res) + 0.3 * (c.attrs[res.innate] ?? 0)) * noise(0.15); // +innate
    if (!best || score > best.score) best = { name: c.name, score };
  }
  return best?.name ?? '（無人爭/平手）';
}

// ── run ──
const K = 4000;
const models = ['A','B','C'];
const MODEL_NAME = { A:'A 現況：張力(慾望)決定，技能無關', B:'B 提案：相關技能×慾望', C:'C 提案+先天：技能×0.7 + 先天屬性×0.3' };

console.log('# 解耦測試：爭搶稀缺資源該由誰勝？\n');
console.log('技能（由 deriveSagaSkills 推導）：');
for (const c of CAST) console.log(`  ${c.name}(${c.role}): 唱${c.skills.vocal} 做${c.skills.movement} 緣${c.skills.stage_presence} 武${c.skills.martial} 文${c.skills.literati} 交${c.skills.networking}`);

for (const res of RESOURCES) {
  console.log(`\n## ${res.label}  (相關技能: ${Object.entries(res.skill).map(([k,w])=>`${k}×${w}`).join(', ')})`);
  for (const model of models) {
    const tally = {};
    for (let i=0;i<K;i++){ const w = winner(model, res, CAST); tally[w]=(tally[w]||0)+1; }
    const dist = Object.entries(tally).sort((a,b)=>b[1]-a[1])
      .map(([n,c])=>`${n} ${(100*c/K).toFixed(0)}%`).join('  ');
    console.log(`  ${MODEL_NAME[model].padEnd(34,' ')} → ${dist}`);
  }
}

// ── coherence checks ──
console.log('\n## 連貫性檢查');
const share = (model,res,name)=>{ let h=0; for(let i=0;i<K;i++) if(winner(model,res,CAST)===name) h++; return h/K; };
const rec = RESOURCES.find(r=>r.key==='recording');
console.log(`  唱片 — 蘇映雪(唱86) 勝率：A=${(share('A',rec,'蘇映雪')*100).toFixed(0)}%  B=${(share('B',rec,'蘇映雪')*100).toFixed(0)}%`);
console.log(`  唱片 — 連翹(唱56,武旦) 勝率：A=${(share('A',rec,'連翹')*100).toFixed(0)}%  B=${(share('B',rec,'連翹')*100).toFixed(0)}%  (A 模型下武旦會搶到唱片＝不合理)`);
// 武 行當 coverage gap
const martialWins = RESOURCES.reduce((acc,res)=>acc+share('B',res,'連翹'),0)/RESOURCES.length;
console.log(`  連翹(武旦) 在 5 種資源的平均勝率(B)：${(martialWins*100).toFixed(0)}%  → 若偏低＝資源組合對「武行當」沒有出路（設計缺口）`);
