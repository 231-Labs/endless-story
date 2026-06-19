/**
 * 戲折 assembly — one production folded into a single collectible markdown
 * (班底 + 分場·劇本 + 折子戲中戲 + 各角視角 + 唱詞). Pure; reused by the CLI
 * driver and the runner production service (anchored on-chain there).
 */

import type { Production } from './types.ts';

export function assembleXiZhe(prod: Production): string {
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
    // 分場 carries each scene's 劇本 (科介 / 念白 / 唱) so the reader can open a
    // 折 and read the actual play — the 唱 lines are the 唱段.
    `## 分場`,
    ...(prod.script?.scenes ?? []).flatMap((s, i) => [
      ``,
      `### ${i + 1} 〈${s.title}〉（${s.mood}）`,
      ...s.lines.map((l) =>
        l.type === 'stage' ? `（科介）${l.text}` : `${l.who}（${l.mode === '唱' ? '唱' : '白'}）：${l.text}`,
      ),
    ]),
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
    // 唱詞 — ALL of them: the 應場 aria the 填詞 wrote for the climax + every
    // 有感而發 private 詞 (was dropped before — only the first emergent showed).
    ...(prod.ci?.length
      ? [
          ``,
          `## 唱詞`,
          ...prod.ci.flatMap((c) => [
            ``,
            `### ${c.title} · ${c.authorName}〔${c.source === 'emergent' ? '有感而發' : '應場'}〕`,
            ...(c.provenance ? [`*出處：${c.provenance.why}*`] : []),
            ...c.lines.map((l) => `　${l}`),
          ]),
        ]
      : []),
  ].join('\n');
}
