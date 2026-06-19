/**
 * 戲折 assembly — one production folded into a single collectible markdown (the
 * "可收藏物件" shape: 班底 + 分場 + 折子章回 + 角兒私詞). Pure; reused by the CLI
 * driver and the runner production service (anchored on-chain there).
 */

import type { Production } from './types.ts';

export function assembleXiZhe(prod: Production): string {
  const emergentSong = prod.ci?.find((c) => c.source === 'emergent');
  const climaxTitle =
    prod.script?.scenes.find((s) => s.mood === 'sorrow')?.title ??
    prod.script?.scenes.at(-1)?.title ??
    '';
  return [
    `# 春雪社 · 戲折 ·《${prod.brief?.title ?? ''}》`,
    `${prod.brief?.classicSource ?? ''}　${prod.skipScore ? '純排戲折（無音律）' : '含工尺·配樂'}　·　${prod.cast?.length ?? 0} 角 ${prod.script?.scenes.length ?? 0} 場`,
    ``,
    `> 立意：${(prod.brief?.premise ?? '').split('\n')[0]}`,
    `> 班主：${prod.brief?.directorName ?? ''}　·　氣質：${prod.brief?.qizhi ?? ''}`,
    ``,
    `## 班底`,
    ...(prod.cast ?? []).map(
      (c) =>
        `- **${c.partName}** — ${c.assignedName ?? '（缺角）'}（${c.hangdang}/${c.yinggong}）${c.crossCastLabel ? `〔${c.crossCastLabel}〕` : ''}`,
    ),
    ``,
    `## 分場`,
    ...(prod.script?.scenes ?? []).map((s, i) => `${i + 1}. 〈${s.title}〉（${s.mood}）`),
    ``,
    `## 折子 · 戲中戲〈${climaxTitle}〉`,
    ``,
    prod.chapter ?? '',
    // The woven chapter is a Rashomon — POVs interlace without labels. Carry the
    // raw per-actor takes too, so the reader can see WHOSE 視角 each one is.
    ...(prod.takes?.length
      ? [
          ``,
          `## 各角視角`,
          ...prod.takes.flatMap((t) => {
            const cross = prod.cast?.find((c) => c.partId === t.partId)?.crossCastLabel;
            return [``, `### ${t.actorName} 飾 ${t.partName}${cross ? `〔${cross}〕` : ''}`, ``, t.pov];
          }),
        ]
      : []),
    ...(emergentSong
      ? [``, `## 角兒私詞 ·《${emergentSong.title}》〔有感而發〕`, ...emergentSong.lines.map((l) => `　${l}`)]
      : []),
  ].join('\n');
}
