/**
 * Decoupled redesign sim (v2) — NO product imports. Validates the contest model
 * from the design review:
 *
 *   · The EVENT is LLM-director-generated. Each event declares a CONTEST SPEC:
 *       innate (先天 0..1 weights) + skill (後天 0..1 weights) + abilityGate γ.
 *     What decides winning depends on WHAT the resource is (某人的愛→外表/心性 一點點;
 *     唱片→唱腔; 武戲→武場/身段).
 *   · INTENT (memory-derived desire) gates whether you actively contend.
 *   · ABILITY (from the spec) gates whether you can succeed.
 *   · Outcome ≈ (intent + floor) × ability^γ:
 *       - want but can't  → 搶不起 (high intent, low ability → loses);
 *       - able but unwilling → 幾乎不會落到他身上，但可能 (臨危受命) via the floor.
 *
 * Run: node experiments/novel-lab/contest-sim/redesign.mjs
 */

// ── skills (deriveSagaSkills, copied) + innate attrs ──
const SKILL_PROFILES = [
  { match:['刀馬旦','武旦','武生','武小生'], p:{vocal:55,movement:86,stage_presence:72,martial:88,literati:42,networking:50} },
  { match:['花旦','青衣','正旦','坤伶','旦'], p:{vocal:84,movement:74,stage_presence:86,martial:42,literati:56,networking:66} },
  { match:['坤生','乾生','小生'], p:{vocal:82,movement:76,stage_presence:84,martial:58,literati:64,networking:56} },
  { match:['丑'], p:{vocal:60,movement:76,stage_presence:78,martial:56,literati:70,networking:84} },
  { match:['班主','掌事','當家','東家'], p:{vocal:60,movement:52,stage_presence:78,martial:48,literati:78,networking:86} },
  { match:['記者','報','筆','掮客'], p:{vocal:40,movement:40,stage_presence:56,martial:38,literati:88,networking:84} },
  { match:['衣箱','箱'], p:{vocal:42,movement:46,stage_presence:48,martial:42,literati:68,networking:70} },
];
const BAL={vocal:60,movement:60,stage_presence:60,martial:55,literati:58,networking:60};
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
function skills(role,w){ const b=SKILL_PROFILES.find(g=>g.match.some(k=>role.includes(k)))?.p??BAL;
  const n=v=>typeof v==='number'?(v-70)/5:0; const body=n(w.constitution),look=n(w.appearance),wit=n(w.acuity),heart=n(w.disposition);
  return {vocal:clamp(b.vocal+heart),movement:clamp(b.movement+body),stage_presence:clamp(b.stage_presence+look+heart*0.5),martial:clamp(b.martial+body),literati:clamp(b.literati+wit),networking:clamp(b.networking+wit*0.5+heart*0.5)}; }

const CAST=[
  {name:'沈雪笙',role:'班主',  attrs:{appearance:70,constitution:64,acuity:84,disposition:82}},
  {name:'蘇映雪',role:'花旦',  attrs:{appearance:88,constitution:62,acuity:74,disposition:80}},
  {name:'柳生春',role:'坤生',  attrs:{appearance:86,constitution:66,acuity:80,disposition:72}},
  {name:'江聞鶴',role:'乾生',  attrs:{appearance:82,constitution:80,acuity:84,disposition:66}},
  {name:'連翹',  role:'刀馬旦',attrs:{appearance:82,constitution:86,acuity:74,disposition:76}},
  {name:'何阿喜',role:'丑',    attrs:{appearance:58,constitution:66,acuity:84,disposition:74}},
].map(c=>({...c,skills:skills(c.role,c.attrs)}));
const byName=Object.fromEntries(CAST.map(c=>[c.name,c]));

// ── an event = a director-generated CONTEST SPEC + per-character INTENT (memory) ──
// innate/skill: 0..1 weights. gate γ: higher → ability is a harder wall (搶不起).
const EVENTS=[
  { label:'首張唱片灌錄權', innate:{disposition:0.2}, skill:{vocal:1.0,stage_presence:0.4}, gate:2.0,
    intent:{蘇映雪:.8,柳生春:.8,江聞鶴:.85,連翹:.25,何阿喜:.3,沈雪笙:.2} },
  { label:'頭牌名額',      innate:{appearance:0.4}, skill:{stage_presence:1.0,vocal:0.3}, gate:2.0,
    intent:{蘇映雪:.9,柳生春:.85,江聞鶴:.8,連翹:.55,何阿喜:.4} },
  { label:'壓軸武戲台口(新)', innate:{constitution:0.4}, skill:{martial:1.0,movement:0.8}, gate:2.0,
    intent:{連翹:.9,江聞鶴:.5,柳生春:.5,蘇映雪:.2,何阿喜:.3} },
  { label:'沈雪笙的青眼(關注)', innate:{appearance:0.5,disposition:0.5}, skill:{stage_presence:0.2}, gate:1.2,
    intent:{連翹:.9,蘇映雪:.3,柳生春:.3,江聞鶴:.2,何阿喜:.3} }, // 連翹的心底秘密＝意圖最強
  { label:'報紙頭條',      innate:{acuity:0.3}, skill:{networking:1.0,stage_presence:0.4}, gate:1.8,
    intent:{蘇映雪:.7,何阿喜:.6,江聞鶴:.5,柳生春:.5} },
  { label:'救場頂替(無人想要)', innate:{}, skill:{vocal:0.7,stage_presence:0.6}, gate:2.0,
    intent:{} }, // 沒人想要 → 臨危受命：能力最高者被推上去
];

