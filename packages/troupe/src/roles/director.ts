/** 班主 / 導演 — proposes the production from the repertoire (PROPOSED → SCRIPTED). */

import type { ProductionBrief, TroupeMember } from '../types.ts';
import { askOr, type Ask } from '../llm.ts';
import { REPERTOIRE, resolvePlay } from '../repertoire.ts';

/**
 * 班主 decides WHICH play to mount (the autonomous replacement for the human
 * `--play` pick). Considers 行當 coverage (a full 生旦淨丑 roster can carry a
 * 大戲) + freshness. Returns a repertoire key. Mock → heuristic by coverage.
 */
export async function chooseProduction(troupe: TroupeMember[], ask: Ask): Promise<string> {
  const hd = new Set(troupe.map((m) => m.hangdang));
  const canGrand = ['生', '旦', '淨', '丑'].every((h) => hd.has(h));
  const fallback = () => (canGrand ? 'baishe_full' : 'baishe');
  if (ask.mock) return fallback();

  const menu = Object.values(REPERTOIRE)
    .map((p) => `${p.key}｜${p.title}（需 ${[...new Set(p.parts.map((x) => x.hangdang))].join('')}，${p.scenes.length}場${p.improved ? '，改良新編' : ''}）`)
    .join('\n');
  const pick = await askOr(
    ask,
    {
      kind: 'cheap',
      system: '你是春雪社班主，要挑這次排哪一齣戲。考量班底行當覆蓋（齊全才撐得起大戲）與新鮮感。只回一個 key，不要解釋。',
      user: `班底行當：${[...hd].join('')}\n戲碼目錄：\n${menu}\n\n只回一個 key。`,
      maxTokens: 24,
      temperature: 0.5,
    },
    fallback,
  );
  return resolvePlay(pick.trim()).key;
}

export async function propose(
  troupe: TroupeMember[],
  director: TroupeMember,
  ask: Ask,
  classicKey?: string,
): Promise<ProductionBrief> {
  const play = resolvePlay(classicKey);

  const premise = await askOr(
    ask,
    {
      kind: 'cheap',
      system: `你是春雪社班主${director.name}。為一齣「舊戲新唱」定一句立意——老戲《${play.classicSource}》${play.improved ? '要做改良新編，敢動原著的宿命結局' : '排出新味道'}。方向提示：${play.premiseSeed}。只回一句立意，不要解釋。一律使用繁體中文。`,
      user: `請給這次重排《${play.title}》的一句立意。`,
      maxTokens: 140,
      temperature: 0.7,
    },
    () =>
      play.improved
        ? '不認那場前定的眼淚——這一回，讓黛玉自己選要不要哭。'
        : '不問天條無情，只訴凡塵有悔。',
  );

  return {
    classicKey: play.key,
    classicSource: play.classicSource,
    title: play.title,
    premise,
    qizhi: play.qizhi,
    budget: 1200,
    sceneOutline: play.scenes.map((s) => ({ title: s.title, mood: s.mood, summary: s.summary, parts: s.parts })),
    directorId: director.id,
    directorName: director.name,
  };
}
