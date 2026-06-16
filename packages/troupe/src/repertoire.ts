/**
 * 戲碼目錄 — the classics a 班主 can propose to re-stage (舊戲新唱).
 *
 * Each entry is a template: the play's PARTS (行當-granular roles, independent of
 * who plays them), the per-scene outline (with who's on stage), and the stage
 * COUPLE that drives emotional casting. The director picks an entry; the
 * playwright/caster read parts + scenes from it. Add a classic = add an entry.
 */

import type { Mood, Part } from './types.ts';

export interface SceneSpec {
  title: string;
  mood: Mood;
  summary: string;
  /** partIds on stage this scene. */
  parts: string[];
}

export interface Repertoire {
  key: string;
  classicSource: string;
  title: string;
  qizhi: string;
  /** a hint the director turns into a one-line 立意. */
  premiseSeed: string;
  /** true = 改良新編 (the director is licensed to bend the canonical ending). */
  improved?: boolean;
  parts: Part[];
  /** the stage couple (partIds) — cast opposite each other when two members bond off-stage. */
  couple: [string, string];
  scenes: SceneSpec[];
}

export const REPERTOIRE: Record<string, Repertoire> = {
  // ── 白蛇傳·斷橋 ──
  baishe: {
    key: 'baishe',
    classicSource: '白蛇傳',
    title: '斷橋·新唱',
    qizhi: '哀而不傷，舊調新魂',
    premiseSeed: '把人妖之戀的天條悲劇，翻成凡塵裡的悔與不捨。',
    parts: [
      { partId: 'bai', partName: '白素貞', hangdang: '旦', yinggong: '青衣', roleGender: 'female', martial: '文' },
      { partId: 'xu', partName: '許仙', hangdang: '生', yinggong: '文小生', roleGender: 'male', martial: '文' },
      { partId: 'qing', partName: '小青', hangdang: '旦', yinggong: '武旦', roleGender: 'female', martial: '武' },
    ],
    couple: ['bai', 'xu'],
    scenes: [
      { title: '遊湖借傘', mood: 'joy', summary: '西湖初遇，許仙白娘子借傘定情。', parts: ['bai', 'xu'] },
      { title: '驚變', mood: 'tense', summary: '端午雄黃，白娘子現形，許仙驚仆。', parts: ['bai', 'xu'] },
      { title: '斷橋', mood: 'sorrow', summary: '水漫金山後重逢斷橋，恨與不捨交織。', parts: ['bai', 'xu', 'qing'] },
    ],
  },

  // ── 紅樓夢·改良（敢動原著宿命結局）──
  honglou: {
    key: 'honglou',
    classicSource: '紅樓夢',
    title: '紅樓·改良',
    qizhi: '不認前定，許癡人一個選擇',
    premiseSeed: '改寫木石前盟的眼淚宿命——讓黛玉不焚稿、不含恨而終，當面把話說盡、自己做一次選擇。',
    improved: true,
    parts: [
      { partId: 'baoyu', partName: '賈寶玉', hangdang: '生', yinggong: '文小生', roleGender: 'male', martial: '文' },
      { partId: 'daiyu', partName: '林黛玉', hangdang: '旦', yinggong: '青衣', roleGender: 'female', martial: '文' },
      { partId: 'baochai', partName: '薛寶釵', hangdang: '旦', yinggong: '青衣', roleGender: 'female', martial: '文' },
    ],
    couple: ['baoyu', 'daiyu'],
    scenes: [
      { title: '共讀西廂', mood: 'longing', summary: '沁芳閘畔，寶黛同讀西廂，情根暗種。', parts: ['baoyu', 'daiyu'] },
      { title: '黛玉葬花', mood: 'sorrow', summary: '落紅成陣，黛玉荷鋤葬花，寶玉牆角聞之腸斷。', parts: ['daiyu', 'baoyu'] },
      { title: '改寫·訴肺腑', mood: 'tense', summary: '（改良）黛玉不焚稿、不含恨而終，當面訴盡肺腑，逼出寶玉與寶釵之間的真話與選擇。', parts: ['baoyu', 'daiyu', 'baochai'] },
    ],
  },

  // ── 白蛇傳·全本（大戲：生旦淨丑齊全，七場）──
  baishe_full: {
    key: 'baishe_full',
    classicSource: '白蛇傳',
    title: '白蛇傳·全本',
    qizhi: '全本大戲，生旦淨丑齊登台',
    premiseSeed: '排一齣行當齊全的全本《白蛇傳》，從遊湖到合缽，悲歡聚散一氣呵成。',
    parts: [
      { partId: 'bai', partName: '白素貞', hangdang: '旦', yinggong: '青衣', roleGender: 'female', martial: '文' },
      { partId: 'xu', partName: '許仙', hangdang: '生', yinggong: '文小生', roleGender: 'male', martial: '文' },
      { partId: 'qing', partName: '小青', hangdang: '旦', yinggong: '武旦', roleGender: 'female', martial: '武' },
      { partId: 'fahai', partName: '法海', hangdang: '淨', yinggong: '銅錘花臉', roleGender: 'male', martial: '文' },
      { partId: 'tianjiang', partName: '天將', hangdang: '生', yinggong: '武生', roleGender: 'male', martial: '武' },
      { partId: 'chuanjia', partName: '船家', hangdang: '丑', yinggong: '文丑', roleGender: 'male', martial: '文' },
    ],
    couple: ['bai', 'xu'],
    scenes: [
      { title: '遊湖借傘', mood: 'joy', summary: '西湖煙雨，許仙白娘子借傘定情，船家撐篙搭橋。', parts: ['bai', 'xu', 'qing', 'chuanjia'] },
      { title: '結親', mood: 'serene', summary: '良緣既訂，白許結為夫妻，安居錢塘開藥鋪。', parts: ['bai', 'xu'] },
      { title: '端午驚變', mood: 'tense', summary: '雄黃酒下，白娘子失守現形，許仙驚仆昏厥。', parts: ['bai', 'xu'] },
      { title: '盜仙草', mood: 'wrath', summary: '白娘子拚死赴崑崙盜靈芝救夫，力戰守山天將。', parts: ['bai', 'qing', 'tianjiang'] },
      { title: '水漫金山', mood: 'wrath', summary: '白青水漫金山討還許仙，與法海天將惡鬥。', parts: ['bai', 'qing', 'fahai', 'tianjiang'] },
      { title: '斷橋', mood: 'sorrow', summary: '水鬥力竭，斷橋重逢，恨郎輕信與不捨交織。', parts: ['bai', 'xu', 'qing'] },
      { title: '合缽', mood: 'sorrow', summary: '法海以金缽收白娘子，夫妻死別，雷峰塔永鎮。', parts: ['bai', 'xu', 'fahai'] },
    ],
  },
};

const ALIAS: Record<string, string> = {
  baishe: 'baishe', 白蛇: 'baishe', 白蛇傳: 'baishe', 斷橋: 'baishe',
  honglou: 'honglou', 紅樓: 'honglou', 紅樓夢: 'honglou', 紅樓改良: 'honglou', 紅樓夢改良: 'honglou',
  baishe_full: 'baishe_full', 白蛇全本: 'baishe_full', 白蛇傳全本: 'baishe_full', 全本白蛇: 'baishe_full', 白蛇大戲: 'baishe_full', 大戲: 'baishe_full',
};

/** Resolve a CLI/alias name (key, 中文名, or 戲名) to a repertoire entry; default 白蛇. */
export function resolvePlay(alias?: string): Repertoire {
  const key = alias ? (ALIAS[alias] ?? alias) : 'baishe';
  return REPERTOIRE[key] ?? REPERTOIRE.baishe;
}
