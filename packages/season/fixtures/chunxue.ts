/**
 * 春雪社 · the three characters this experiment is about.
 *
 * 柳生春 (坤生, a woman who plays 小生) and 蘇映雪 (花旦) are the canonical
 * 青梅竹馬 leads of the spring-snow preset (packages/cli/scripts/stories/
 * spring-snow.json) — stage-lovers 許仙／白素貞. 金鳳 is NEW here: a fiery young
 * 刀馬旦 who has fixed on 柳生春 and cannot bear her drifting back to 師姐 映雪.
 * A love-triangle is the cleanest lab for the thesis, because one shared event
 * (金鳳 asking 柳生春「你昨夜又去師姐房裡了？」) MUST leave three different marks.
 *
 * The `primed` block is each character's salience prior — what she snaps to and how
 * she is inclined to read it. It is the seed of "personality acts before
 * distillation": the same neutral transcript tags land differently on each of them.
 * (The real-LLM path ignores `primed` and infers attention from `temperament` +
 * accumulated state; `primed` is what makes the deterministic path diverge too.)
 */

import type { Persona } from '../src/types.ts';

// 柳生春 — soft off-stage, substitutes care for commitment, dreads being made to choose.
const liu: Persona = {
  id: 'liu',
  name: '柳生春',
  role: '小生（坤生）',
  voice: '清亮挺拔，台下卻軟，話到要緊處就轉開。',
  temperament: '台上是挺拔小生，台下溫柔愛撒嬌、極黏師姐映雪。心軟，怕衝突，最怕被人逼著把話說明白，慣用照顧搪塞承諾。',
  primed: {
    attendsTo: ['師姐', '照顧', '選擇', '查問', '夜訪', '攤牌'],
    // no explicit read for 夜訪 — she should feel the ACT (照顧→tender / 查問→testing),
    // not the topic, so 金鳳's interrogation lands as 試探, not as a tender night.
    reads: { 查問: 'testing', 選擇: 'threatening', 攤牌: 'threatening', 照顧: 'tender', 師姐: 'tender' },
  },
  seedDispositions: [
    { id: 'liu_d1', text: '親密時傾向用照顧代替承諾', strength: 0.45, growsOn: ['tender', 'evasive'], originScene: 'seed', updatedScene: 'seed' },
    { id: 'liu_d2', text: '害怕被要求明確選擇', strength: 0.4, growsOn: ['testing', 'threatening'], originScene: 'seed', updatedScene: 'seed' },
    { id: 'liu_d3', text: '相信映雪終究會原諒自己', strength: 0.5, growsOn: ['tender', 'reassuring'], originScene: 'seed', updatedScene: 'seed' },
  ],
  seedStances: [
    { withId: 'su', trust: 0.7, fear: 0.1, debt: 0.4, suspicion: 0.05, read: '映雪是我台上台下最親的人', updatedScene: 'seed' },
    { withId: 'jin', trust: 0.3, fear: 0.15, debt: 0.1, suspicion: 0.05, read: '金鳳待我熱切，我有點招架不住', updatedScene: 'seed' },
  ],
};

// 金鳳 — new, fierce, possessive; snaps to hesitation and reads it as confession.
const jin: Persona = {
  id: 'jin',
  name: '金鳳',
  role: '刀馬旦',
  voice: '脆亮爽利，話裡帶刀，藏不住心事。',
  temperament: '新進刀馬旦，烈性、直、佔有慾強。認準了柳生春，見不得她往師姐那邊靠。最會盯人臉色、抓話裡的破綻，一個停頓也不放過。',
  primed: {
    attendsTo: ['夜訪', '沉默', '停頓', '師姐', '冷落', '示好', '攤牌'],
    // no explicit read for 夜訪 — the PAUSE (停頓→evasive) must dominate her reading of
    // the pivotal scene, so she takes the hesitation itself as the answer.
    reads: { 沉默: 'evasive', 停頓: 'evasive', 師姐: 'threatening', 冷落: 'humiliating', 示好: 'tender', 攤牌: 'testing' },
  },
  seedDispositions: [
    { id: 'jin_d1', text: '見不得柳生春往師姐那邊靠（獨佔）', strength: 0.5, growsOn: ['threatening', 'evasive', 'humiliating'], originScene: 'seed', updatedScene: 'seed' },
    { id: 'jin_d2', text: '越是被迴避越要抓個明白', strength: 0.45, growsOn: ['evasive', 'testing'], originScene: 'seed', updatedScene: 'seed' },
    { id: 'jin_d3', text: '把冷落記得比誰都久', strength: 0.4, growsOn: ['humiliating', 'perfunctory'], originScene: 'seed', updatedScene: 'seed' },
  ],
  seedStances: [
    // suspicion toward 柳生春 starts BELOW the confront threshold (0.5); only the
    // pivotal scene pushes it over — that is what makes the causal ablation bite.
    { withId: 'liu', trust: 0.35, fear: 0.05, debt: 0.05, suspicion: 0.38, read: '我認準了她，可她的心不定', updatedScene: 'seed' },
    { withId: 'su', trust: 0.2, fear: 0.2, debt: 0, suspicion: 0.5, read: '師姐擋著我的路', updatedScene: 'seed' },
  ],
};

// 蘇映雪 — self-possessed, reputation-first; manages suspicion by withdrawing (避嫌).
const su: Persona = {
  id: 'su',
  name: '蘇映雪',
  role: '花旦',
  voice: '嬌而不媚，唱到傷處眼神先到；人前極自持。',
  temperament: '春雪社台柱花旦，自持、要臉面，把班裡的閒話與名聲看得極重。只有生春知道她也會吃醋。遇到嫌疑先退一步避嫌，把心事往深處壓。',
  primed: {
    attendsTo: ['流言', '嫌疑', '冷落', '示好', '頭牌', '避嫌', '夜訪'],
    reads: { 流言: 'threatening', 嫌疑: 'threatening', 冷落: 'perfunctory', 示好: 'tender', 頭牌: 'testing', 夜訪: 'tender' },
  },
  seedDispositions: [
    { id: 'su_d1', text: '遇到嫌疑先退一步避嫌', strength: 0.45, growsOn: ['threatening', 'testing'], originScene: 'seed', updatedScene: 'seed' },
    { id: 'su_d2', text: '把顏面看得比心事重', strength: 0.5, growsOn: ['humiliating', 'perfunctory', 'threatening'], originScene: 'seed', updatedScene: 'seed' },
    { id: 'su_d3', text: '把吃味往深處壓', strength: 0.4, growsOn: ['tender', 'perfunctory'], originScene: 'seed', updatedScene: 'seed' },
  ],
  seedStances: [
    { withId: 'liu', trust: 0.7, fear: 0.05, debt: 0, suspicion: 0.05, read: '生春是我台上台下的人', updatedScene: 'seed' },
    { withId: 'jin', trust: 0.25, fear: 0.1, debt: 0, suspicion: 0.3, read: '這新來的丫頭，眼裡有火', updatedScene: 'seed' },
  ],
};

export const chunxueCast: Persona[] = [liu, su, jin];
export { liu, su, jin };
