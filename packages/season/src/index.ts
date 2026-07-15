/**
 * @endless-story/season — a chain-decoupled harness that tests the real thesis:
 * not "can a character remember a conversation", but "how one shared experience
 * leaves a DIFFERENT change in each character, and how that difference produces
 * observable, differentiated future behaviour."
 *
 * One objective Scene → N five-layer private memories → bounded persona drift →
 * differentiated action. No chain, no Walrus, no MemWal — porting the five layers
 * onto the live memory kinds is a gate-after step (see WRITEUP.md §"Port path"),
 * exactly as packages/economy is to the live economy.
 */

export * from './types.ts';
export { makeAsk, askOr, askJson, mapPool, type Ask, type AskRequest } from './llm.ts';
export { type Ctx, nameOf } from './ctx.ts';
export { perceive, perceiveMock } from './perceive.ts';
export { distill, distillMock } from './distill.ts';
export { integrate } from './integrate.ts';
export { enact, enactMock, decideMove, enactmentToLine, MOVE_LABEL, type Move } from './enact.ts';
export { runSeason, seedState } from './engine.ts';
export {
  analyze,
  divergence,
  reIdentify,
  causalAblation,
  misunderstanding,
  drift,
  ledger,
  invariants,
  type Analysis,
  type Check,
} from './metrics.ts';
export { chunxueCast, liu, su, jin } from '../fixtures/chunxue.ts';
export { season, seasonWithoutPivotal, PIVOTAL_SCENE_ID } from '../fixtures/season.ts';
