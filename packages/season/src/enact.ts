/**
 * ENACT — a present character ACTS from her accumulated state. This is the far end
 * of the loop: 下一次採取不同的行動. Three characters who lived through the same
 * scenes but distilled them differently now MOVE differently, and the move is
 * traceable to specific accumulated memory (drivenBy) — not merely name-dropped in
 * a line. That traceability is what lets metrics.ts test the causal claim
 * 「過去經驗是否真正改變後續選擇，而不只被台詞提及」via ablation.
 *
 * The deterministic policy IS the model of "memory → behaviour". The same policy is
 * reused by metrics.ts for re-identification: given an anonymised move and the three
 * personas' current states, whoever the policy predicts to make that move is the
 * guessed author — so divergence is what makes characters legible from their acts.
 */

import type { CharacterState, Enactment, Scene, Stance } from './types.ts';
import type { Ctx } from './ctx.ts';
import { nameOf } from './ctx.ts';
import { askJson } from './llm.ts';

export type Move = 'confront' | 'deflect' | 'withdraw' | 'reach' | 'observe';
export const MOVE_LABEL: Record<Move, string> = {
  confront: '逼問',
  deflect: '搪塞',
  withdraw: '避嫌',
  reach: '示好',
  observe: '按兵',
};

const dispMax = (state: CharacterState, keys: string[]): { text: string; strength: number } | null => {
  let best: { text: string; strength: number } | null = null;
  for (const d of state.dispositions) {
    if (keys.some((k) => d.text.includes(k)) && (!best || d.strength > best.strength)) best = { text: d.text, strength: d.strength };
  }
  return best;
};

function pickToward(state: CharacterState, present: string[]): string {
  const others = present.filter((id) => id !== state.id);
  let best = others[0] ?? '';
  let charge = -1;
  for (const id of others) {
    const s = state.stances.find((x) => x.withId === id);
    const c = s ? Math.abs(s.trust) + s.fear + s.suspicion + s.debt : 0;
    if (c > charge) { charge = c; best = id; }
  }
  return best;
}

const ZERO: Stance = { withId: '', trust: 0, fear: 0, debt: 0, suspicion: 0, read: '', updatedScene: '' };

/**
 * The policy. Exported so metrics.ts can re-run it for a re-identification guess.
 * Pure and deterministic: same state + scene → same move.
 */
export function decideMove(state: CharacterState, scene: Scene, ctx: Ctx): { move: Move; toward: string; drivenBy: string[] } {
  const toward = pickToward(state, scene.present);
  const s = state.stances.find((x) => x.withId === toward) ?? { ...ZERO, withId: toward };
  const drivenBy: string[] = [];

  // A character's DOMINANT accumulated disposition decides HOW she meets a charged
  // moment, and it preempts raw suspicion: 蘇映雪 avoids a scene (避嫌) even when she
  // suspects; 柳生春 dissolves it into care even when cornered; only 金鳳 — who has
  // no such brake — lets suspicion carry her into a confrontation. That ordering is
  // what makes the three legible from their acts (M2) AND what makes 金鳳's move a
  // clean function of her suspicion toward the person in front of her (M3).
  const deflect = dispMax(state, ['選擇', '明確', '攤牌', '照顧', '承諾']); // dissolve-into-care family
  const face = dispMax(state, ['避嫌', '顏面', '嫌疑']); // avoid-the-scene family
  const deflectStr = deflect?.strength ?? 0;
  const faceStr = face?.strength ?? 0;
  const openGrudge = state.ledger.find((l) => l.status === 'open' && (l.kind === 'grudge' || l.kind === 'question') && (!l.toward || l.toward === toward));

  let move: Move;
  if (faceStr >= 0.4 && faceStr >= deflectStr) {
    move = 'withdraw';
    drivenBy.push(`「${face!.text}」已長到 ${faceStr.toFixed(2)}`);
    if (s.suspicion >= 0.4) drivenBy.push(`縱有疑（${s.suspicion.toFixed(2)}）也先避嫌`);
  } else if (deflectStr >= 0.4) {
    move = 'deflect';
    drivenBy.push(`「${deflect!.text}」已長到 ${deflectStr.toFixed(2)}`);
  } else if (s.suspicion >= 0.5) {
    move = 'confront';
    drivenBy.push(`對${nameOf(ctx, toward)}的懷疑累到 ${s.suspicion.toFixed(2)}`);
    if (openGrudge) drivenBy.push(`未了的${openGrudge.kind === 'grudge' ? '怨懟' : '疑問'}：${openGrudge.text}`);
  } else if (s.trust >= 0.5 || s.debt >= 0.5) {
    move = 'reach';
    if (s.debt >= 0.5) drivenBy.push(`欠${nameOf(ctx, toward)}的 ${s.debt.toFixed(2)}`);
    if (s.trust >= 0.5) drivenBy.push(`還信得過${nameOf(ctx, toward)}（${s.trust.toFixed(2)}）`);
  } else {
    move = 'observe';
    drivenBy.push(`對${nameOf(ctx, toward)}的懷疑還不足以發作（${s.suspicion.toFixed(2)}）`);
  }
  return { move, toward, drivenBy };
}

