import type { Character } from '@endless-story/shared';
import { walrusAggregatorUrl } from '@endless-story/shared';
import { DEMO_SAGA_ID } from './sagas';

const OWNER_A = '0xb1fe42b96faf2722b4c47b0d8027022354128f977e3d4338a94e96ce55445870';
const OWNER_B = '0x4d7a2e5b8f31c046a98b7d2c95e1f04a7b3c6e8d2a1f9c4b7e8d2c5a9f6b3e10';
const OWNER_C = '0x9c8e7a3b2d1f5e4c6b8a9d2e1f7c3b5a4e6d8c2b1a9f3e5d7c6b4a8e2d1f9c30';

const BLOB = {
  shenAnchor: 'Nq3xZk7vH2P8mYwL5j9Rs4tBcDgFwH7shenAnchor01a',
  yeAnchor: 'Pq2WmK5tZ8H4nLs6V9XdRb3cFwGyT8yeAnchor011x',
  yeCostume: 'Sn7cFw3aBd2YpL4M9wXk6QvRtZ8yeCostumeFw0Cz1',
  yeMakeup: 'Vc9BhJ4xRk3PnLmW7Y2sFgT8WyeMakeupBhJxRk0My',
  yeMomentSleeves: 'Tk2NwR8sP3yeMomentSleevesM4xLq6Y9vH8zHfWqBcDk',
  chengAnchor: 'Mn4WkR2pT9HsL6vY3Zq8XbCfDgchengAnchor01p7P',
  chengCostume: 'Wb3LpK7mNsR4chengCostumeQzXcVnBh8WyT5yPq2A',
  chengMakeup: 'Xz5HmF4tNkR9chengMakeupVpQ2YbLcDgWy8FhJq3Bw',
  chengMomentLate: 'Yq8RtNwF3mchengMomentLateLk5XzPbVcMhJ7HgTk2D',
  liangAnchor: 'Rk6MtPnL4sWdY9liangAnchor011vXcZbHfGwQp3KmT',
  liangCostume: 'Tn4PsWmK8liangCostume03vXcRpZbY6HfGwQ7LkM2D',
  duAnchor: 'Bm2RtYsW7HfL5duAnchor011xKcZbVnPq6Gw8KnJqRy',
  tangAnchor: 'Hn8MsPwK4tangAnchor011aLcXbVnRpY6FgQw3LkJyZ',
  mengAnchor: 'Ck3FsHwN6mengAnchor011tLpXbVcRqZ4Y8KwGyM2Jb',
  suAnchor: 'Lq7VsYwH4suAnchor011mTpXcKbRnZ8F3GwQyM5JkDb',
  zhaoAnchor: 'Wn5KsPwHzhaoAnchor011mTb4LpXcRqY9F6GyQwJkB3',
  tanAnchor: 'Tm4WkPnRtanAnchor011sLpXcHfBvY8K6GwQ3LjMyZx',
  jiangAnchor: 'Jw9NkPsRjiangAnchor012LpXcRtY8H6FvQ4GjKwMyTb',
};

const portraitUrl = (blobId: string) => walrusAggregatorUrl(blobId, { network: 'testnet' });

