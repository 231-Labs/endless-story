/**
 * 導演 selects 行當-granular casting (CAST → SCORED). Deterministic.
 *
 * Two passes: (0) RESERVE owner overrides first — a part pinned to a specific
 * member is locked in BEFORE auto-casting runs, so the emotional/fit pass can't
 * poach a 欽點 actor for an earlier part. (1) auto-cast the rest by craft fit
 * (fitScore) with an emotional nudge — if two members carry a strong off-stage
 * bond and the play has a stage-couple, lean into casting them opposite each
 * other. Cross-casting (乾旦/坤生) is reported as prestige, not an error.
 */

import type { CastAssignment, Script, TroupeMember } from '../types.ts';
import { assign, fitScore } from '../hangdang.ts';

/**
 * @param couple    the play's stage-couple partIds (from the repertoire)
 * @param overrides partId → member.id pins (owner/班主 欽點); unpinned parts auto-cast.
 */
export function cast(
  script: Script,
  troupe: TroupeMember[],
  couple: [string, string],
  overrides: Record<string, string> = {},
): CastAssignment[] {
  const taken = new Set<string>();
  const result: CastAssignment[] = [];

  // Detect the strongest off-stage bond among the troupe (drives couple casting).
  let bond: { a: string; b: string; intensity: number } | null = null;
  for (const m of troupe) {
    for (const r of m.relationships) {
      if (!bond || r.intensity > bond.intensity) bond = { a: m.id, b: r.withId, intensity: r.intensity };
    }
  }

  // (0) PASS 1 — reserve owner overrides up front (regardless of part order) so
  // the auto pass below can never grab a 欽點 actor for someone else's part.
  const pinned = new Map<string, TroupeMember>();
  for (const part of script.parts) {
    const id = overrides[part.partId];
    if (!id) continue;
    const m = troupe.find((x) => x.id === id && !taken.has(x.id));
    if (m) {
      pinned.set(part.partId, m);
      taken.add(m.id);
    }
  }

  // (1) PASS 2 — fill each part: pinned actor if 欽點, else best fit + couple nudge.
  for (const part of script.parts) {
    let chosen: TroupeMember | null = pinned.get(part.partId) ?? null;
    let note: string | undefined = chosen ? '指定選角（欽點）。' : undefined;

    // alternates (and the auto pick) come from everyone not yet taken.
    const ranked = troupe
      .filter((m) => !taken.has(m.id))
      .map((m) => ({ m, score: fitScore(m, part) }))
      .sort((x, y) => y.score - x.score);

    if (!chosen) {
      chosen = ranked[0]?.m ?? null;
      // Emotional casting: if this part is half of the stage couple and the
      // bonded pair fits, prefer the bonded member so台上夫妻 mirrors台下情.
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
    }

    const alternates = ranked.filter((r) => r.m.id !== chosen?.id).slice(0, 2).map((r) => r.m);
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
