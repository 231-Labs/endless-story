/**
 * METRICS — the evaluation the design note asked for, made computable. Not "rate
 * the dialogue 1-5", but the structural questions that decide whether individualised
 * memory is actually doing work:
 *
 *   M1 同一事件是否形成彼此不一致的記憶            → divergence
 *   M2 幾輪後能否從匿名行動辨認是哪個角色          → re-identification
 *   M3 過去經驗是否真正改變後續選擇，而非只被台詞提及 → causal ablation
 *   M4 角色之間是否保留誤解與認知落差              → misunderstanding preserved
 *   M5 人格能漸變，但不因一場對話突然翻轉          → gradual drift
 *   M6 對話是否產生日後可兌現的承諾／怨懟／疑問／風險 → redeemable ledger
 *
 * Plus invariants the tests assert: no cross-character private-memory leakage, a
 * character never remembers a scene she was absent from, and the per-scene drift
 * clamp always holds.
 */

import type { CharacterState, SeasonResult, Stance, Valence } from './types.ts';
import { decideMove, type Move } from './enact.ts';
import { makeAsk } from './llm.ts';
import type { Ctx } from './ctx.ts';

const AXES: (keyof Pick<Stance, 'trust' | 'fear' | 'debt' | 'suspicion'>)[] = ['trust', 'fear', 'debt', 'suspicion'];

function ctxOf(result: SeasonResult): Ctx {
  return { names: result.names, ask: makeAsk({ mock: true }), config: result.config };
}

function memOfScene(state: CharacterState, sceneId: string) {
  return state.memories.find((m) => m.sceneId === sceneId);
}
function stanceVal(s: CharacterState, withId: string, axis: (typeof AXES)[number]): number {
  return s.stances.find((x) => x.withId === withId)?.[axis] ?? 0;
}

// ── M1 · divergence ───────────────────────────────────────────────────────
export interface Divergence {
  multiPresentScenes: number;
  scenesWithDistinctReadings: number;
  rate: number;
  /** the showcase: how the shared 夜訪／查問 affair is remembered by each. */
  affair: { charId: string; name: string; sceneId: string; valence: Valence; reading: string }[];
}
export function divergence(result: SeasonResult): Divergence {
  let multi = 0;
  let distinct = 0;
  for (const r of result.runs) {
    if (r.scene.present.length < 2) continue;
    multi++;
    const vals = r.memories.map((m) => m.interpretation.valence);
    if (new Set(vals).size >= 2) distinct++;
  }
  // Each character's private record of the night-visit affair (s2/s3/s4).
  const affairScenes = ['s2', 's3', 's4'];
  const affair: Divergence['affair'] = [];
  for (const c of result.cast) {
    const st = result.finalStates[c];
    for (const sid of affairScenes) {
      const m = memOfScene(st, sid);
      if (m) affair.push({ charId: c, name: result.names[c], sceneId: sid, valence: m.interpretation.valence, reading: m.interpretation.reading });
    }
  }
  return { multiPresentScenes: multi, scenesWithDistinctReadings: distinct, rate: multi ? distinct / multi : 0, affair };
}

// ── M2 · re-identification ─────────────────────────────────────────────────
export interface ReId {
  total: number;
  correct: number;
  accuracy: number;
  chance: number;
  guesses: { sceneId: string; author: string; move: Move; predicted: string[]; correct: boolean }[];
}
export function reIdentify(result: SeasonResult): ReId {
  const ctx = ctxOf(result);
  const guesses: ReId['guesses'] = [];
  for (const r of result.runs) {
    if (!r.enactments) continue;
    for (const e of r.enactments) {
      // For each candidate, would THIS persona (at her state before this scene) make this move?
      const predicted = result.cast.filter((c) => decideMove(r.castBefore[c], r.scene, ctx).move === e.move);
      const correct = predicted.length === 1 && predicted[0] === e.charId;
      guesses.push({ sceneId: r.scene.id, author: e.charId, move: e.move as Move, predicted, correct });
    }
  }
  const correct = guesses.filter((g) => g.correct).length;
  return { total: guesses.length, correct, accuracy: guesses.length ? correct / guesses.length : 0, chance: 1 / result.cast.length, guesses };
}

// ── M3 · causal ablation ────────────────────────────────────────────────────
export interface Causal {
  focus: string;
  sceneId: string;
  withPivotal?: { move: Move; because: string };
  withoutPivotal?: { move: Move; because: string };
  changed: boolean;
}
export function causalAblation(full: SeasonResult, ablated: SeasonResult, focus: string, sceneId: string): Causal {
  const find = (res: SeasonResult) => res.runs.find((r) => r.scene.id === sceneId)?.enactments?.find((e) => e.charId === focus);
  const a = find(full);
  const b = find(ablated);
  return {
    focus,
    sceneId,
    withPivotal: a ? { move: a.move as Move, because: a.because } : undefined,
    withoutPivotal: b ? { move: b.move as Move, because: b.because } : undefined,
    changed: !!a && !!b && a.move !== b.move,
  };
}