const LINE: Record<Move, (o: string) => string> = {
  confront: (o) => `${o}，你給我一句實話——那晚的事。`,
  deflect: () => `這事……改日再與你細說，你先歇著，嗓子要緊。`,
  withdraw: () => `我先告退了，省得又叫人多心。`,
  reach: (o) => `${o}，方才是我不是，你別往心裡去。`,
  observe: () => `（不語，只斜過眼去）`,
};

const MOVE_TAGS: Record<Move, { act: string; tone: string }> = {
  confront: { act: '查問', tone: 'sharp' },
  deflect: { act: '照顧', tone: 'flat' },
  withdraw: { act: '迴避', tone: 'guarded' },
  reach: { act: '示好', tone: 'warm' },
  observe: { act: '沉默', tone: 'flat' },
};

export function enactMock(state: CharacterState, scene: Scene, ctx: Ctx): Enactment {
  const { move, toward, drivenBy } = decideMove(state, scene, ctx);
  return {
    charId: state.id,
    sceneId: scene.id,
    move,
    toward,
    line: LINE[move](nameOf(ctx, toward)),
    because: `${MOVE_LABEL[move]}——${drivenBy[0] ?? ''}`,
    drivenBy,
  };
}

/** The transcript line an enactment contributes to the shared scene. */
export function enactmentToLine(e: Enactment, scene: Scene, idx: number) {
  const tags = MOVE_TAGS[e.move as Move] ?? MOVE_TAGS.observe;
  return {
    ref: `${scene.id}.e${idx + 1}`,
    who: e.charId,
    text: e.line,
    tags: { topic: scene.topic, act: tags.act, tone: tags.tone },
  };
}

interface LlmMove { move: Move; line: string; because: string }
const MOVES: Move[] = ['confront', 'deflect', 'withdraw', 'reach', 'observe'];
function isLlmMove(v: unknown): v is LlmMove {
  return !!v && typeof v === 'object' && MOVES.includes((v as LlmMove).move) && typeof (v as LlmMove).line === 'string';
}

/** Real-LLM enactor — the move is CHOSEN by the deterministic policy (so behaviour
 *  stays a legible function of accumulated memory), but the LINE is written in voice. */
export async function enact(state: CharacterState, scene: Scene, ctx: Ctx): Promise<Enactment> {
  const { move, toward, drivenBy } = decideMove(state, scene, ctx);
  if (ctx.ask.mock) return enactMock(state, scene, ctx);

  const dispo = state.dispositions.filter((d) => d.strength >= 0.3).map((d) => `- ${d.text}（${d.strength.toFixed(2)}）`).join('\n') || '（無突出傾向）';
  const req = {
    system:
      `你是「${state.persona.name}」（${state.persona.role}）。聲口：${state.persona.voice}。\n` +
      `此刻你已決定：${MOVE_LABEL[move]}（${move}）對象是${nameOf(ctx, toward)}。理由（你心底的話）：${drivenBy.join('；')}。\n` +
      `寫出你這一刻「說出口的一句」（≤40字，合你的聲口與此刻的城府）與「藏在心裡的一句」。\n` +
      `只輸出 JSON：{"move":"${move}","line":"說出口的","because":"藏在心裡的"}。只輸出 JSON。`,
    user: `情境：${scene.situation ?? scene.title}（${scene.setting}）。在場：${scene.present.map((id) => nameOf(ctx, id)).join('、')}。`,
    maxTokens: 300,
    temperature: 0.85,
    kind: 'cheap' as const,
  };
  const got = await askJson<LlmMove>(ctx.ask, req, () => ({ move, line: LINE[move](nameOf(ctx, toward)), because: drivenBy[0] ?? '' }), isLlmMove);
  return { charId: state.id, sceneId: scene.id, move, toward, line: got.line, because: got.because, drivenBy };
}
