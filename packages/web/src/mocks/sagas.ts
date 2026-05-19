import type { Saga } from '@endless-story/shared';

export const DEMO_SAGA_ID = 'saga_chunxue_demo';

export const sagas: Saga[] = [
  {
    id: DEMO_SAGA_ID,
    name: '春雪社',
    description: '民國七年盤下的小型戲園。原是清末官紳在霞飛路口蓋的私家戲樓，門楣上「百花樓」三字仍是舊匾。',
    currentDay: 4,
    totalDays: 7,
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
  },
];

export const getDemoSaga = () => sagas[0];
