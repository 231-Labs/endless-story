/**
 * The production state machine — one durable step per call (the harness loops;
 * the product would advance one step per narrative-day tick, gated on a day
 * boundary + treasury check). Each step is idempotent: if its artifact already
 * exists it is not re-produced, only the state advances.
 *
 *   PROPOSED → SCRIPTED → CAST → SCORED → VERSIFIED → REHEARSING → PREMIERED
 */

import type { Ask } from './llm.ts';
import type { Lifecycle, Production, TroupeMember } from './types.ts';
import { resolvePlay } from './repertoire.ts';
import { propose } from './roles/director.ts';
import { writeScript } from './roles/playwright.ts';
import { cast } from './roles/caster.ts';
import { composeAll } from './roles/composer.ts';
import { writeCi } from './roles/lyricist.ts';
import { rehearse } from './roles/ensemble.ts';

const NEXT: Record<Lifecycle, Lifecycle> = {
  PROPOSED: 'SCRIPTED',
  SCRIPTED: 'CAST',
  CAST: 'SCORED',
  SCORED: 'VERSIFIED',
  VERSIFIED: 'REHEARSING',
  REHEARSING: 'PREMIERED',
  PREMIERED: 'PREMIERED',
};

export function newProduction(
  sagaId: string,
  classicKey = 'baishe',
  opts: { skipScore?: boolean; auto?: boolean } = {},
): Production {
  const play = resolvePlay(classicKey);
  return {
    productionId: `prod_${play.key}`,
    sagaId,
    classicKey: play.key,
    skipScore: opts.skipScore,
    auto: opts.auto,
    state: 'PROPOSED',
    log: [],
  };
}

/** Advance one step. Returns the same object (mutated) for ergonomic looping. */
export async function advance(prod: Production, troupe: TroupeMember[], ask: Ask): Promise<Production> {
  const director = troupe.find((m) => m.id === 'banzhu') ?? troupe[0];

  switch (prod.state) {
    case 'PROPOSED':
      if (!prod.brief) prod.brief = await propose(troupe, director, ask, prod.classicKey);
      prod.log.push(`PROPOSED → 班主${prod.brief.directorName}提案《${prod.brief.title}》（${prod.brief.classicSource}·${prod.brief.qizhi}）`);
      break;
    case 'SCRIPTED':
      if (!prod.script) prod.script = await writeScript(prod.brief!, troupe, ask);
      prod.log.push(`SCRIPTED → 編劇${prod.script.authorName}成稿，共 ${prod.script.scenes.length} 場`);
      break;
    case 'CAST':
      if (!prod.cast) prod.cast = cast(prod.script!, troupe, resolvePlay(prod.brief!.classicKey).couple);
      prod.log.push(
        `CAST → 選角完成：` +
          prod.cast.map((c) => `${c.assignedName ?? '（缺）'}飾${c.partName}${c.crossCastLabel ? `[${c.crossCastLabel}]` : ''}`).join('、'),
      );
      break;
    case 'SCORED':
      if (!prod.scores) prod.scores = prod.skipScore ? [] : composeAll(prod.script!, troupe);
      prod.log.push(
        prod.skipScore
          ? 'SCORED → （略過音律：純排戲，不作曲不出譜）'
          : `SCORED → 琴師${prod.scores[0]?.composerName}譜成 ${prod.scores.length} 段（${prod.scores.map((s) => s.banshi).join(' / ')}）`,
      );
      break;
    case 'VERSIFIED':
      if (!prod.ci) prod.ci = await writeCi(prod.script!, prod.cast!, prod.scores!, troupe, ask, prod.auto);
      prod.log.push(
        `VERSIFIED → 詞 ${prod.ci.length} 首（` +
          prod.ci.map((c) => `${c.authorName}·${c.source === 'emergent' ? '有感而發' : '應場'}`).join('、') +
          `）`,
      );
      break;
    case 'REHEARSING': {
      if (!prod.takes || !prod.chapter) {
        const r = await rehearse(prod, prod.script!, prod.cast!, troupe, ask);
        prod.takes = r.takes;
        prod.chapter = r.chapter;
      }
      prod.log.push(`REHEARSING → 全體排演，${prod.takes.length} 段 POV 織成戲中戲章回`);
      break;
    }
    case 'PREMIERED':
      return prod;
  }

  prod.state = NEXT[prod.state];
  if (prod.state === 'PREMIERED') prod.log.push('PREMIERED → 首演（純驗證：到此產出齊備，上鏈為 gate-after）');
  return prod;
}

/** Run the whole machine to PREMIERED. */
export async function runToPremiere(
  prod: Production,
  troupe: TroupeMember[],
  ask: Ask,
  onStep?: (p: Production) => void,
): Promise<Production> {
  let guard = 0;
  while (prod.state !== 'PREMIERED' && guard++ < 12) {
    await advance(prod, troupe, ask);
    onStep?.(prod);
  }
  return prod;
}
