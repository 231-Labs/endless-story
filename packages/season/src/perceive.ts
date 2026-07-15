/**
 * PERCEIVE — attention + reading, the step that runs BEFORE distillation.
 *
 * The load-bearing claim of the whole harness (and of the suggestion that seeded
 * it): personality is not something that appears only after memory is distilled.
 * The prior persona already decides
 *   • 她注意到哪句話            → which lines she attends to
 *   • 她把那句話理解為什麼      → the valence she reads into them
 *   • 事後反覆想的是哪一瞬間    → the moment she replays
 * The SAME objective transcript therefore lands differently on each character.
 *
 * Deterministic (mock) path: score each line against the character's salience
 * priors + accumulated dispositions/stances. Real-LLM path: hand the persona +
 * accumulated state + raw transcript to the model and let attention emerge.
 */

import type { CharacterState, Perception, Scene, Valence } from './types.ts';
import type { Ctx } from './ctx.ts';
import { nameOf } from './ctx.ts';
import { askJson } from './llm.ts';

// Fallback tag → valence maps (used when a persona has no explicit reads[] override).
const ACT_VALENCE: Record<string, Valence> = {
  查問: 'testing',
  試探: 'testing',
  安撫: 'reassuring',
  迴避: 'evasive',
  沉默: 'evasive',
  停頓: 'evasive',
  許諾: 'tender',
  照顧: 'tender',
  示好: 'tender',
  冷落: 'perfunctory',
  揭穿: 'humiliating',
  逼問: 'threatening',
};

const TONE_VALENCE: Record<string, Valence> = {
  stiff: 'testing',
  warm: 'tender',
  cold: 'perfunctory',
  sharp: 'threatening',
  tender: 'tender',
  guarded: 'evasive',
  flat: 'neutral',
};

/** A persona-specific tie-break: which readings this character reaches for first. */
function valencePriority(state: CharacterState): Valence[] {
  // Derive from the persona's own reads[] — the valences she is primed to assign,
  // most-primed first, then a stable global order so ties are deterministic.
  const primed = Object.values(state.persona.primed.reads);
  const seen = new Set<Valence>();
  const order: Valence[] = [];
  for (const v of primed) if (!seen.has(v)) { seen.add(v); order.push(v); }
  for (const v of ['humiliating', 'threatening', 'testing', 'evasive', 'perfunctory', 'tender', 'reassuring', 'neutral'] as Valence[]) {
    if (!seen.has(v)) { seen.add(v); order.push(v); }
  }
  return order;
}

interface Scored {
  ref: string;
  why: string;
  valence: Valence;
  weight: number;
}

/** Read a single line through THIS character's priors. Returns null if it slips past her. */
function scoreLine(
  state: CharacterState,
  line: Scene['transcript'][number],
  ctx: Ctx,
): Scored | null {
  const { primed } = state.persona;
  const tags = line.tags ?? {};
  const cand = [tags.topic, tags.act, tags.tone].filter((t): t is string => !!t);

  let weight = 0;
  const reasons: string[] = [];
  let valence: Valence | undefined;

  // (a) salience priors — the tags she snaps to.
  for (const t of cand) {
    if (primed.attendsTo.includes(t)) {
      weight += tags.topic === t ? 2 : tags.act === t ? 1.6 : 1;
      reasons.push(`留意「${t}」`);
      if (primed.reads[t] && valence === undefined) valence = primed.reads[t];
    }
  }

  // (b) a strong-feeling relationship makes anything the other says/does register.
  if (line.who !== 'stage' && line.who !== state.id) {
    const s = state.stances.find((x) => x.withId === line.who);
    if (s) {
      const charge = Math.abs(s.trust) + s.fear + s.suspicion + s.debt;
      if (charge >= 0.6) {
        weight += 1;
        reasons.push(`這關乎${nameOf(ctx, line.who)}`);
      }
    }
  }

  // (c) an accumulated disposition keyed to this line's topic keeps pulling her back.
  for (const d of state.dispositions) {
    if (d.strength >= 0.4 && cand.some((t) => d.text.includes(t))) {
      weight += 0.8 * d.strength;
      reasons.push(`觸動「${d.text}」`);
    }
  }

  if (weight < 1) return null;

  // Resolve the reading: explicit persona override → act map → tone map → neutral.
  if (valence === undefined) valence = tags.act ? ACT_VALENCE[tags.act] : undefined;
  if (valence === undefined) valence = tags.tone ? TONE_VALENCE[tags.tone] : undefined;
  if (valence === undefined) valence = 'neutral';

  return { ref: line.ref, why: reasons.join('、') || '入眼', valence, weight };
}

