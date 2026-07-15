/**
 * The season loop — the minimal research unit made runnable:
 *
 *   一次交談  →  多份私人記憶  →  一段時間後的差異化行動
 *   one scene →  N private memories →  differentiated action
 *
 * Per scene, for every present character (each reasoning ONLY from her own prior
 * state — never from another character's private memory, which the invariants test
 * enforces):
 *   1. (enacted scenes) ENACT   — she acts from accumulated state → the transcript
 *   2. PERCEIVE                  — persona-shaped attention over the shared transcript
 *   3. DISTILL                   — her five-layer private memory of the scene
 *   4. INTEGRATE                 — fold it back, clamped, into her evolving state
 *   5. redeem any ledger item she just acted on
 */

import type { CharacterState, Persona, Scene, SceneRun, SeasonConfig, SeasonResult } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import type { Ctx } from './ctx.ts';
import { mapPool, type Ask } from './llm.ts';
import { perceive } from './perceive.ts';
import { distill } from './distill.ts';
import { integrate } from './integrate.ts';
import { enact, enactmentToLine } from './enact.ts';

const CONCURRENCY = 2;

export function seedState(p: Persona): CharacterState {
  return {
    id: p.id,
    persona: p,
    dispositions: p.seedDispositions.map((d) => ({ ...d })),
    stances: p.seedStances.map((s) => ({ ...s })),
    ledger: [],
    memories: [],
  };
}

function snapshotAll(states: Record<string, CharacterState>): Record<string, CharacterState> {
  const out: Record<string, CharacterState> = {};
  for (const [id, s] of Object.entries(states)) out[id] = structuredClone(s);
  return out;
}

export async function runSeason(
  personas: Persona[],
  scenes: Scene[],
  ask: Ask,
  config: SeasonConfig = DEFAULT_CONFIG,
): Promise<SeasonResult> {
  const names: Record<string, string> = {};
  for (const p of personas) names[p.id] = p.name;
  const ctx: Ctx = { names, ask, config };

  const states: Record<string, CharacterState> = {};
  for (const p of personas) states[p.id] = seedState(p);
  const seeds = snapshotAll(states);

  const runs: SceneRun[] = [];

  for (const raw of scenes) {
    const castBefore = snapshotAll(states);
    let scene = raw;

    // 1. ENACT (enacted scenes) — every present character acts from her PRE-scene
    //    state, simultaneously (nobody reacts to a line produced this same tick),
    //    then those acts become the shared transcript everyone then perceives.
    let enactments;
    if (scene.kind === 'enacted') {
      enactments = await mapPool(scene.present, CONCURRENCY, (id) => enact(states[id], scene, ctx));
      scene = { ...scene, transcript: enactments.map((e, i) => enactmentToLine(e, scene, i)) };
    }

    // 2. PERCEIVE + 3. DISTILL — per present character, from her pre-scene state.
    const perceptions = await mapPool(scene.present, CONCURRENCY, (id) => perceive(states[id], scene, ctx));
    const memories = await mapPool(scene.present, CONCURRENCY, (id, i) => distill(states[id], scene, perceptions[i], ctx));

    // 4. INTEGRATE — fold each character's memory back into her own state (clamped).
    scene.present.forEach((id, i) => {
      states[id] = integrate(states[id], memories[i], ctx, config);
    });

    // 5. Redeem ledger items the enacted move actually paid off — she finally DID
    //    the thing the old memory had been pushing her toward (怨懟 → 逼問, 承諾 → 示好).
    if (enactments) {
      for (const e of enactments) {
        const kinds = e.move === 'confront' ? ['grudge', 'question'] : e.move === 'reach' ? ['promise'] : [];
        if (!kinds.length) continue;
        const item = states[e.charId].ledger.find(
          (l) => l.status === 'open' && kinds.includes(l.kind) && (!l.toward || l.toward === e.toward),
        );
        if (item) { item.status = 'redeemed'; item.redeemedScene = scene.id; }
      }
    }

    runs.push({ scene, perceptions, memories, enactments, castBefore });
  }

  return { cast: personas.map((p) => p.id), names, config, seeds, finalStates: states, runs };
}
