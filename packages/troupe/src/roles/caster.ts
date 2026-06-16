/**
 * 導演 selects 行當-granular casting (CAST → SCORED). Deterministic.
 *
 * Two layers: (1) craft fit (fitScore), then (2) an emotional nudge — if two
 * members carry a strong off-stage bond and the play has a stage-couple, the
 * director leans into casting them opposite each other (the 坤生 + 花旦 that the
 * whole production is built around). Cross-casting is reported as prestige.
 */

import type { CastAssignment, Script, TroupeMember } from '../types.ts';
import { assign, fitScore } from '../hangdang.ts';

/** `couple` = the play's stage-couple partIds (from the repertoire), drives emotional casting. */
export function cast(script: Script, troupe: TroupeMember[], couple: [string, string]): CastAssignment[] {
  const taken = new Set<string>();
  const result: CastAssignment[] = [];

  // Detect the strongest off-stage bond among the troupe (drives couple casting).
  let bond: { a: string; b: string; intensity: number } | null = null;
  for (const m of troupe) {
    for (const r of m.relationships) {
      if (!bond || r.intensity > bond.intensity) bond = { a: m.id, b: r.withId, intensity: r.intensity };
    }
  }

  for (const part of script.parts) {
    const ranked = troupe
      .filter((m) => !taken.has(m.id))
      .map((m) => ({ m, score: fitScore(m, part) }))
      .sort((x, y) => y.score - x.score);

    let chosen = ranked[0]?.m ?? null;
    let note: string | undefined;

    // Emotional casting: if this part is half of the stage couple and the bonded
    // pair fits, prefer the bonded member so台上夫妻 mirrors台下情.
    if (bond && bond.intensity >= 75 && couple.includes(part.partId)) {
      const other = couple[0] === part.partId ? couple[1] : couple[0];
      const otherAssigned = result.find((c) => c.partId === other);
      const bonded = troupe.find(
        (m) => !taken.has(m.id) && (m.id === bond!.a || m.id === bond!.b) && fitScore(m, part) >= 60,
      );
      if (bonded) {
        chosen = bonded;
        if (otherAssigned && (otherAssigned.assignedId === bond.a || otherAssigned.assignedId === bond.b)) {
          note = '情緒選角：與對手演員台下亦有深緣，台上夫妻照見台下情。';
        }
      }
    }

    const alternates = ranked.slice(1, 3).map((r) => r.m);
    const a = assign(part, chosen, alternates);
    if (note) a.note = note;
    if (a.crossCastLabel) {
      a.note = `${a.note ? a.note + ' ' : ''}${a.crossCastLabel}：${a.assignedName}（${a.actorGender === 'female' ? '坤伶' : '乾伶'}）反串${part.partName}（${part.roleGender === 'male' ? '男' : '女'}角），是看點不是錯誤。`;
    }
    if (chosen) taken.add(chosen.id);
    result.push(a);
  }

  return result;
}
