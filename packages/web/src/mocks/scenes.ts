import type { SceneClip } from '@endless-story/shared';
import { DEMO_SAGA_ID } from './sagas.js';

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
    createdAt: '2026-05-15T22:40:00Z',
  },
];

export const listTodaySceneClips = (currentDay: number, count = 4): SceneClip[] =>
  [...sceneClips]
    .sort((a, b) => Math.abs(a.day - currentDay) - Math.abs(b.day - currentDay) || b.day - a.day)
    .slice(0, count);
