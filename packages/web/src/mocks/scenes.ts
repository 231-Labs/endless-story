import type { Scene, SceneClip } from '@endless-story/shared';
import { LOC_COMPOUND_ID, LOC_THEATER_ID, DEMO_SAGA_ID } from './sagas';

/**
 * 春雪社擁有的 scenes — 戲樓內外的細節空間。
 * 對應舊版 chain 上 Scene 物件（saga 在 location 內建立）。
 *
 * privacyLevel：
 *   0 公開大庭廣眾   · 戲樓主台 / 院中空地
 *   1 工作場所       · 後台 / 樂棚 / 帳房 / 箱房
 *   2 半私密         · 廂房 / 雜物間門口
 *   3 幽僻           · 後巷
 *   4 夜宿共寢       · 通鋪
 *   5 獨處私房       · 班主帳房內室
 */
export const scenes: Scene[] = [
  {
    id: 'scene_main_stage',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_THEATER_ID,
    name: '戲樓主台',
    description: '百花樓的中庭木台。三面開窗，燈火通明時可坐三百客。',
    privacyLevel: 0,
    currentCharacterIds: [],
    recentEventChapterId: 'chapter_day3_water_sleeves',
    heatProfile: { cinnabar: 0.6, jade: 0.85, mute: 0.3 },
    pastEvents: [
      { chapterId: 'chapter_day1_first_rehearsal', day: 1, brief: '第一次彩排 — 九個名字、九個位置。' },
      { chapterId: 'chapter_day3_water_sleeves', day: 3, brief: '《水漫金山》正本彩排。' },
    ],
    derivativeCounts: { chapters: 2, memories: 4, soulSongs: 1 },
    ghostQuotes: [
      { characterId: 'char_shen_huaiyin', text: '燈一亮，三百張臉都成了戲詞的一部分。我只看戲、不看人。' },
      { characterId: 'char_ye_tingfang', text: '台上沒有「我」。上台前那口氣我吞掉，就是白蛇。' },
      { characterId: 'char_cheng_hengyu', text: '燈下我成了許仙 — 卸了妝之後，我得想辦法把自己撿回來。' },
    ],
    gallery: {
      anchor: {
        walrusBlobId: 'mock_anchor_main_stage',
        imageUrl: '',
        kind: 'anchor',
        createdAt: '2026-05-12T00:00:00Z',
      },
    },
    performance: {
      title: '白蛇傳·斷橋',
      chapterId: 'chapter_day3_water_sleeves',
      startedAt: '2026-05-18T19:00:00Z',
    },
  },
  {
    id: 'scene_backstage',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_THEATER_ID,
    name: '後台',
    description: '主台後側的化妝與候場區。卸妝鏡與道具籮並排，常聽見胡琴試弦聲。',
    privacyLevel: 1,
    currentCharacterIds: ['char_cheng_hengyu', 'char_ye_tingfang'],
    recentEventChapterId: 'chapter_day3_water_sleeves',
    heatProfile: { cinnabar: 0.95, jade: 0.5, mute: 0.4 },
    pastEvents: [
      { chapterId: 'chapter_day2_audition', day: 2, brief: '試許仙三段 — 程蘅玉初亮相。' },
      { chapterId: 'chapter_day3_water_sleeves', day: 3, brief: '葉庭芳替程蘅玉繫水袖、沒說話。' },
      { chapterId: 'chapter_day3_pov_ye', day: 3, brief: '葉庭芳獨在卸妝鏡前。' },
      { chapterId: 'chapter_day3_pov_cheng', day: 3, brief: '程蘅玉繞井邊洗臉的那晚。' },
    ],
    derivativeCounts: { chapters: 4, memories: 9, soulSongs: 3 },
    ghostQuotes: [
      { characterId: 'char_ye_tingfang', text: '替她繫水袖時，我的手不抖。可是水袖落下那一刻，我看見鏡子裡是我的眼睛、不是她的。' },
      { characterId: 'char_cheng_hengyu', text: '她沒有罵我。她在後台路過我，像路過一張椅子。' },
      { characterId: 'char_meng_yunping', text: '我躲在屏風後聽 — 她們什麼都沒說。沉默有時比一場吵架還響。' },
      { characterId: 'char_shen_huaiyin', text: '我什麼都看見了。我只擱筷子、不評。' },
      { characterId: 'char_du_tinglan', text: '胡琴的弦從這道門外傳進來，會比正廳柔三分。' },
    ],
  },
  {
    id: 'scene_bunk_room',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_COMPOUND_ID,
    name: '通鋪',
    description: '後院西側女伶共寢的長榻房，五張通鋪緊挨著。半夜常有人翻身、有人悶哭。',
    privacyLevel: 4,
    currentCharacterIds: ['char_meng_yunping', 'char_su_xiaowan'],
    recentEventChapterId: 'chapter_day3_evening_meal',
    heatProfile: { cinnabar: 0.75, jade: 0.45, mute: 0.7 },
    pastEvents: [
      { chapterId: 'chapter_day3_evening_meal', day: 3, brief: '暮後合戲後各自就寢，無人開口。' },
    ],
    derivativeCounts: { chapters: 1, memories: 5, soulSongs: 2 },
    ghostQuotes: [
      { characterId: 'char_meng_yunping', text: '我聽見她半夜翻身。她以為沒人聽見。' },
      { characterId: 'char_su_xiaowan', text: '我把今日聽來的唱腔一句句哼回去，怕睡醒就忘。' },
      { characterId: 'char_ye_tingfang', text: '在這通鋪、我不能哭給人看。我把眼淚都收進枕頭。' },
    ],
  },
  {
    id: 'scene_east_hall',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_COMPOUND_ID,
    name: '東廂外廊',
    description: '主樓東側的迴廊，夜間月色斜照。班主常在這裡踱步思事。',
    privacyLevel: 2,
    currentCharacterIds: ['char_ye_tingfang'],
    recentEventChapterId: 'chapter_day4_morning',
    heatProfile: { cinnabar: 0.55, jade: 0.4, mute: 0.65 },
    pastEvents: [
      { chapterId: 'chapter_day4_morning', day: 4, brief: '清晨第一道光斜照欄杆。' },
    ],
    derivativeCounts: { chapters: 1, memories: 3, soulSongs: 1 },
    ghostQuotes: [
      { characterId: 'char_ye_tingfang', text: '東廂的月色斜照欄杆。我在這裡站著，誰也不來打擾。' },
      { characterId: 'char_shen_huaiyin', text: '我踱步的時候，戲是在心裡先演一遍的。' },
    ],
  },
  {
    id: 'scene_accounting',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_COMPOUND_ID,
    name: '帳房',
    description: '油燈下兩本帳簿。蕭班主每夜核完票房才上床，帳上有班子真正的命脈。',
    privacyLevel: 1,
    currentCharacterIds: ['char_shen_huaiyin'],
    recentEventChapterId: 'chapter_day4_house_books',
    heatProfile: { cinnabar: 0.2, jade: 0.3, mute: 0.95 },
    pastEvents: [
      { chapterId: 'chapter_day4_house_books', day: 4, brief: '蕭班主核完票房，落筆寫榜。' },
    ],
    derivativeCounts: { chapters: 1, memories: 2, soulSongs: 0 },
    ghostQuotes: [
      { characterId: 'char_shen_huaiyin', text: '帳上有班子真正的命脈。比戲詞還重。' },
      { characterId: 'char_tang_guilan', text: '她每夜都坐在這。我送湯來，她也只是抬一下眼。' },
    ],
  },
  {
    id: 'scene_music_shed',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_THEATER_ID,
    name: '樂棚',
    description: '主台側翼的樂師席，胡琴與三弦掛在牆上。杜聽瀾常獨自試弦到深夜。',
    privacyLevel: 1,
    currentCharacterIds: ['char_du_tinglan'],
    recentEventChapterId: 'chapter_day2_audition',
    heatProfile: { cinnabar: 0.4, jade: 0.75, mute: 0.55 },
    pastEvents: [
      { chapterId: 'chapter_day2_audition', day: 2, brief: '杜聽瀾的胡琴沒停 — 把錯音轉成哭腔。' },
    ],
    derivativeCounts: { chapters: 1, memories: 4, soulSongs: 1 },
    ghostQuotes: [
      { characterId: 'char_du_tinglan', text: '弦聲先於語言。我聽她的呼吸調我的弓。' },
      { characterId: 'char_cheng_hengyu', text: '她拉那個過門時、我就知道她聽見了我前一晚沒睡。' },
    ],
  },
  {
    id: 'scene_courtyard',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_COMPOUND_ID,
    name: '院中空地',
    description: '主樓與後院之間的空場。練槍練腿都在這。冬日積霜，履聲格外清。',
    privacyLevel: 0,
    currentCharacterIds: ['char_liang_zhaoshui'],
    recentEventChapterId: 'chapter_day4_pov_liang',
    heatProfile: { cinnabar: 0.35, jade: 0.8, mute: 0.5 },
    pastEvents: [
      { chapterId: 'chapter_day4_pov_liang', day: 4, brief: '梁照水銀槍掃到第八圈，霜還沒化。' },
    ],
    derivativeCounts: { chapters: 1, memories: 3, soulSongs: 1 },
    ghostQuotes: [
      { characterId: 'char_liang_zhaoshui', text: '銀槍掃過第八圈時，霜還沒化。我聽到自己的履聲，比所有人都清。' },
      { characterId: 'char_su_xiaowan', text: '我蹲在屋簷下看她練 — 我知道有一天我也會這樣。' },
    ],
  },
  {
    id: 'scene_trunk_room',
    sagaId: DEMO_SAGA_ID,
    locationId: LOC_THEATER_ID,
    name: '箱房',
    description: '戲服與道具的庫房。唐桂蘭按行當編號每件，潮了的披帛必先掛起。',
    privacyLevel: 1,
    currentCharacterIds: ['char_tang_guilan'],
    heatProfile: { cinnabar: 0.15, jade: 0.35, mute: 0.9 },
    pastEvents: [],
    derivativeCounts: { chapters: 0, memories: 2, soulSongs: 0 },
    ghostQuotes: [
      { characterId: 'char_tang_guilan', text: '每一件戲服都有自己的脾氣。潮了的披帛，不掛起來明天就出毛邊。' },
    ],
  },
];

