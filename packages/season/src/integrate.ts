/**
 * INTEGRATE — fold one PrivateSceneMemory back into the character's evolving
 * state. This closes the loop: 記住什麼 → 人格／關係緩慢改變 → 下一次不同的行動.
 *
 * The one hard rule here is the gradual-drift clamp (config.maxStanceStep /
 * maxDispositionStep): no single scene may move a stance axis or a disposition by
 * more than a small step, no matter how strongly it was read. So personality
 * DRIFTS over a season; it never flips on one conversation. This is the mechanical
 * guarantee behind the evaluation criterion「人格能漸變，但不因一場對話突然翻轉」,
 * and it holds even when a real LLM proposes a wild delta — the clamp is applied
 * at THIS boundary, not trusted to the distiller.
 */

import type { CharacterState, LedgerSeed, PrivateSceneMemory, SeasonConfig, Stance } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import type { Ctx } from './ctx.ts';
import { nameOf } from './ctx.ts';

const clampMag = (x: number, cap: number): number => Math.max(-cap, Math.min(cap, x));
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function readOf(s: Stance, name: string): string {
  const ax: [number, string][] = [
    [s.suspicion, `我信不太過${name}`],
    [s.fear, `我有點怕${name}`],
    [s.debt, `我欠${name}的`],
    [s.trust, `${name}我還是信的`],
  ];
  ax.sort((a, b) => b[0] - a[0]);
  return ax[0][0] >= 0.45 ? ax[0][1] : s.read || `對${name}，我還說不清`;
}

function seedKey(s: LedgerSeed): string {
  return `${s.kind}:${s.toward ?? ''}:${s.text}`;
}

/**
 * Returns a NEW state with the memory folded in (the input is not mutated, so the
 * engine can re-run a scene with a memory ABLATED for the causal test in metrics).
 */
export function integrate(
  state: CharacterState,
  mem: PrivateSceneMemory,
  ctx: Ctx,
  config: SeasonConfig = DEFAULT_CONFIG,
): CharacterState {
  const next: CharacterState = structuredClone(state);

  // Layer 3 → stances (clamped step, clamped range).
  for (const u of mem.relationshipUpdates) {
    let s = next.stances.find((x) => x.withId === u.withId);
    if (!s) {
      s = { withId: u.withId, trust: 0, fear: 0, debt: 0, suspicion: 0, read: '', updatedScene: mem.sceneId };
      next.stances.push(s);
    }
    s.trust = clamp(s.trust + clampMag(u.dTrust, config.maxStanceStep), -1, 1);
    s.fear = clamp(s.fear + clampMag(u.dFear, config.maxStanceStep), 0, 1);
    s.debt = clamp(s.debt + clampMag(u.dDebt, config.maxStanceStep), 0, 1);
    s.suspicion = clamp(s.suspicion + clampMag(u.dSuspicion, config.maxStanceStep), 0, 1);
    s.read = readOf(s, nameOf(ctx, u.withId));
    s.updatedScene = mem.sceneId;
  }

  // Layer 5 → dispositions (reinforce matching text, else accrete a new one).
  for (const u of mem.dispositionUpdates) {
    const d = next.dispositions.find((x) => x.text === u.text);
    if (d) {
      d.strength = clamp(d.strength + clampMag(u.dStrength, config.maxDispositionStep), 0, 1);
      d.updatedScene = mem.sceneId;
    } else {
      next.dispositions.push({
        id: `d_${next.dispositions.length + 1}_${mem.sceneId}`,
        text: u.text,
        strength: clamp(clampMag(u.dStrength, config.maxDispositionStep), 0, 1),
        originScene: mem.sceneId,
        updatedScene: mem.sceneId,
      });
    }
  }

  // Ledger → open new items (dedup by kind+toward+text).
  const have = new Set(next.ledger.map((l) => `${l.kind}:${l.toward ?? ''}:${l.text}`));
  for (const seed of mem.ledgerSeeds) {
    if (have.has(seedKey(seed))) continue;
    have.add(seedKey(seed));
    next.ledger.push({
      id: `l_${next.ledger.length + 1}_${mem.sceneId}`,
      kind: seed.kind,
      text: seed.text,
      toward: seed.toward,
      openedScene: mem.sceneId,
      status: 'open',
    });
  }

  next.memories.push(mem);
  return next;
}