// ── M4 · misunderstanding preserved ─────────────────────────────────────────
export interface Misunderstanding {
  pivotalReadings: { name: string; valence: Valence }[];
  distinctAtPivot: boolean;
  /** 金鳳's certainty about 柳生春 never collapses back below the confront line. */
  gapPersists: boolean;
  /** 映雪 and 金鳳 hold opposite readings of 柳生春 at season end. */
  opposedStances: boolean;
}
export function misunderstanding(result: SeasonResult, pivotalId: string, day: number): Misunderstanding {
  const present = result.runs.find((r) => r.scene.id === pivotalId)?.scene.present ?? [];
  const pivotalReadings = present.map((c) => ({ name: result.names[c], valence: memOfScene(result.finalStates[c], pivotalId)?.interpretation.valence ?? ('neutral' as Valence) }));
  const distinctAtPivot = new Set(pivotalReadings.map((p) => p.valence)).size >= 2;

  // jin suspicion(liu) at every post-pivotal snapshot + final — never falls below 0.5.
  const postSnaps: number[] = [];
  for (const r of result.runs) if (r.scene.day > day) postSnaps.push(stanceVal(r.castBefore.jin, 'liu', 'suspicion'));
  postSnaps.push(stanceVal(result.finalStates.jin, 'liu', 'suspicion'));
  const gapPersists = postSnaps.length > 0 && Math.min(...postSnaps) >= 0.5;

  const suTrustLiu = stanceVal(result.finalStates.su, 'liu', 'trust');
  const jinSuspLiu = stanceVal(result.finalStates.jin, 'liu', 'suspicion');
  const opposedStances = suTrustLiu >= 0.5 && jinSuspLiu >= 0.5;

  return { pivotalReadings, distinctAtPivot, gapPersists, opposedStances };
}

// ── M5 · gradual drift ──────────────────────────────────────────────────────
export interface Drift {
  perSceneMaxStep: number;
  clampHolds: boolean;
  /** biggest total stance move over the season, and how many steps it took. */
  topDrift: { charId: string; withId: string; axis: string; total: number; steps: number };
  gradual: boolean;
}
export function drift(result: SeasonResult): Drift {
  const eps = 1e-6;
  let perSceneMax = 0;
  let top = { charId: '', withId: '', axis: '', total: 0, steps: 0 };

  for (const c of result.cast) {
    // ordered snapshots: before s1 (=seed), before s2, …, before sN, final.
    const snaps: CharacterState[] = result.runs.map((r) => r.castBefore[c]).concat([result.finalStates[c]]);
    // collect every (withId, axis) that ever appears.
    const pairs = new Set<string>();
    for (const s of snaps) for (const st of s.stances) for (const ax of AXES) pairs.add(`${st.withId}|${ax}`);
    for (const key of pairs) {
      const [withId, axis] = key.split('|') as [string, (typeof AXES)[number]];
      const series = snaps.map((s) => stanceVal(s, withId, axis));
      let steps = 0;
      for (let i = 1; i < series.length; i++) {
        const d = Math.abs(series[i] - series[i - 1]);
        if (d > eps) steps++;
        if (d > perSceneMax) perSceneMax = d;
      }
      const total = Math.abs(series[series.length - 1] - series[0]);
      if (total > top.total) top = { charId: c, withId, axis, total, steps };
    }
  }
  return {
    perSceneMaxStep: perSceneMax,
    clampHolds: perSceneMax <= result.config.maxStanceStep + eps,
    topDrift: top,
    gradual: top.total >= 0.25 && top.steps >= 2,
  };
}

// ── M6 · redeemable ledger ──────────────────────────────────────────────────
export interface Ledger {
  opened: number;
  redeemed: number;
  byKind: Record<string, number>;
  redemptions: { charId: string; name: string; kind: string; text: string; openedScene: string; redeemedScene: string }[];
}
export function ledger(result: SeasonResult): Ledger {
  let opened = 0;
  let redeemed = 0;
  const byKind: Record<string, number> = {};
  const redemptions: Ledger['redemptions'] = [];
  for (const c of result.cast) {
    for (const l of result.finalStates[c].ledger) {
      opened++;
      byKind[l.kind] = (byKind[l.kind] ?? 0) + 1;
      if (l.status === 'redeemed') {
        redeemed++;
        redemptions.push({ charId: c, name: result.names[c], kind: l.kind, text: l.text, openedScene: l.openedScene, redeemedScene: l.redeemedScene ?? '' });
      }
    }
  }
  return { opened, redeemed, byKind, redemptions };
}