export const listScenesBySaga = (sagaId: string): Scene[] =>
  scenes.filter((s) => s.sagaId === sagaId);

export const getSceneById = (id: string): Scene | undefined =>
  scenes.find((s) => s.id === id);

export const sceneClips: SceneClip[] = [
  {
    id: 'clip_day3_water_sleeves',
    sagaId: DEMO_SAGA_ID,
    chapterId: 'chapter_day3_water_sleeves',
    day: 3,
    title: '水袖那一夜',
    caption: '葉庭芳替程蘅玉繫水袖。沒敲門，沒說話。',
    videoUrl: '/mock/clips/water_sleeves.mp4',
    thumbnailUrl: '/mock/clips/water_sleeves.jpg',
    durationSeconds: 6,
    aspect: '9/16',
    createdAt: '2026-05-17T23:55:00Z',
  },
  {
    id: 'clip_day2_off_key',
    sagaId: DEMO_SAGA_ID,
    chapterId: 'chapter_day2_audition',
    day: 2,
    title: '走了調的「斷橋」',
    caption: '孟雲屏走了調，杜聽瀾的胡琴沒停。',
    videoUrl: '/mock/clips/off_key.mp4',
    thumbnailUrl: '/mock/clips/off_key.jpg',
    durationSeconds: 5,
    aspect: '1/1',
    createdAt: '2026-05-16T22:50:00Z',
  },
  {
    id: 'clip_day4_silver_spear',
    sagaId: DEMO_SAGA_ID,
    chapterId: 'chapter_day4_pov_liang',
    day: 4,
    title: '銀槍八圈',
    caption: '梁照水的槍掃到第八圈，霜還沒化。',
    videoUrl: '/mock/clips/silver_spear.mp4',
    thumbnailUrl: '/mock/clips/silver_spear.jpg',
    durationSeconds: 5,
    aspect: '16/9',
    createdAt: '2026-05-18T07:20:00Z',
  },
  {
    id: 'clip_day1_board',
    sagaId: DEMO_SAGA_ID,
    chapterId: 'chapter_day1_first_rehearsal',
    day: 1,
    title: '一張榜',
    caption: '九個名字、九個位置；只有一個許仙。',
    videoUrl: '/mock/clips/board.mp4',
    thumbnailUrl: '/mock/clips/board.jpg',
    durationSeconds: 4,
    aspect: '3/4',
    createdAt: '2026-05-15T22:40:00Z',
  },
];

export const listTodaySceneClips = (currentDay: number, count = 4): SceneClip[] =>
  [...sceneClips]
    .sort((a, b) => Math.abs(a.day - currentDay) - Math.abs(b.day - currentDay) || b.day - a.day)
    .slice(0, count);
