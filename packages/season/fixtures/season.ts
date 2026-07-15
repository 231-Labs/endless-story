/**
 * 《嫌隙》— a small story season (劇情季) for the three of 春雪社.
 *
 * Structure = the minimal research unit, staged:
 *   scripted scenes  = controlled STIMULUS — the same objective words hit everyone,
 *                      so divergence can only come from the characters themselves.
 *   enacted scenes   = the characters ACT from accumulated memory — so we can watch
 *                      the same three people behave differently, and test whether the
 *                      pivotal scene CAUSED it (remove s3 → re-run → 金鳳 no longer confronts).
 *
 * The transcript tags (topic/act/tone) are deliberately NEUTRAL and character-
 * agnostic. No line is annotated "for" a particular character; the divergence is
 * produced by each persona's salience prior reading the same tags differently.
 *
 * s3 is the pivotal scene — the exact exchange from the design note:
 *   金鳳:「你昨夜又去師姐房裡了？」 → 生春頓了一頓 → 「去看看她，她嗓子不好。」
 * 三個人記下的，是三份不同的私人現實 (see WRITEUP.md / the run report).
 */

import type { Scene } from '../src/types.ts';

export const PIVOTAL_SCENE_ID = 's3';

export const season: Scene[] = [
  // ── s1 排《斷橋》 — baseline; all three on stage, each reads it differently ──
  {
    id: 's1',
    title: '排《斷橋》',
    kind: 'scripted',
    present: ['liu', 'su', 'jin'],
    setting: '春雪社戲樓，日場排戲',
    day: 1,
    transcript: [
      { ref: 's1.l1', who: 'stage', text: '生春的許仙攙著映雪的白娘子過斷橋。', tags: { topic: '戲', act: '照顧', tone: 'warm' } },
      { ref: 's1.l2', who: 'liu', text: '師姐仔細腳下，這橋滑。', tags: { topic: '師姐', act: '照顧', tone: 'tender' } },
      { ref: 's1.l3', who: 'su', text: '有你在旁邊，我省心。', tags: { topic: '師姐', act: '示好', tone: 'warm' } },
      { ref: 's1.l4', who: 'stage', text: '金鳳在下場門看著，沒人替她引一句。', tags: { topic: '冷落', act: '冷落', tone: 'cold' } },
    ],
  },

  // ── s2 夜探 — the objective event 金鳳 will later be suspicious about ──
  {
    id: 's2',
    title: '夜探',
    kind: 'scripted',
    present: ['liu', 'su'],
    setting: '映雪房中，夜',
    day: 2,
    transcript: [
      { ref: 's2.l1', who: 'stage', text: '夜裡，生春摸黑進了映雪房中。', tags: { topic: '夜訪', act: '照顧', tone: 'tender' } },
      { ref: 's2.l2', who: 'su', text: '你也不怕人嚼舌根。', tags: { topic: '夜訪', act: '試探', tone: 'guarded' } },
      { ref: 's2.l3', who: 'liu', text: '我來看你嗓子，旁的我不管。', tags: { topic: '照顧', act: '照顧', tone: 'tender' } },
      { ref: 's2.l4', who: 'su', text: '……你總是這樣。', tags: { topic: '夜訪', act: '迴避', tone: 'flat' } },
    ],
  },

  // ── s3 查問 — THE PIVOTAL SCENE (金鳳 + 柳生春) ──
  {
    id: 's3',
    title: '查問',
    kind: 'scripted',
    present: ['liu', 'jin'],
    setting: '後臺廊下，次日',
    day: 3,
    transcript: [
      { ref: 's3.l1', who: 'jin', text: '你昨夜又去師姐房裡了？', tags: { topic: '夜訪', act: '查問', tone: 'sharp' } },
      { ref: 's3.l2', who: 'stage', text: '生春頓了一頓。', tags: { topic: '夜訪', act: '停頓', tone: 'guarded' } },
      { ref: 's3.l3', who: 'liu', text: '去看看她，她這幾日嗓子不好。', tags: { topic: '照顧', act: '照顧', tone: 'flat' } },
    ],
  },

  // ── s4 風聲 — how 映雪 learns of the friction (金鳳 + 映雪) ──
  {
    id: 's4',
    title: '風聲',
    kind: 'scripted',
    present: ['su', 'jin'],
    setting: '後臺，散戲前',
    day: 4,
    transcript: [
      { ref: 's4.l1', who: 'stage', text: '金鳳當著人不叫師姐，只從映雪身邊擦過。', tags: { topic: '冷落', act: '冷落', tone: 'cold' } },
      { ref: 's4.l2', who: 'jin', text: '有些人夜裡忙，白日裡倒清閒。', tags: { topic: '流言', act: '試探', tone: 'sharp' } },
      { ref: 's4.l3', who: 'su', text: '妹妹這話，衝著誰說？', tags: { topic: '嫌疑', act: '查問', tone: 'guarded' } },
      { ref: 's4.l4', who: 'stage', text: '映雪把話嚥下，退了半步。', tags: { topic: '避嫌', act: '迴避', tone: 'guarded' } },
    ],
  },

  // ── s5 逼認 — THE CAUSAL PROBE (金鳳 corners 柳生春 alone) ──
  //    Two-hander on purpose: 金鳳's target is unambiguously 柳生春, so her move is
  //    a clean function of her suspicion toward HER — which only the pivotal s3 pushed
  //    over the line. Drop s3 and re-run, and this same scene comes out differently.
  {
    id: 's5',
    title: '逼認',
    kind: 'enacted',
    present: ['liu', 'jin'],
    setting: '後臺角落，金鳳堵住了柳生春',
    day: 6,
    transcript: [],
    topic: '攤牌',
    situation: '金鳳把柳生春堵在後臺，要她把昨夜、把師姐、把兩人的事，說一句準話。',
  },

  // ── s6 攤牌 — three-way aftermath; each acts from accumulated memory ──
  {
    id: 's6',
    title: '攤牌',
    kind: 'enacted',
    present: ['liu', 'su', 'jin'],
    setting: '散戲後的戲樓，三人同屋',
    day: 7,
    transcript: [],
    topic: '攤牌',
    situation: '頭牌的名分要定下來。三個人同在一屋，誰也繞不開柳生春該站在誰那邊。',
  },
];

/** The same season with the pivotal scene removed — the causal ablation (M3). */
export const seasonWithoutPivotal: Scene[] = season.filter((s) => s.id !== PIVOTAL_SCENE_ID);
