import type { CharacterLiveState } from '@endless-story/shared';

/**
 * 9 角色的 live state mock。
 *
 * 接 backend 後此檔可廢 — `lib/api/liveState.ts` 改成 fetch runner perception endpoint
 * 即可，UI 完全不變。
 */
export const liveStatesByCharacterId: Record<string, CharacterLiveState> = {
  char_shen_huaiyin: {
    intent: '核今晚票房，決定哪一箱戲服先送去補線。',
    location: '帳房窗下 · 戌時後',
    nextPlan: '等葉庭芳試完水袖，再定明日排場。',
  },
  char_ye_tingfang: {
    intent: '把《白蛇傳》的水袖改短半寸，避開程蘅玉的傷腕。',
    location: '東廂外廊 · 子夜後',
    nextPlan: '等班主定下許仙，再決定要不要開口。',
  },
  char_cheng_hengyu: {
    intent: '背許仙過橋那段詞，右手仍不敢用力。',
    location: '後台燈架旁 · 子夜後',
    nextPlan: '先請杜聽瀾慢一拍，明早再補身段。',
  },
  char_liang_zhaoshui: {
    intent: '把銀槍收勢再壓低，免得掃到前排茶桌。',
    location: '院中空地 · 夜風起',
    nextPlan: '若明日有武戲，先替蘇小宛拆一遍步法。',
  },
  char_du_tinglan: {
    intent: '重調胡琴第二弦，讓白蛇上場時更柔一點。',
    location: '樂棚後側 · 燈未滅',
    nextPlan: '等程蘅玉試嗓後，改掉那個太急的過門。',
  },
  char_tang_guilan: {
    intent: '替青衣衣箱重新編號，把潮了的披帛先掛起來。',
    location: '箱房 · 油燈旁',
    nextPlan: '明晨送兩件戲服去熨，順手查少了哪支簪。',
  },
  char_meng_yunping: {
    intent: '偷聽班主點戲，盤算自己能不能討一個小場。',
    location: '後台門簾後 · 人聲散',
    nextPlan: '先把新學的腔記住，明日找葉庭芳請教。',
  },
  char_su_xiaowan: {
    intent: '把今日聽來的唱腔一句句哼回去，怕睡醒就忘。',
    location: '雜物間門口 · 半盞燈',
    nextPlan: '天亮前補完掃地，再去看梁照水練槍。',
  },
  char_zhao_tiemian: {
    intent: '核法海出場的鑼點，心裡仍嫌春雪社太講究。',
    location: '碼頭茶攤 · 夜深',
    nextPlan: '明日進班前，先問清這場客串算幾日錢。',
  },
};
