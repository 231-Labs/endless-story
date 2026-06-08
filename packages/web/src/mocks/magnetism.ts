import type { CharacterMagnetism } from '@endless-story/shared';

/**
 * Magnetism data for the 9 characters — moved into the mocks layer from the old `lib/character-magnetism.ts`.
 *
 * When wired to a backend later:
 *   - subscriberCount → count(*) from the subscriptions table where character_id = ?
 *   - signatureQuote  → picked from reflections / chapters by the LLM / saga server
 *   - nextPovHint     → derived from the saga server runner schedule
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
