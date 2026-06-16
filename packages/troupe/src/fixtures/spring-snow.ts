/**
 * Demo troupe — 春雪社, enough to mount 《斷橋·新唱》.
 *
 * The load-bearing fixture detail: 蘇映雪 (花旦) and 柳生春 (坤生, a FEMALE actor
 * who plays 小生) have a 青梅竹馬 bond since childhood. The play casts them as
 * stage-couple 白素貞 / 許仙, and 蘇映雪 writes an emergent 詞 about it — the
 * troupe's real feeling flowing into the new play. (Mirrors the existing
 * soulSongs.ts seed song_ye_003.)
 */

import type { TroupeMember } from '../types.ts';

export const springSnow: TroupeMember[] = [
  {
    id: 'banzhu',
    name: '沈懷音',
    hangdang: '旦',
    yinggong: ['老旦', '青衣'],
    actorGender: 'female',
    voice: '當家的口氣，半是賬房半是戲魂，不爭台中央。',
    skills: [
      { key: 'playwriting', label: '編劇', value: 58 },
      { key: 'vocal', label: '唱腔', value: 70 },
      { key: 'literati', label: '文墨', value: 66 },
    ],
    memories: [{ id: 'm_bz1', text: '封箱二十年，仍記得《牡丹亭》最後那個字怎麼收。', mood: 'serene' }],
    relationships: [],
  },
  {
    id: 'bianju',
    name: '言文淵',
    hangdang: '生',
    yinggong: ['老生'],
    actorGender: 'female', // 坤生 — a woman playing 老生 (孟小冬一脈)
    voice: '文人氣，咬字講究，愛把舊典翻出新意。',
    skills: [
      { key: 'playwriting', label: '編劇', value: 90 },
      { key: 'literati', label: '文墨', value: 85 },
      { key: 'lyricism', label: '填詞', value: 72 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'huadan',
    name: '蘇映雪',
    hangdang: '旦',
    yinggong: ['花旦', '青衣'],
    actorGender: 'female',
    voice: '嬌而不媚，唱到傷處眼神先到。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 82 },
      { key: 'lyricism', label: '填詞', value: 68 },
      { key: 'literati', label: '文墨', value: 72 },
      { key: 'movement', label: '身段', value: 70 },
    ],
    memories: [
      {
        id: 'm_hd1',
        text: '生春昨夜排《斷橋》時把手放到我肩上，裝得像兄長。我也裝得很自然——我們倆都很會裝。台上夫妻，台下不能是別的。',
        aboutId: 'kunsheng',
      },
      { id: 'm_hd2', text: '自小同進科班，她學生我學旦，第一次配戲就是夫妻。', aboutId: 'kunsheng' },
    ],
    relationships: [
      { withId: 'kunsheng', kind: '青梅竹馬', intensity: 88, note: '自小同行，台上常配夫妻，台下情深未言。' },
    ],
  },
  {
    id: 'kunsheng',
    name: '柳生春',
    hangdang: '生',
    yinggong: ['文小生', '武小生'],
    actorGender: 'female', // 坤生 — a woman playing 小生
    voice: '清亮挺拔，反串許仙時眉目能藏三分真。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 76 },
      { key: 'movement', label: '身段', value: 74 },
      { key: 'lyricism', label: '填詞', value: 40 },
    ],
    memories: [{ id: 'm_ks1', text: '映雪唱到斷橋總會走神，我便多撐她一拍。', aboutId: 'huadan' }],
    relationships: [
      { withId: 'huadan', kind: '青梅竹馬', intensity: 85, note: '同上。' },
    ],
  },
  {
    id: 'wudan',
    name: '封鈴',
    hangdang: '旦',
    yinggong: ['武旦', '刀馬旦'],
    actorGender: 'female',
    voice: '脆爽利落，開打不含糊。',
    skills: [
      { key: 'movement', label: '身段', value: 78 },
      { key: 'martial', label: '武場', value: 72 },
      { key: 'vocal', label: '唱腔', value: 55 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'qinshi',
    name: '沈硯秋',
    hangdang: '樂',
    yinggong: ['琴師'],
    actorGender: 'male',
    voice: '寡言，一把京胡替他說話。',
    skills: [
      { key: 'composing', label: '作曲', value: 84 },
      { key: 'vocal', label: '唱腔', value: 60 },
      { key: 'literati', label: '文墨', value: 50 },
    ],
    memories: [],
    relationships: [],
  },

  // ── 擴編：補齊行當（淨 / 丑 / 武生 / 正工青衣 / 鼓師），排得了全本大戲 ──
  {
    id: 'jing_pei',
    name: '裴鐵山',
    hangdang: '淨',
    yinggong: ['銅錘花臉', '架子花臉'],
    actorGender: 'male',
    voice: '炸音如雷，銅錘花臉的重，一個亮相先聲奪人。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 75 },
      { key: 'movement', label: '身段', value: 68 },
      { key: 'martial', label: '武場', value: 70 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'chou_luo',
    name: '駱五',
    hangdang: '丑',
    yinggong: ['文丑', '武丑'],
    actorGender: 'male',
    voice: '一張利嘴插科打諢，台上最會偷戲的人。',
    skills: [
      { key: 'movement', label: '身段', value: 66 },
      { key: 'literati', label: '文墨', value: 58 },
      { key: 'vocal', label: '唱腔', value: 50 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'wusheng_gu',
    name: '顧長風',
    hangdang: '生',
    yinggong: ['武生', '武小生'],
    actorGender: 'male',
    voice: '起霸利落，槍下不讓人，嗓子卻還壓得住一段悲。',
    skills: [
      { key: 'movement', label: '身段', value: 85 },
      { key: 'martial', label: '武場', value: 82 },
      { key: 'vocal', label: '唱腔', value: 62 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'qingyi_yan',
    name: '言惜',
    hangdang: '旦',
    yinggong: ['青衣', '花衫'],
    actorGender: 'female',
    voice: '正工青衣，唱得端莊，一張苦臉最是動人。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 78 },
      { key: 'literati', label: '文墨', value: 70 },
      { key: 'lyricism', label: '填詞', value: 55 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'gushi_zheng',
    name: '鄭奎',
    hangdang: '樂',
    yinggong: ['鼓師'],
    actorGender: 'male',
    voice: '司鼓的板眼就是全班的心跳，話少手穩。',
    skills: [
      { key: 'martial', label: '武場', value: 80 },
      { key: 'composing', label: '作曲', value: 55 },
    ],
    memories: [],
    relationships: [],
  },
];