const FLOOR=0.08;            // 臨危受命：即使意圖≈0 仍有微小機率
const noise=a=>1+(Math.random()*2-1)*a;
function ability(c,ev){ let s=0,w=0;
  for(const[k,v]of Object.entries(ev.innate)){s+=(c.attrs[k]/100)*v;w+=v;}
  for(const[k,v]of Object.entries(ev.skill)){s+=(c.skills[k]/100)*v;w+=v;}
  return w>0?s/w:0; } // 0..1
function score(c,ev){ const intent=(ev.intent[c.name]??0); const a=ability(c,ev);
  return (intent+FLOOR)*Math.pow(a,ev.gate)*noise(0.15); }
function winner(ev){ let best=null; for(const c of CAST){const s=score(c,ev); if(!best||s>best.s)best={n:c.name,s};} return best.n; }

const K=5000;
console.log('# 重新設計：意圖(記憶)閘參與 × 能力(先天+後天)閘成敗  — 解耦驗證\n');
console.log('每個事件＝LLM 導演動態生成的「裁決規格」(先天權重 + 後天技能權重 + 能力門檻γ) + 各角意圖\n');
for(const ev of EVENTS){
  const tally={}; for(let i=0;i<K;i++){const w=winner(ev);tally[w]=(tally[w]||0)+1;}
  const dist=Object.entries(tally).sort((a,b)=>b[1]-a[1]).map(([n,c])=>`${n} ${(100*c/K).toFixed(0)}%`).join('  ');
  const spec=[...Object.entries(ev.innate).map(([k,v])=>`先天:${k}×${v}`),...Object.entries(ev.skill).map(([k,v])=>`技:${k}×${v}`)].join(' ');
  console.log(`## ${ev.label}`);
  console.log(`   規格: ${spec}  γ=${ev.gate}`);
  console.log(`   勝率: ${dist}\n`);
}

// ── the three cases the design must satisfy ──
console.log('## 設計三條件驗證');
const rec=EVENTS[0], wu=byName['連翹'];
let recWin=0; for(let i=0;i<K;i++) if(winner(rec)==='連翹') recWin++;
console.log(`  ① 想搶但搶不起：連翹對唱片 意圖0.25、能力(唱)=${(ability(wu,rec)*100|0)} → 勝率 ${(100*recWin/K).toFixed(1)}%  (低能力＝搶不到)`);
const wu2=EVENTS[2], su=byName['蘇映雪'];
console.log(`  ② 行當有出路：連翹對武戲 能力=${(ability(byName['連翹'],wu2)*100|0)}、蘇映雪武戲能力=${(ability(su,wu2)*100|0)} → 武戲多由連翹拿`);
const love=EVENTS[3];
let loveWin=0; for(let i=0;i<K;i++) if(winner(love)==='連翹') loveWin++;
console.log(`  ③ 關係型靠意圖：沈雪笙的青眼 連翹意圖0.9(她的心底秘密) → 勝率 ${(100*loveWin/K).toFixed(0)}%  (外表/心性只佔一點點)`);
const save=EVENTS[5];
const saveTally={}; for(let i=0;i<K;i++){const w=winner(save);saveTally[w]=(saveTally[w]||0)+1;}
const top=Object.entries(saveTally).sort((a,b)=>b[1]-a[1])[0];
console.log(`  ④ 臨危受命：救場無人想要 → 能力最高者(${top[0]})被推上去 ${(100*top[1]/K).toFixed(0)}%  (意圖≈0 仍可能落到能者頭上)`);

// ── the director guideline (what the LLM must emit per event) ──
console.log(`\n## 導演動態生成事件時要給的「裁決規格」指引（contestSpec）`);
console.log(`  {`);
console.log(`    "resource": "唱片灌錄權 | 頭牌 | 武戲台口 | 某人的青眼 | …(可自由命名)",`);
console.log(`    "innate":  { 先天屬性→權重0..1, 只填相關的；如愛慕事件填 appearance/disposition },`);
console.log(`    "skill":   { 後天技能→權重0..1, 只填相關的；如唱片填 vocal },`);
console.log(`    "abilityGate": 1.0–2.5  // 越高＝能力不足越搶不起；關係/意圖型給低(≈1.2)，硬功型給高(≈2)`);
console.log(`  }  // 意圖不由導演填——它從各角色「記憶推導出的當下慾望」算，導演只定「靠什麼本事贏」`);
