import type { CharacterMagnetism } from '@endless-story/shared';

/**
 * 9 角色的 magnetism 數據 — 由舊版 `lib/character-magnetism.ts` 收進 mocks layer。
 *
 * 未來接 backend 時：
 *   - subscriberCount → 從訂閱表 count(*) where character_id = ?
 *   - signatureQuote  → 由 LLM / saga server 從 reflections / chapters 挑出
 *   - nextPovHint     → 由 saga server runner schedule 推算
 */
export const magnetismByCharacterId: Record<string, CharacterMagnetism> = {
  char_shen_huaiyin: {
    characterId: 'char_shen_huaiyin',
    signatureQuote: {
      text: '當年那張字條也許不是寫給她的，是寫給每一個會在後台練到天亮的人。',
      chapterId: 'chapter_day4_house_books',
    },
    subscriberCount: 23,
    nextPovHint: '12 小時內',
  },
  char_ye_tingfang: {
    characterId: 'char_ye_tingfang',
    signatureQuote: {
      text: '我替她繫的這一袖綁得比我自己的還整齊。',
      chapterId: 'chapter_day3_pov_ye',
    },
    subscriberCount: 47,
    nextPovHint: '6 小時內',
  },
  char_cheng_hengyu: {
    characterId: 'char_cheng_hengyu',
    signatureQuote: {
      text: '我只在乎她替我繫水袖的時候有沒有抬頭看我。',
      chapterId: 'chapter_day3_pov_cheng',
    },
    subscriberCount: 52,
    nextPovHint: '6 小時內',
  },
  char_liang_zhaoshui: {
    characterId: 'char_liang_zhaoshui',
    signatureQuote: { text: '骨不會痛，骨只會撐。', chapterId: 'chapter_day4_pov_liang' },
    subscriberCount: 28,
    nextPovHint: '8 小時內',
  },
  char_du_tinglan: {
    characterId: 'char_du_tinglan',
    signatureQuote: {
      text: '她從青灰短褂胸口摸出一個漆木針盤、輕輕一放，蓋上唱針。',
      chapterId: 'chapter_day3_evening_meal',
    },
    subscriberCount: 15,
    nextPovHint: '10 小時內',
  },
  char_tang_guilan: {
    characterId: 'char_tang_guilan',
    signatureQuote: {
      text: '唐姐替我擱在第三個櫃子最底層。',
      chapterId: 'chapter_day3_pov_ye',
    },
    subscriberCount: 9,
    nextPovHint: '14 小時內',
  },
  char_meng_yunping: {
    characterId: 'char_meng_yunping',
    signatureQuote: {
      text: '杜聽瀾的胡琴沒停，她也沒停，硬把那個錯音轉成了哭腔。',
      chapterId: 'chapter_day2_audition',
    },
    subscriberCount: 31,
    nextPovHint: '7 小時內',
  },
  char_su_xiaowan: {
    characterId: 'char_su_xiaowan',
    signatureQuote: {
      text: '十七歲的女孩眼睛永遠最亮。',
      chapterId: 'chapter_day3_evening_meal',
    },
    subscriberCount: 12,
    nextPovHint: '24 小時內',
  },
  char_zhao_tiemian: {
    characterId: 'char_zhao_tiemian',
    signatureQuote: { text: '臉譜油彩一上便不似人，下了戲台卻是個愛抱貓的木訥漢子。' },
    subscriberCount: 38,
    nextPovHint: '今晚開鑼後',
  },
};
