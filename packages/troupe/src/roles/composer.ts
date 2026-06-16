/** 琴師 — composes a score per scene (SCORED → VERSIFIED). Deterministic music. */

import type { Score, Script, TroupeMember } from '../types.ts';
import { compose } from '../music.ts';
import { bestFor, skill, CRAFT } from '../skills.ts';

export function composeAll(script: Script, troupe: TroupeMember[]): Score[] {
  const composer =
    bestFor(troupe, CRAFT.作曲, 50) ??
    [...troupe].sort((a, b) => skill(b, CRAFT.唱腔) - skill(a, CRAFT.唱腔))[0];
  const composerSkill = Math.max(skill(composer, CRAFT.作曲), skill(composer, CRAFT.唱腔));

  return script.scenes.map((sc) =>
    compose({
      sceneId: sc.sceneId,
      sceneTitle: sc.title,
      mood: sc.mood,
      composerId: composer.id,
      composerName: composer.name,
      composerSkill,
    }),
  );
}
