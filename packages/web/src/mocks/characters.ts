import type { Character } from '@endless-story/shared';
import { DEMO_SAGA_ID } from './sagas';

const OWNER_A = '0xb1fe42b96faf2722b4c47b0d8027022354128f977e3d4338a94e96ce55445870';
const OWNER_B = '0x4d7a2e5b8f31c046a98b7d2c95e1f04a7b3c6e8d2a1f9c4b7e8d2c5a9f6b3e10';
const OWNER_C = '0x9c8e7a3b2d1f5e4c6b8a9d2e1f7c3b5a4e6d8c2b1a9f3e5d7c6b4a8e2d1f9c30';

export const characters: Character[] = [
  {
    id: 'char_shen_huaiyin',
    nftOwner: OWNER_A,
    sagaId: DEMO_SAGA_ID,
    name: '沈懷音',
    description:
      '春雪社當家掌事，封箱二十年的前當家青衣。一句話頂三紙合約，算盤珠子不響就讓人先讓三分；對真會唱戲的苗子卻肯花血本。',
    role: '班主',
    physicalFacts: '四十許，鬢已染霜，眉如遠山，常著素色長衫；左手戴一枚舊翡翠戒。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_shen_huaiyin_anchor',
        imageUrl: '/mock/portraits/shen_huaiyin_anchor.png',
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
    description:
      '春雪社當家花旦，工青衣花旦行當七載。一齣《牡丹亭·遊園》驚動整條霞飛路。台上是杜麗娘，台下沉默如雪。',
    role: '青衣',
    physicalFacts: '廿四歲，眉目清麗，膚色如新蠟，水袖一展便不見手。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_ye_tingfang_anchor',
        imageUrl: '/mock/portraits/ye_tingfang_anchor.png',
        kind: 'anchor',
        createdAt: '2026-05-15T03:01:00Z',
      },
      costume: {
        walrusBlobId: 'mock_blob_ye_tingfang_costume',
        imageUrl: '/mock/portraits/ye_tingfang_costume.png',
        kind: 'costume',
        createdAt: '2026-05-16T08:00:00Z',
      },
      makeup: {
        walrusBlobId: 'mock_blob_ye_tingfang_makeup',
        imageUrl: '/mock/portraits/ye_tingfang_makeup.png',
        kind: 'makeup',
        sourceEventId: 'event_white_snake_rehearsal_3',
        createdAt: '2026-05-17T19:30:00Z',
      },
      eventMoments: [
        {
          walrusBlobId: 'mock_blob_ye_tingfang_moment_1',
          imageUrl: '/mock/moments/ye_tingfang_water_sleeves.png',
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
    description:
      '春雪社小生角。女兒身工小生行當，扮少年郎眉峰利落，目光帶笑能讓滿座屏息。最得人緣，卻把真愛的人藏得最緊。',
    role: '小生',
    physicalFacts: '廿二歲，短髮束於腦後，眉如墨畫，肩線清瘦；右耳後一痣。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_cheng_hengyu_anchor',
        imageUrl: '/mock/portraits/cheng_hengyu_anchor.png',
        kind: 'anchor',
        createdAt: '2026-05-15T03:02:00Z',
      },
      costume: {
        walrusBlobId: 'mock_blob_cheng_hengyu_costume',
        imageUrl: '/mock/portraits/cheng_hengyu_costume.png',
        kind: 'costume',
        createdAt: '2026-05-16T08:30:00Z',
      },
      makeup: {
        walrusBlobId: 'mock_blob_cheng_hengyu_makeup',
        imageUrl: '/mock/portraits/cheng_hengyu_makeup.png',
        kind: 'makeup',
        sourceEventId: 'event_xu_xian_audition',
        createdAt: '2026-05-17T20:00:00Z',
      },
      eventMoments: [
        {
          walrusBlobId: 'mock_blob_cheng_hengyu_moment_1',
          imageUrl: '/mock/moments/cheng_hengyu_late_practice.png',
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
    description:
      '春雪社武旦，民國少有的真功夫武旦角兒。八歲練翻打、刀槍把子，一桿銀槍掃出滿場喝采。話不多，蕭班主說她是「戲樓的骨」。',
    role: '武旦',
    physicalFacts: '廿三歲，身量高挑，肩平腰直；左掌虎口一道舊疤。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_liang_zhaoshui_anchor',
        imageUrl: '/mock/portraits/liang_zhaoshui_anchor.png',
        kind: 'anchor',
        createdAt: '2026-05-15T03:03:00Z',
      },
      costume: {
        walrusBlobId: 'mock_blob_liang_zhaoshui_costume',
        imageUrl: '/mock/portraits/liang_zhaoshui_costume.png',
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
    description:
      '春雪社樂師。胡琴一響，整座後台都得放輕呼吸。對曲牌的記性比帳本還細，連洋人留聲機裡的調都聽得出哪個音是補錄的。',
    role: '樂師',
    physicalFacts: '卅出頭，瘦長手指，常著青灰短褂；右肩有舊傷不能舉重物。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_du_tinglan_anchor',
        imageUrl: '/mock/portraits/du_tinglan_anchor.png',
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
    description:
      '春雪社箱管。戲衣戲箱皆她掌中，誰穿哪件、哪件磨破了、哪件當年是誰留下的，她都記著。沉默寡言，唯有對戲服可話多。',
    role: '箱管',
    physicalFacts: '卅五前後，圓臉，雙手粗糙指節分明；左眉有一道淡疤。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_tang_guilan_anchor',
        imageUrl: '/mock/portraits/tang_guilan_anchor.png',
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
    description:
      '春雪社花旦。性情活潑，最愛在後台模仿洋大人說話逗大家笑；台上眉眼一轉便是另一個世界。對葉庭芳又敬又妒。',
    role: '花旦',
    physicalFacts: '廿一歲，圓眼，左頰有一顆紅痣，笑時更明顯。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_meng_yunping_anchor',
        imageUrl: '/mock/portraits/meng_yunping_anchor.png',
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
    description:
      '霞飛路口流動戲台前的歌女，被蕭班主一句「上來唱兩段」帶進春雪社。不識譜，調卻準得驚人，現在常隨杜聽瀾學工尺。',
    role: '學徒',
    physicalFacts: '十七八歲，瘦小，眼極亮，常背一只舊布袋。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_su_xiaowan_anchor',
        imageUrl: '/mock/portraits/su_xiaowan_anchor.png',
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
    description:
      '江湖花臉，名號響於碼頭與廟會。臉譜油彩一上便不似人，下了戲台卻是個愛抱貓的木訥漢子。被葉庭芳一封拜帖請來客串《白蛇傳》法海。',
    role: '丑',
    physicalFacts: '四十前後，國字臉，鬚短而硬，左頰有一道刀疤從顴骨延至下頜。',
    gallery: {
      anchor: {
        walrusBlobId: 'mock_blob_zhao_tiemian_anchor',
        imageUrl: '/mock/portraits/zhao_tiemian_anchor.png',
        kind: 'anchor',
        createdAt: '2026-05-16T14:00:00Z',
      },
      eventMoments: [],
    },
    survival: { funds: 240, dailyCost: 6, salary: 0, daysLeft: 40, level: 'healthy' },
    createdAt: '2026-05-16T14:00:00Z',
  },
];

export const getCharacterById = (id: string): Character | undefined =>
  characters.find((c) => c.id === id);

export const listCharactersBySaga = (sagaId: string | null): Character[] =>
  characters.filter((c) => c.sagaId === sagaId);

export const DEMO_OWNERS = { OWNER_A, OWNER_B, OWNER_C };
