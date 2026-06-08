import type { SoulSong } from '@endless-story/shared';

/**
 * Soul-song pool — each character's deepest inner monologue. Roughly twice as deep as a daily POV.
 * The first song is usually initiallyRevealed: true so the dossier has something to read at first glance.
 * The rest are unlocked client-side after the "summon soul song" button is pressed.
 */
export const soulSongs: SoulSong[] = [
  // ───── Ye char_ye_tingfang ─────
  {
    id: 'song_ye_001',
    characterId: 'char_ye_tingfang',
    composedAt: '2026-05-10T23:40:00Z',
    setting: '練功房後窗 · 戌時三刻',
    mood: 'longing',
    initiallyRevealed: true,
    verses: [
      '她們都說我這把嗓子是天賞的。可她們不知道，天賞給的東西最容易被天收走，所以我每天比誰都早起一刻、晚睡一刻。',
      '師姐封箱那夜我躲在側幕哭。一半是她真的不上了，一半是 — 從明天起就輪到我。我恨自己那個「半」。',
      '若有一天我也封了箱，我希望那是因為我已經把所有想唱的都唱完了，而不是因為又一個比我亮的丫頭從巷口走了進來。',
    ],
  },
  {
    id: 'song_ye_002',
    characterId: 'char_ye_tingfang',
    composedAt: '2026-04-28T01:12:00Z',
    setting: '夢醒後 · 子時末',
    mood: 'remembering',
    verses: [
      '我娘走得早。我記不太清她的臉了，可她哼《遊園》那兩句永遠在我心裡 — 不是調，是她哼的時候廚房窗子那一塊光。',
      '我學戲第一年，老師罵我「你這眼神不是青衣的，是被人疼壞的孩子」。我那時才知道，原來疼也會留在身上、留得讓人一眼看穿。',
    ],
  },
  {
    id: 'song_ye_003',
    characterId: 'char_ye_tingfang',
    composedAt: '2026-05-17T23:30:00Z',
    setting: '《白蛇》排練後 · 後台',
    mood: 'restless',
    verses: [
      '蘅玉今晚把手放到我肩上了。她裝得很自然，像兄長拍弟弟那種。我也裝得很自然 — 我們倆都很會裝。',
      '她不知道我那一刻在想什麼。我也最好不要知道她在想什麼。台上我們是夫妻，台下不能是別的。班規不允許，師父也不允許，我自己 — 我也不敢允許。',
      '可是我今晚會睡不好。我會在腦子裡把那隻手放回去、再拿下來、再放回去。直到天亮。',
    ],
  },

  // ───── Shen char_shen_huaiyin ─────
  {
    id: 'song_shen_001',
    characterId: 'char_shen_huaiyin',
    composedAt: '2026-05-11T02:00:00Z',
    setting: '帳房獨坐 · 丑時',
    mood: 'reconciled',
    initiallyRevealed: true,
    verses: [
      '封箱二十年，我以為自己早把那把嗓子忘了。直到今晚算到月底還差一百二，我下意識哼了一句〈思凡〉— 沒有人聽見，只有算盤珠子。',
      '當家做了這麼久，我才明白：我不是怕老，我是怕台上沒人接得住《牡丹亭》最後那個字。所以這些丫頭一個個來，我就一個個收。',
      '人家說我是班主。我心裡知道，我是借這些小角兒繼續唱的人。',
    ],
  },
  {
    id: 'song_shen_002',
    characterId: 'char_shen_huaiyin',
    composedAt: '2026-04-22T22:18:00Z',
    setting: '舊照片前',
    mood: 'sorrow',
    verses: [
      '那年同台的青衣阿瑞，去了上海後再沒消息。我留著她那把舊扇，每年清明拿出來擦一次。',
      '她要是還在，會笑我把春雪社撐成這樣 — 也會笑我頭髮白得這麼多。',
    ],
  },

  // ───── Cheng char_cheng_hengyu ─────
  {
    id: 'song_cheng_001',
    characterId: 'char_cheng_hengyu',
    composedAt: '2026-05-09T22:00:00Z',
    setting: '卸妝前的鏡子',
    mood: 'defiant',
    initiallyRevealed: true,
    verses: [
      '我穿著小生的衣服站在鏡子前。眉是我自己畫的，肩是我自己撐的。可是觀眾鼓掌的是「許仙」，不是程蘅玉。',
      '有時候我希望我真的是個男人 — 不是為了愛誰，是為了不必每次謝幕時都聽見人家說「啊原來是女兒身」那句驚嘆裡，藏著一點點貶。',
      '可是更多時候我慶幸我是女的。因為若我是男人，我就唱不出庭芳念到「則為你如花美眷」那句時，我胸口那種疼。',
    ],
  },
  {
    id: 'song_cheng_002',
    characterId: 'char_cheng_hengyu',
    composedAt: '2026-05-15T01:30:00Z',
    setting: '練功房 · 子時末',
    mood: 'restless',
    verses: [
      '今晚她水袖收得慢了半拍。我看見了，師父也看見了，師父罵她，我替她接了一句「是我搭的」。',
      '她謝我的眼神我不敢看。我怕我會在那眼神裡看到我不該看見的東西 — 或者更糟，看不到。',
    ],
  },

  // ───── Liang char_liang_zhaoshui ─────
  {
    id: 'song_liang_001',
    characterId: 'char_liang_zhaoshui',
    composedAt: '2026-05-08T21:00:00Z',
    setting: '兵器架前 · 戌時',
    mood: 'defiant',
    initiallyRevealed: true,
    verses: [
      '左掌這道疤是十四歲那年自己劃的 — 拜師那天師父說「武旦疼了會喊，是丟人」，我當夜回房就拿戲刀比著虎口劃了一道，逼自己學會不喊。',
      '十年後的今天我還是不喊。槍掃過去掌心震麻，喉嚨裡那聲被我咽進去 — 咽成一口濃茶，唱完戲再嚥下去。',
    ],
  },
  {
    id: 'song_liang_002',
    characterId: 'char_liang_zhaoshui',
    composedAt: '2026-04-30T23:50:00Z',
    setting: '看完庭芳的《遊園》後',
    mood: 'longing',
    verses: [
      '我這輩子只想唱一次文戲。不是因為武戲不好 — 是因為唱文戲的人，能慢慢地走、慢慢地說，能用一個眼神就讓觀眾掉淚。',
      '我這把身手，舞得再俐落，也讓不了人掉淚。最多讓人喝采。喝采是好的。但有些夜裡，我會羨慕那些被人為之掉淚的人。',
    ],
  },

  // ───── Su char_su_xiaowan ─────
  {
    id: 'song_su_001',
    characterId: 'char_su_xiaowan',
    composedAt: '2026-05-16T13:00:00Z',
    setting: '春雪社後門 · 入班第二日',
    mood: 'longing',
    initiallyRevealed: true,
    verses: [
      '蕭班主說「上來唱兩段」的時候我沒哭。我那時想的是 — 今晚的攤位錢就不用湊了。',
      '進到後台才哭。不是因為高興 — 是因為這裡有熱水，有人會跟你說「先吃一碗再說」。十七年我頭一次知道，原來人活著可以不用一直怕。',
    ],
  },
  {
    id: 'song_su_002',
    characterId: 'char_su_xiaowan',
    composedAt: '2026-05-17T03:00:00Z',
    setting: '通鋪靠牆的位置 · 寅時',
    mood: 'restless',
    verses: [
      '我睡不著。我聽見庭芳姐在隔壁哼《遊園》，哼得很輕，像在哄她自己。我屏住氣聽，怕一翻身就把那條聲音弄碎。',
      '我若有一天能哼得跟她那樣輕、那樣穩，我就敢說我活下來了。',
    ],
  },

  // ───── Du char_du_tinglan ─────
  {
    id: 'song_du_001',
    characterId: 'char_du_tinglan',
    composedAt: '2026-05-09T23:00:00Z',
    setting: '胡琴擱在膝上',
    mood: 'reconciled',
    initiallyRevealed: true,
    verses: [
      '右肩那年從馬上摔下來，大夫說我以後拉不了胡琴。我聽完只笑 — 笑完就回家把琴抱進被窩睡了一晚。',
      '到現在我還拉。不是因為大夫看走了眼，是因為我每拉一弓都疼一下、疼一下就把那年掉下來的自己救回來一寸。十二年我把自己拉回來了大半。',
    ],
  },

  // ───── Tang char_tang_guilan ─────
  {
    id: 'song_tang_001',
    characterId: 'char_tang_guilan',
    composedAt: '2026-05-10T00:30:00Z',
    setting: '戲箱旁 · 子時',
    mood: 'remembering',
    initiallyRevealed: true,
    verses: [
      '庭芳那件白蛇戲服上個月被勾破了一道，她不知道。我那夜熬到天亮把那道補上，補得跟原來一樣。',
      '我不會唱，不會做身段，也不會跟人說話。但我能讓她們的戲服上台時都是完整的。這就是我能給的全部了。我覺得夠。',
    ],
  },

  // ───── Meng char_meng_yunping ─────
  {
    id: 'song_meng_001',
    characterId: 'char_meng_yunping',
    composedAt: '2026-05-12T22:30:00Z',
    setting: '後台 · 卸妝鏡前',
    mood: 'sorrow',
    initiallyRevealed: true,
    verses: [
      '我學洋大人說話逗大家笑的時候，後台是亮的、是熱的。我喜歡那個亮。',
      '可是我回到通鋪、把油彩擦掉之後，那張臉就空了。我有時候會在鏡子裡看自己看好久，看到分不清那張臉是程蘅玉畫的、還是我自己長的。',
    ],
  },

  // ───── Zhao char_zhao_tiemian ─────
  {
    id: 'song_zhao_001',
    characterId: 'char_zhao_tiemian',
    composedAt: '2026-05-16T16:00:00Z',
    setting: '春雪社門前 · 拜帖在手',
    mood: 'restless',
    initiallyRevealed: true,
    verses: [
      '碼頭那邊的人說我「鐵面」二字得來不易 — 是這道刀疤掙的，是十幾條人命堆的。我從不否認。',
      '可是葉庭芳一封拜帖請我來扮法海。我看完信坐在門口抽了三根菸 — 不是猶豫，是我發現我其實一直在等一個讓我從那邊走過來的理由。',
    ],
  },
];

export function listSoulSongsForCharacter(characterId: string): SoulSong[] {
  return soulSongs
    .filter((s) => s.characterId === characterId)
    .sort((a, b) => a.composedAt.localeCompare(b.composedAt));
}
