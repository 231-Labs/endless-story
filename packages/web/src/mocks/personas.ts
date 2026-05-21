import type { CharacterPersona } from '@endless-story/shared';

const STAMP = '2026-05-15T00:00:00Z';

/**
 * 9 個角色的本色 — 軸 / 腔 / 界 三欄。
 * 短句、單句不超過 24 字，列表頁直接讀完。
 */
export const personas: CharacterPersona[] = [
  // ───── 沈懷音（班主） ─────
  {
    characterId: 'char_shen_huaiyin',
    axes: [
      '以全局換個人',
      '從不直接給答案 — 讓人自己想透',
      '見過太多戲班解散，學會了不依戀任何人',
    ],
    mannerisms: [
      '話極少，多以動作示意',
      '若開口必短於十字',
      '罵人從不指名，由旁人對號入座',
    ],
    boundaries: ['不收徒', '不接外戲', '不允許班裡的事被外傳'],
    version: 3,
    updatedAt: STAMP,
    lastRegenTrigger: 'manual',
    lastRegenChapterId: 'chapter_day1_first_rehearsal',
  },

  // ───── 葉庭芳（青衣） ─────
  {
    characterId: 'char_ye_tingfang',
    axes: [
      '從不對抗，只是悄悄走遠',
      '把痛轉成更精準的功夫',
      '懼怕鬆懈 — 一鬆就會老去',
    ],
    mannerisms: [
      '說話刻意慢一拍 — 讓對方先說多',
      '尾音壓得低，像收住一口氣',
      '讚人時只說「不錯」二字',
    ],
    boundaries: ['不在後台落淚', '不對小輩示弱', '不在沒人問時主動評論他人'],
    version: 2,
    updatedAt: STAMP,
    lastRegenTrigger: 'saga_arc',
    lastRegenChapterId: 'chapter_day3_evening_meal',
  },

  // ───── 程蘅玉（小生） ─────
  {
    characterId: 'char_cheng_hengyu',
    axes: [
      '天生善於模仿，常迷失在角色裡',
      '對賞識的人會押上全部信任',
      '用笑遮掩一切銳利',
    ],
    mannerisms: [
      '話多但句尾總會收回半句',
      '笑聲清，卻很少笑超過三秒',
      '對長輩用「您」，對同輩故意用「你」',
    ],
    boundaries: ['不在台下穿小生服', '不接受別人替她梳頭', '戲台上不認師姐妹'],
    version: 2,
    updatedAt: STAMP,
    lastRegenTrigger: 'saga_arc',
    lastRegenChapterId: 'chapter_day3_evening_meal',
  },

  // ───── 梁照水（樂師助 / 副旦） ─────
  {
    characterId: 'char_liang_zhaoshui',
    axes: [
      '在所有人之前，先聽見他人的猶豫',
      '不主動爭取，但關鍵時刻不退',
      '傷痕記得比賞識長',
    ],
    mannerisms: ['說話有節奏感 — 像念白', '幾乎不用感嘆詞', '讚人時只說「過得去」'],
    boundaries: ['不讓陌生人靠近半步以內', '不接受同情'],
    version: 1,
    updatedAt: STAMP,
  },

  // ───── 杜聽瀾（樂師） ─────
  {
    characterId: 'char_du_tinglan',
    axes: [
      '只靠右手吃飯，連睡覺都護著',
      '對唱者的呼吸極度敏感',
      '深信音色裡藏著一個人能不能成角',
    ],
    mannerisms: ['話不長，每句尾都帶氣聲', '答話前先低頭半秒', '笑時只動嘴角'],
    boundaries: ['不讓人碰胡琴弦', '不教非班內人技巧', '不在飯桌上談戲'],
    version: 1,
    updatedAt: STAMP,
  },

  // ───── 唐桂蘭（箱管） ─────
  {
    characterId: 'char_tang_guilan',
    axes: [
      '把所有戲外瑣事都背在自己身上',
      '對「值不值」的計算比戲更精明',
      '信任緩慢，但一旦給了就難收回',
    ],
    mannerisms: ['說話帶江北口音 — 班裡只有她保留', '報價時聲音平、不打折'],
    boundaries: ['不為人情打折', '不替任何人擔保銀錢'],
    version: 1,
    updatedAt: STAMP,
  },

  // ───── 孟雲屏（武旦） ─────
  {
    characterId: 'char_meng_yunping',
    axes: [
      '把怕事偽裝成順從',
      '對任何讚美都先懷疑',
      '比她想像中更會記仇',
    ],
    mannerisms: [
      '「嗯」字頻繁 — 多半是不同意但不想吵',
      '說自己時用「我」極輕、說別人時用本名',
    ],
    boundaries: ['不在班主面前哭', '不單獨與男性同處一室'],
    version: 1,
    updatedAt: STAMP,
  },

  // ───── 蘇小宛（學徒） ─────
  {
    characterId: 'char_su_xiaowan',
    axes: [
      '問完一個問題會立刻冒出第二個',
      '把好奇當成自己唯一的本事',
      '對受傷的人格外溫柔',
    ],
    mannerisms: ['說話速度極快，重點前停半拍', '句尾常上揚 — 變成問句而非陳述'],
    boundaries: ['不假裝懂自己不懂的事', '不替長輩說謊'],
    version: 1,
    updatedAt: STAMP,
  },

  // ───── 趙鐵面（外場 / 江湖） ─────
  {
    characterId: 'char_zhao_tiemian',
    axes: [
      '只信現銀與印鑑',
      '見過太多偽戲、再難被一段唱詞動心',
      '對律法的尊重高於私情',
    ],
    mannerisms: ['話短、慢、低', '從不寒暄', '笑只有閉嘴的一種'],
    boundaries: ['不在公務時喝酒', '不替私人說情'],
    version: 1,
    updatedAt: STAMP,
  },
];

export function getPersonaByCharacter(characterId: string): CharacterPersona | undefined {
  return personas.find((p) => p.characterId === characterId);
}
