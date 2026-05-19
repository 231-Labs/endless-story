import type { Chapter } from '@endless-story/shared';
import { DEMO_SAGA_ID } from './sagas';

export const chapters: Chapter[] = [
  {
    id: 'chapter_day1_first_rehearsal',
    sagaId: DEMO_SAGA_ID,
    day: 1,
    title: '《白蛇傳》第一日 · 班主貼了榜',
    body:
      '清晨蕭班主把戲碼貼上後台板。九個名字、九個位置；只有一個許仙。後台一時靜得連胡琴試弦的響都顯尖。葉庭芳沒看完榜便進了廂房，沒人攔；程蘅玉笑著拍了拍杜聽瀾的肩，說今晚自己掛戲詞，誰也別等。',
    involvedCharacterIds: [
      'char_shen_huaiyin',
      'char_ye_tingfang',
      'char_cheng_hengyu',
      'char_du_tinglan',
    ],
    walrusBlobId: 'mock_walrus_blob_chapter_day1',
    visibility: 'public_chapter',
    createdAt: '2026-05-15T22:30:00Z',
  },
  {
    id: 'chapter_day2_audition',
    sagaId: DEMO_SAGA_ID,
    day: 2,
    title: '《白蛇傳》第二日 · 試許仙',
    body:
      '程蘅玉先進來。三段都過了，蕭班主沒說好也沒說不好。輪到孟雲屏，她唱到「斷橋」那一段忽然走了調 — 杜聽瀾的胡琴沒停，她也沒停，硬把那個錯音轉成了哭腔。後台沒人說話。蕭班主把毛筆擱下，只說了三個字：「再來。」',
    involvedCharacterIds: [
      'char_cheng_hengyu',
      'char_meng_yunping',
      'char_du_tinglan',
      'char_shen_huaiyin',
    ],
    walrusBlobId: 'mock_walrus_blob_chapter_day2',
    visibility: 'public_chapter',
    createdAt: '2026-05-16T22:30:00Z',
  },
  {
    id: 'chapter_day3_evening_meal',
    sagaId: DEMO_SAGA_ID,
    day: 3,
    title: '《白蛇傳》第三日 · 暮後合戲',
    body:
      '日落時分，蕭班主把全社九人聚在後堂用飯。八仙桌兩張，南北擺開；唐桂蘭剛從蘇州河碼頭採辦回來，鯽魚兩條、青菜一把、洋人留聲機一台。她把魚交給杜聽瀾代煮 — 杜聽瀾右肩有舊傷不能舉重物，鍋鏟卻使得比針還細。\n\n葉庭芳一進來就把目光擱在自己面前的碗沿上、不看任何人。程蘅玉坐她對面、距離恰好是兩個座位，中間隔著孟雲屏。孟雲屏知道兩人前夜的事 — 她沒看見，可她從唐桂蘭替程蘅玉送茶那一壺猜到了 — 此刻她故意往兩人視線中間插了一句閒話，把空氣攪開。\n\n「洋人留聲機這玩意兒能放戲嗎？」蘇小宛比誰都先問。十七歲的女孩眼睛永遠最亮。\n\n杜聽瀾舀了一勺魚湯，笑而不答。她從自己的青灰短褂胸口摸出一個漆木針盤、輕輕一放，蓋上唱針 — 一段不知是哪一年灌的《貴妃醉酒》從喇叭裡漏出來，沙得像隔著二十年。蕭班主的筷子停在半空。\n\n「沈班主這嗓子……」蘇小宛還來不及把話說完，蕭班主已經把筷子放下，微微皺了眉。「換一張。」她沒抬頭。「這張不是當年灌的版本。後段有人補錄。」她說完起身、慢慢往內院走 — 葉庭芳望著她的背影、忽然知道班主為什麼從來不再唱戲。沈班主這嗓子，不是因為唱壞了，是不肯讓人聽見當年那個自己現在唱不出來的音。\n\n留聲機停在中間的尾韻上。杜聽瀾把唱針提起、放回原位、輕輕蓋上漆木針盤。「對不起。」她說了一句。蕭班主在內院門口頓了一頓、沒回頭，輕輕擺了擺手 — 不是怪她、是讓她別再說。\n\n那一晚梁照水沒上桌。她在院子裡練到月落、把那桿銀槍掃了三十六圈。葉庭芳替她端了一碗魚湯擱在門檻邊、沒敲門、回頭時看見程蘅玉站在廊下 — 兩人目光相接、誰都沒先開口、誰也沒走開。\n\n後堂的燈一直亮到亥時。唐桂蘭最後一個離桌、收拾碗筷時順手把那台留聲機抱進了戲箱房。她沒鎖。整個春雪社，今夜不會有人來偷一段不該聽的戲。',
    involvedCharacterIds: [
      'char_shen_huaiyin',
      'char_ye_tingfang',
      'char_cheng_hengyu',
      'char_du_tinglan',
      'char_tang_guilan',
      'char_meng_yunping',
      'char_su_xiaowan',
      'char_liang_zhaoshui',
    ],
    sourceEventId: 'event_day3_evening_meal',
    walrusBlobId: 'mock_walrus_blob_chapter_day3_meal',
    visibility: 'public_chapter',
    createdAt: '2026-05-17T20:30:00Z',
  },
  {
    id: 'chapter_day3_water_sleeves',
    sagaId: DEMO_SAGA_ID,
    day: 3,
    title: '《白蛇傳》第三日 · 水袖那一夜',
    body:
      '夜半三更，廂房外仍有人練。是程蘅玉。她在背〈遊湖〉的詞，背到第三遍把書扔了，乾脆走身段。她不知道葉庭芳一直站在門外。葉庭芳本來只是路過 — 她去櫃子裡找半條改窄的水袖、想替自己明日的戲妝預備。看見程蘅玉的水袖綁得不對。她沒敲門，進去蹲下，把那條水袖替她重新繫了一遍。兩個人都沒說話。繫好那一刻程蘅玉低頭看她，葉庭芳的手仍在那條水袖上 — 兩個人都知道，這一袖綁的不只是水袖。她們都知道，明天蕭班主會把許仙的位置定下。她們也都知道，無論誰拿到那個位置，另一個都會回到台口側幕站著，靜靜地把對方那齣戲看完。',
    povCharacterId: undefined,
    involvedCharacterIds: ['char_ye_tingfang', 'char_cheng_hengyu'],
    sourceEventId: 'event_late_night_practice',
    walrusBlobId: 'mock_walrus_blob_chapter_day3_main',
    visibility: 'public_chapter',
    createdAt: '2026-05-17T23:48:00Z',
  },
  {
    id: 'chapter_day3_pov_ye',
    sagaId: DEMO_SAGA_ID,
    day: 3,
    title: '〈水袖那一夜〉· 葉庭芳視角',
    body:
      '我本來只是路過。後台有半條改窄的水袖，是我去年用過的，唐姐替我擱在第三個櫃子最底層。我推門那一刻聽見〈遊湖〉的調 — 是她，背到第三遍了還沒順。我看見她水袖綁得太緊，那樣甩出去會卡在肘彎。我蹲下去替她繫的時候，手指碰到她的手腕。她沒躲。我也沒抬頭。我知道明天蕭班主會點誰。我也知道我自己想點誰。可是我替她繫的這一袖綁得比我自己的還整齊。',
    povCharacterId: 'char_ye_tingfang',
    involvedCharacterIds: ['char_ye_tingfang', 'char_cheng_hengyu'],
    sourceEventId: 'event_late_night_practice',
    walrusBlobId: 'mock_walrus_blob_chapter_day3_pov_ye',
    visibility: 'public_chapter',
    createdAt: '2026-05-17T23:50:00Z',
  },
  {
    id: 'chapter_day3_pov_cheng',
    sagaId: DEMO_SAGA_ID,
    day: 3,
    title: '〈水袖那一夜〉· 程蘅玉視角',
    body:
      '我聽見門響的時候本來想罵人 — 這個點誰來看我練功。是她。葉庭芳。她沒說話就蹲下來，把我那條綁太緊的水袖一寸一寸放鬆，重新繫過。我低頭看她睫毛上的影。她的手不抖，我的抖。我知道明天她會搶走我的許仙。她也知道。但我這條水袖讓她繫了。讓她繫了就是讓了。讓了我也不後悔 — 因為我從來不在乎那個位置，我只在乎她替我繫水袖的時候有沒有抬頭看我。她沒抬。但她繫得比我自己整齊。我這一晚不會睡了。',
    povCharacterId: 'char_cheng_hengyu',
    involvedCharacterIds: ['char_ye_tingfang', 'char_cheng_hengyu'],
    sourceEventId: 'event_late_night_practice',
    walrusBlobId: 'mock_walrus_blob_chapter_day3_pov_cheng',
    visibility: 'public_chapter',
    createdAt: '2026-05-17T23:52:00Z',
  },
  {
    id: 'chapter_day4_morning',
    sagaId: DEMO_SAGA_ID,
    day: 4,
    title: '《白蛇傳》第四日 · 晨課',
    body:
      '梁照水比誰都早。院子裡霜還沒化，她的銀槍已經掃了七圈。葉庭芳出來時看見她，停了一下，沒打招呼，繞到另一邊吊嗓。程蘅玉沒出現 — 她昨夜沒睡，唐桂蘭替她在小生東廂門口放了一壺熱茶，沒敲門。',
    involvedCharacterIds: [
      'char_liang_zhaoshui',
      'char_ye_tingfang',
      'char_tang_guilan',
      'char_cheng_hengyu',
    ],
    walrusBlobId: 'mock_walrus_blob_chapter_day4_morning',
    visibility: 'public_chapter',
    createdAt: '2026-05-18T07:15:00Z',
  },
  {
    id: 'chapter_day4_pov_liang',
    sagaId: DEMO_SAGA_ID,
    day: 4,
    title: '〈銀槍〉· 梁照水視角',
    body:
      '我把槍掃到第八圈才聽見她出來。葉庭芳。我沒抬頭。她也沒過來。我知道她昨夜跟程蘅玉之間發生了什麼 — 後門落鎖時我從院牆外經過，廂房的燈亮著兩條人影。我沒看第二眼。我只想再把這桿槍練到旁人不敢搶我的位置。蕭班主說我是戲樓的骨。骨不會痛，骨只會撐。',
    povCharacterId: 'char_liang_zhaoshui',
    involvedCharacterIds: ['char_liang_zhaoshui', 'char_ye_tingfang'],
    walrusBlobId: 'mock_walrus_blob_chapter_day4_pov_liang',
    visibility: 'public_chapter',
    createdAt: '2026-05-18T07:40:00Z',
  },
  {
    id: 'chapter_day4_house_books',
    sagaId: DEMO_SAGA_ID,
    day: 4,
    title: '〈帳本〉· 沈懷音內院',
    body:
      '案燈下，沈懷音翻完最後一頁。霞飛路口的票房預售只賣出三成，洋大人的包廂仍空著兩個。她把毛筆懸在「許仙」二字上方良久，沒落下。她想起二十年前自己掛大樑的那一年，蕭班主給她寫過一張字條，只有四個字：「你先唱。」她沒把那張字條留下。但今夜她突然知道，當年那張字條也許不是寫給她的，是寫給每一個會在後台練到天亮的人。',
    povCharacterId: 'char_shen_huaiyin',
    involvedCharacterIds: ['char_shen_huaiyin'],
    walrusBlobId: 'mock_walrus_blob_chapter_day4_house_books',
    visibility: 'saga_internal',
    createdAt: '2026-05-18T23:20:00Z',
  },
];

export const listChaptersBySaga = (sagaId: string): Chapter[] =>
  chapters.filter((c) => c.sagaId === sagaId).sort((a, b) => b.day - a.day || a.createdAt.localeCompare(b.createdAt));

export const listPublicChaptersForCharacter = (characterId: string): Chapter[] =>
  chapters
    .filter(
      (c) =>
        c.visibility === 'public_chapter' &&
        (c.povCharacterId === characterId || c.involvedCharacterIds.includes(characterId))
    )
    .sort((a, b) => b.day - a.day);

export const getChapterById = (id: string): Chapter | undefined =>
  chapters.find((c) => c.id === id);