export const characters: Character[] = [
  {
    id: 'char_shen_huaiyin',
    nftOwner: OWNER_A,
    sagaId: DEMO_SAGA_ID,
    name: '沈懷音',
    description:
      '春雪社當家掌事，封箱二十年的前當家青衣。一句話頂三紙合約，算盤珠子不響就讓人先讓三分。',
    role: '班主',
    gender: 'female',
    age: 42,
    physicalFacts: '四十許，鬢已染霜，眉如遠山，常著素色長衫；左手戴一枚舊翡翠戒。',
    attributes: { constitution: 60, disposition: 90, acuity: 95, appearance: 75 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.shenAnchor,
        imageUrl: portraitUrl(BLOB.shenAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 480, dailyCost: 12, salary: 30, daysLeft: 28, level: 'healthy' },
    createdAt: '2026-05-15T03:00:00Z',
  },
  {
    id: 'char_ye_tingfang',
    nftOwner: OWNER_A,
    sagaId: DEMO_SAGA_ID,
    name: '葉庭芳',
    description: '春雪社當家花旦，工青衣花旦行當七載。一齣《牡丹亭·遊園》驚動整條霞飛路。',
    role: '青衣',
    gender: 'female',
    age: 24,
    physicalFacts: '廿四歲，眉目清麗，膚色如新蠟，水袖一展便不見手。',
    attributes: { constitution: 70, disposition: 80, acuity: 88, appearance: 92 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.yeAnchor,
        imageUrl: portraitUrl(BLOB.yeAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:01:00Z',
      },
      costume: {
        walrusBlobId: BLOB.yeCostume,
        imageUrl: portraitUrl(BLOB.yeCostume),
        kind: 'costume',
        createdAt: '2026-05-16T08:00:00Z',
      },
      makeup: {
        walrusBlobId: BLOB.yeMakeup,
        imageUrl: portraitUrl(BLOB.yeMakeup),
        kind: 'makeup',
        sourceEventId: 'event_white_snake_rehearsal_3',
        createdAt: '2026-05-17T19:30:00Z',
      },
      eventMoments: [
        {
          walrusBlobId: BLOB.yeMomentSleeves,
          imageUrl: portraitUrl(BLOB.yeMomentSleeves),
          kind: 'event_moment',
          sourceEventId: 'event_late_night_practice',
          sourceChapterId: 'chapter_day3_water_sleeves',
          createdAt: '2026-05-17T23:14:00Z',
        },
      ],
    },
    survival: { funds: 210, dailyCost: 8, salary: 18, daysLeft: 26, level: 'stable' },
    createdAt: '2026-05-15T03:01:00Z',
  },
  {
    id: 'char_cheng_hengyu',
    nftOwner: OWNER_B,
    sagaId: DEMO_SAGA_ID,
    name: '程蘅玉',
    description: '春雪社小生角。女兒身工小生行當，扮少年郎眉峰利落，目光帶笑能讓滿座屏息。',
    role: '小生',
    gender: 'female',
    age: 22,
    physicalFacts: '廿二歲，短髮束於腦後，眉如墨畫，肩線清瘦；右耳後一痣。',
    attributes: { constitution: 75, disposition: 70, acuity: 85, appearance: 88 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.chengAnchor,
        imageUrl: portraitUrl(BLOB.chengAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:02:00Z',
      },
      costume: {
        walrusBlobId: BLOB.chengCostume,
        imageUrl: portraitUrl(BLOB.chengCostume),
        kind: 'costume',
        createdAt: '2026-05-16T08:30:00Z',
      },
      makeup: {
        walrusBlobId: BLOB.chengMakeup,
        imageUrl: portraitUrl(BLOB.chengMakeup),
        kind: 'makeup',
        sourceEventId: 'event_xu_xian_audition',
        createdAt: '2026-05-17T20:00:00Z',
      },
      eventMoments: [
        {
          walrusBlobId: BLOB.chengMomentLate,
          imageUrl: portraitUrl(BLOB.chengMomentLate),
          kind: 'event_moment',
          sourceEventId: 'event_late_night_practice',
          sourceChapterId: 'chapter_day3_water_sleeves',
          createdAt: '2026-05-17T23:14:00Z',
        },
      ],
    },
    survival: { funds: 64, dailyCost: 10, salary: 16, daysLeft: 11, level: 'low' },
    createdAt: '2026-05-15T03:02:00Z',
  },
  {
    id: 'char_liang_zhaoshui',
    nftOwner: OWNER_C,
    sagaId: DEMO_SAGA_ID,
    name: '梁照水',
    description: '春雪社武旦，民國少有的真功夫武旦角兒。一桿銀槍掃出滿場喝采。',
    role: '武旦',
    gender: 'female',
    age: 23,
    physicalFacts: '廿三歲，身量高挑，肩平腰直；左掌虎口一道舊疤。',
    attributes: { constitution: 95, disposition: 60, acuity: 78, appearance: 70 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.liangAnchor,
        imageUrl: portraitUrl(BLOB.liangAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:03:00Z',
      },
      costume: {
        walrusBlobId: BLOB.liangCostume,
        imageUrl: portraitUrl(BLOB.liangCostume),
        kind: 'costume',
        createdAt: '2026-05-16T09:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 130, dailyCost: 9, salary: 17, daysLeft: 14, level: 'stable' },
    createdAt: '2026-05-15T03:03:00Z',
  },
  {
    id: 'char_du_tinglan',
    nftOwner: OWNER_B,
    sagaId: DEMO_SAGA_ID,
    name: '杜聽瀾',
    description: '春雪社樂師。胡琴一響，整座後台都得放輕呼吸。',
    role: '樂師',
    gender: 'female',
    age: 31,
    physicalFacts: '卅出頭，瘦長手指，常著青灰短褂；右肩有舊傷不能舉重物。',
    attributes: { constitution: 65, disposition: 80, acuity: 92, appearance: 65 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.duAnchor,
        imageUrl: portraitUrl(BLOB.duAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:04:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 88, dailyCost: 7, salary: 12, daysLeft: 12, level: 'stable' },
    createdAt: '2026-05-15T03:04:00Z',
  },
  {
    id: 'char_tang_guilan',
    nftOwner: OWNER_A,
    sagaId: DEMO_SAGA_ID,
    name: '唐桂蘭',
    description: '春雪社箱管。戲衣戲箱皆她掌中。沉默寡言，唯有對戲服可話多。',
    role: '箱管',
    gender: 'female',
    age: 36,
    physicalFacts: '卅五前後，圓臉，雙手粗糙指節分明；左眉有一道淡疤。',
    attributes: { constitution: 70, disposition: 75, acuity: 80, appearance: 60 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.tangAnchor,
        imageUrl: portraitUrl(BLOB.tangAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:05:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 96, dailyCost: 6, salary: 11, daysLeft: 16, level: 'stable' },
    createdAt: '2026-05-15T03:05:00Z',
  },
  {
    id: 'char_meng_yunping',
    nftOwner: OWNER_C,
    sagaId: DEMO_SAGA_ID,
    name: '孟雲屏',
    description: '春雪社花旦。性情活潑，最愛在後台模仿洋大人說話逗大家笑。',
    role: '花旦',
    gender: 'female',
    age: 21,
    physicalFacts: '廿一歲，圓眼，左頰有一顆紅痣，笑時更明顯。',
    attributes: { constitution: 70, disposition: 75, acuity: 78, appearance: 82 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.mengAnchor,
        imageUrl: portraitUrl(BLOB.mengAnchor),
        kind: 'anchor',
        createdAt: '2026-05-15T03:06:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 72, dailyCost: 8, salary: 14, daysLeft: 9, level: 'low' },
    createdAt: '2026-05-15T03:06:00Z',
  },
  {
    id: 'char_su_xiaowan',
    nftOwner: OWNER_B,
    sagaId: DEMO_SAGA_ID,
    name: '蘇小宛',
    description: '霞飛路口流動戲台前的歌女，被蕭班主一句「上來唱兩段」帶進春雪社。',
    role: '學徒',
    gender: 'female',
    age: 17,
    physicalFacts: '十七八歲，瘦小，眼極亮，常背一只舊布袋。',
    attributes: { constitution: 55, disposition: 85, acuity: 88, appearance: 75 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.suAnchor,
        imageUrl: portraitUrl(BLOB.suAnchor),
        kind: 'anchor',
        createdAt: '2026-05-16T11:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 18, dailyCost: 4, salary: 5, daysLeft: 4, level: 'critical' },
    createdAt: '2026-05-16T11:00:00Z',
  },
  {
    id: 'char_zhao_tiemian',
    nftOwner: OWNER_C,
    sagaId: null,
    name: '趙鐵面',
    description: '江湖花臉，名號響於碼頭與廟會。被葉庭芳一封拜帖請來客串《白蛇傳》法海。',
    role: '丑',
    gender: 'male',
    age: 40,
    physicalFacts: '四十前後，國字臉，鬚短而硬，左頰有一道刀疤從顴骨延至下頜。',
    attributes: { constitution: 90, disposition: 70, acuity: 75, appearance: 60 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.zhaoAnchor,
        imageUrl: portraitUrl(BLOB.zhaoAnchor),
        kind: 'anchor',
        createdAt: '2026-05-16T14:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 240, dailyCost: 6, salary: 0, daysLeft: 40, level: 'healthy' },
    createdAt: '2026-05-16T14:00:00Z',
  },

  // ───── Outside-world links (wild / not in the saga but cross-linked) ─────
  {
    id: 'char_tan_silang',
    nftOwner: OWNER_B,
    sagaId: null,
    name: '譚四郎',
    description:
      '對家戲班「永聲社」班主。十年前與沈懷音同台爭過《貴妃醉酒》正本，敗後另開門戶。',
    role: '班主',
    gender: 'male',
    age: 44,
    physicalFacts: '四十中年，瘦長身形，左眉一道舊疤，常著黑緞長衫、不戴帽。',
    attributes: { constitution: 65, disposition: 80, acuity: 88, appearance: 70 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.tanAnchor,
        imageUrl: portraitUrl(BLOB.tanAnchor),
        kind: 'anchor',
        createdAt: '2026-05-12T10:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 380, dailyCost: 10, salary: 0, daysLeft: 36, level: 'healthy' },
    createdAt: '2026-05-12T10:00:00Z',
  },
  {
    id: 'char_jiang_laoban',
    nftOwner: OWNER_C,
    sagaId: null,
    name: '江老闆',
    description:
      '霞飛路口糧行老闆。生意人氣，戲園子常客 — 三年前一場《牡丹亭》看完便逢戲必到，是葉庭芳的長期訂閱者。',
    role: '看客',
    gender: 'male',
    age: 38,
    physicalFacts: '三十中半，富態但不肥，圓臉短鬚，常著棉袍配翡翠戒；笑起來有酒窩。',
    attributes: { constitution: 55, disposition: 75, acuity: 70, appearance: 60 },
    gallery: {
      anchor: {
        walrusBlobId: BLOB.jiangAnchor,
        imageUrl: portraitUrl(BLOB.jiangAnchor),
        kind: 'anchor',
        createdAt: '2026-05-13T09:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 1500, dailyCost: 18, salary: 0, daysLeft: 83, level: 'healthy' },
    createdAt: '2026-05-13T09:00:00Z',
  },
];

export const getCharacterById = (id: string): Character | undefined =>
  characters.find((c) => c.id === id);

export const listCharactersBySaga = (sagaId: string | null): Character[] =>
  characters.filter((c) => c.sagaId === sagaId);

export const DEMO_OWNERS = { OWNER_A, OWNER_B, OWNER_C };
