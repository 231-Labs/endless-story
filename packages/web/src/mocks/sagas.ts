import type { Saga, SagaLocation } from '@endless-story/shared';

export const DEMO_SAGA_ID = 'saga_chunxue_demo';
// 春雪社涵蓋的兩處 location — 前廂戲樓 + 後廂院落
export const LOC_THEATER_ID = 'loc_chunxue_theater';
export const LOC_COMPOUND_ID = 'loc_chunxue_compound';

export const locations: SagaLocation[] = [
  {
    id: LOC_THEATER_ID,
    name: '戲樓',
    description: '前廂、對外。百花樓中庭木台所在 — 票房、演出、樂師、戲服皆此匯聚。',
  },
  {
    id: LOC_COMPOUND_ID,
    name: '院落',
    description: '後廂、對內。班子起居所在 — 通鋪、帳房、廂房，走過月洞門才到。',
  },
];

export const sagas: Saga[] = [
  {
    id: DEMO_SAGA_ID,
    name: '春雪社',
    description:
      '民國七年盤下的小型戲園。原是清末官紳在霞飛路口蓋的私家戲樓，門楣上「百花樓」三字仍是舊匾。',
    currentDay: 4,
    // endless story — 不設終點
    castIds: [
      'char_shen_huaiyin',
      'char_ye_tingfang',
      'char_cheng_hengyu',
      'char_liang_zhaoshui',
      'char_du_tinglan',
      'char_tang_guilan',
      'char_meng_yunping',
      'char_su_xiaowan',
      'char_zhao_tiemian',
    ],
    premise:
      '《白蛇傳》五天後開鑼。壓軸只有一個位置，許仙也只能有一個。她們爭著同一盞燈、卻忍不住看向彼此。',
    coveredLocationIds: [LOC_THEATER_ID, LOC_COMPOUND_ID],
    sagaPrompts: {
      naturePrompt:
        '戲外的戲。她們在後台對戲、在通鋪交換心事、在排練裡互相試底牌。衝突多半不在台上 — 在卸了妝以後。',
      rhythmHints:
        '日出開嗓，戌時封箱；月不出則停戲一日。每七日輪一次《白蛇傳》的不同折，正本與野本交替上演。',
      departurePolicy:
        '不強留 — 想走的人，七日內銀錢結清。離班角色可帶走自己的本色與記憶（NFT），不可帶走班子寫下的章回。',
    },
    revenueConfig: {
      ownerBps: 3000, // 30%
      storytellerBps: 6000, // 60%
      treasuryBps: 1000, // 10%
    },
    metrics: {
      totalChapters: 8,
      totalSubscribers: 127,
      avgSubsPerCharacter: 14,
      treasuryFunds: 2310,
    },
    worldTime: {
      day: 4,
      partOfDay: 'dusk',
      label: '戌時三刻',
      weather: 'clear',
    },
  },
];

export const getDemoSaga = () => sagas[0];
export const getDemoLocation = () => locations[0];