// ── Invariants (asserted by tests) ─────────────────────────────────────────
export interface Invariants {
  noForeignMemory: boolean;
  noAbsentSceneMemory: boolean;
  driftClampHolds: boolean;
}
export function invariants(result: SeasonResult): Invariants {
  let noForeign = true;
  let noAbsent = true;
  const presentOf = new Map(result.runs.map((r) => [r.scene.id, new Set(r.scene.present)]));
  for (const c of result.cast) {
    for (const m of result.finalStates[c].memories) {
      if (m.charId !== c) noForeign = false;
      const present = presentOf.get(m.sceneId);
      if (present && !present.has(c)) noAbsent = false;
    }
  }
  return { noForeignMemory: noForeign, noAbsentSceneMemory: noAbsent, driftClampHolds: drift(result).clampHolds };
}

// ── The whole verdict (used by report + tests) ──────────────────────────────
export interface Check { id: string; pass: boolean; detail: string }
export interface Analysis {
  divergence: Divergence;
  reId: ReId;
  causal: Causal;
  misunderstanding: Misunderstanding;
  drift: Drift;
  ledger: Ledger;
  invariants: Invariants;
  checks: Check[];
  allPass: boolean;
}

export function analyze(full: SeasonResult, ablated: SeasonResult, opts: { pivotalId: string; pivotalDay: number; focus: string; probeSceneId: string }): Analysis {
  const dv = divergence(full);
  const ri = reIdentify(full);
  const ca = causalAblation(full, ablated, opts.focus, opts.probeSceneId);
  const mu = misunderstanding(full, opts.pivotalId, opts.pivotalDay);
  const df = drift(full);
  const lg = ledger(full);
  const inv = invariants(full);

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const checks: Check[] = [
    { id: 'M1 divergence (同一事件 → 不一致的記憶)', pass: dv.rate >= 0.6, detail: `distinct-reading scenes ${dv.scenesWithDistinctReadings}/${dv.multiPresentScenes} (${pct(dv.rate)})` },
    { id: 'M2 re-identification (匿名行動 → 認得出是誰)', pass: ri.accuracy >= 0.8 && ri.accuracy > ri.chance, detail: `${ri.correct}/${ri.total} = ${pct(ri.accuracy)} (chance ${pct(ri.chance)})` },
    { id: 'M3 causal (過去經驗真的改變後續選擇)', pass: ca.changed, detail: `${result_name(full, opts.focus)}@${opts.probeSceneId}: 有往事→${ca.withPivotal?.move} · 無往事→${ca.withoutPivotal?.move}` },
    { id: 'M4 misunderstanding preserved (保留認知落差)', pass: mu.distinctAtPivot && mu.gapPersists && mu.opposedStances, detail: `pivot readings ${mu.pivotalReadings.map((p) => `${p.name}=${p.valence}`).join('／')}｜gapPersists=${mu.gapPersists}｜opposed=${mu.opposedStances}` },
    { id: 'M5 gradual drift (漸變，非突然翻轉)', pass: df.clampHolds && df.gradual, detail: `maxStep ${df.perSceneMaxStep.toFixed(3)} ≤ cap ${full.config.maxStanceStep}｜topDrift ${result_name(full, df.topDrift.charId)}→${result_name(full, df.topDrift.withId)}.${df.topDrift.axis} 共 ${df.topDrift.total.toFixed(2)} / ${df.topDrift.steps} 步` },
    { id: 'M6 redeemable ledger (日後可兌現)', pass: lg.opened >= 3 && lg.redeemed >= 1, detail: `opened ${lg.opened}（${Object.entries(lg.byKind).map(([k, n]) => `${k}:${n}`).join(' ')}）· redeemed ${lg.redeemed}` },
    { id: 'INV no cross-character memory leak / no omniscience / clamp', pass: inv.noForeignMemory && inv.noAbsentSceneMemory && inv.driftClampHolds, detail: `foreign=${!inv.noForeignMemory} absent=${!inv.noAbsentSceneMemory} clamp=${inv.driftClampHolds}` },
  ];
  return { divergence: dv, reId: ri, causal: ca, misunderstanding: mu, drift: df, ledger: lg, invariants: inv, checks, allPass: checks.every((c) => c.pass) };
}

function result_name(result: SeasonResult, id: string): string {
  return result.names[id] ?? id;
}