/** Deterministic perceiver — same transcript, persona-shaped attention. */
export function perceiveMock(state: CharacterState, scene: Scene, ctx: Ctx): Perception {
  const scored = scene.transcript
    .map((l) => scoreLine(state, l, ctx))
    .filter((s): s is Scored => s !== null)
    // strongest first; stable tiebreak by transcript order (ref).
    .sort((a, b) => b.weight - a.weight || a.ref.localeCompare(b.ref))
    .slice(0, 3);

  if (scored.length === 0) {
    // Nothing snagged her — a shallow, neutral trace (she was there, barely touched).
    return {
      charId: state.id,
      sceneId: scene.id,
      attended: [],
      reading: { valence: 'neutral', confidence: 0.2 },
    };
  }

  // Overall reading = the valence carrying the most attended weight; persona priority
  // breaks ties (an anxious reader reaches for 威脅 before 中性, etc.).
  const byValence = new Map<Valence, number>();
  for (const s of scored) byValence.set(s.valence, (byValence.get(s.valence) ?? 0) + s.weight);
  const priority = valencePriority(state);
  let best: Valence = scored[0].valence;
  let bestScore = -1;
  for (const [v, w] of byValence) {
    const better = w > bestScore + 1e-9 || (Math.abs(w - bestScore) <= 1e-9 && priority.indexOf(v) < priority.indexOf(best));
    if (better) { best = v; bestScore = w; }
  }
  const total = scored.reduce((n, s) => n + s.weight, 0);
  const confidence = Math.min(1, 0.4 + bestScore / (total + 1));

  return {
    charId: state.id,
    sceneId: scene.id,
    attended: scored.map((s) => ({ ref: s.ref, why: s.why, valence: s.valence, weight: Number(s.weight.toFixed(2)) })),
    reading: { valence: best, confidence: Number(confidence.toFixed(2)) },
  };
}

const VALENCES: Valence[] = ['tender', 'perfunctory', 'testing', 'humiliating', 'threatening', 'reassuring', 'evasive', 'neutral'];

function isPerception(v: unknown): v is Perception {
  if (!v || typeof v !== 'object') return false;
  const p = v as Perception;
  return Array.isArray(p.attended) && !!p.reading && VALENCES.includes(p.reading.valence);
}

/** Real-LLM perceiver — attention emerges from persona + state, not from the tags. */
export async function perceive(state: CharacterState, scene: Scene, ctx: Ctx): Promise<Perception> {
  const fallback = () => perceiveMock(state, scene, ctx);
  if (ctx.ask.mock) return fallback();

  const transcript = scene.transcript.map((l) => `[${l.ref}] ${l.who === 'stage' ? '（科介）' : nameOf(ctx, l.who) + '：'}${l.text}`).join('\n');
  const dispo = state.dispositions.map((d) => `- ${d.text}（強度 ${d.strength.toFixed(2)}）`).join('\n') || '（暫無）';
  const stances = state.stances.map((s) => `- 對${nameOf(ctx, s.withId)}：信任 ${s.trust.toFixed(2)}、畏懼 ${s.fear.toFixed(2)}、虧欠 ${s.debt.toFixed(2)}、懷疑 ${s.suspicion.toFixed(2)}（${s.read}）`).join('\n') || '（暫無）';

  const req = {
    system:
      `你在模擬「${state.persona.name}」（${state.persona.role}）此刻的注意力。聲口：${state.persona.voice}。性情：${state.persona.temperament}。\n` +
      `人在戲劇裡不是中立的錄音機——她的性格與關係，先決定了她「聽見哪句、把它讀成什麼」。\n` +
      `只輸出 JSON：{"attended":[{"ref":"…","why":"她為何盯住這句","valence":"tender|perfunctory|testing|humiliating|threatening|reassuring|evasive|neutral"}],"reading":{"valence":"…","confidence":0..1}}\n` +
      `attended 至多 3 句，挑真正刺到她的；reading 是她對整場的定調。只輸出 JSON。`,
    user:
      `她既有的行為傾向：\n${dispo}\n\n她對在場者的私自看法：\n${stances}\n\n【場景】${scene.title}（${scene.setting}）\n${transcript}`,
    maxTokens: 700,
    temperature: 0.7,
    kind: 'cheap' as const,
  };
  const raw = await askJson<Perception>(ctx.ask, req, fallback, isPerception);
  // normalise ids the harness relies on.
  return { ...raw, charId: state.id, sceneId: scene.id, attended: (raw.attended ?? []).slice(0, 3) };
}
