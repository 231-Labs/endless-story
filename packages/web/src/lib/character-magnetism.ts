export interface SignatureQuote {
  text: string;
  chapterId?: string;
}

// 1 evocative line per character — quoted in the subscribe card to surface
// "voice". Sourced from existing chapter bodies (POV first, ensemble fallback).
export const SIGNATURE_QUOTES: Record<string, SignatureQuote> = {
  char_shen_huaiyin: {
    text: '當年那張字條也許不是寫給她的，是寫給每一個會在後台練到天亮的人。',
    chapterId: 'chapter_day4_house_books',
  },
  char_ye_tingfang: {
    text: '我替她繫的這一袖綁得比我自己的還整齊。',
    chapterId: 'chapter_day3_pov_ye',
  },
  char_cheng_hengyu: {
    text: '我只在乎她替我繫水袖的時候有沒有抬頭看我。',
    chapterId: 'chapter_day3_pov_cheng',
  },
  char_liang_zhaoshui: {
    text: '骨不會痛，骨只會撐。',
    chapterId: 'chapter_day4_pov_liang',
  },
  char_du_tinglan: {
    text: '她從青灰短褂胸口摸出一個漆木針盤、輕輕一放，蓋上唱針。',
    chapterId: 'chapter_day3_evening_meal',
  },
  char_tang_guilan: {
    text: '唐姐替我擱在第三個櫃子最底層。',
    chapterId: 'chapter_day3_pov_ye',
  },
  char_meng_yunping: {
    text: '杜聽瀾的胡琴沒停，她也沒停，硬把那個錯音轉成了哭腔。',
    chapterId: 'chapter_day2_audition',
  },
  char_su_xiaowan: {
    text: '十七歲的女孩眼睛永遠最亮。',
    chapterId: 'chapter_day3_evening_meal',
  },
  char_zhao_tiemian: {
    text: '臉譜油彩一上便不似人，下了戲台卻是個愛抱貓的木訥漢子。',
  },
};

// Static "social proof" — base subscriber count shown on each card.
// Toggle on click locally adjusts by ±1.
export const BASE_SUBSCRIBER_COUNT: Record<string, number> = {
  char_shen_huaiyin: 23,
  char_ye_tingfang: 47,
  char_cheng_hengyu: 52,
  char_liang_zhaoshui: 28,
  char_du_tinglan: 15,
  char_tang_guilan: 9,
  char_meng_yunping: 31,
  char_su_xiaowan: 12,
  char_zhao_tiemian: 38,
};

// Hours until next POV transformation. Static for demo.
export const NEXT_POV_HINT: Record<string, string> = {
  char_shen_huaiyin: '12 小時內',
  char_ye_tingfang: '6 小時內',
  char_cheng_hengyu: '6 小時內',
  char_liang_zhaoshui: '8 小時內',
  char_du_tinglan: '10 小時內',
  char_tang_guilan: '14 小時內',
  char_meng_yunping: '7 小時內',
  char_su_xiaowan: '24 小時內',
  char_zhao_tiemian: '今晚開鑼後',
};
