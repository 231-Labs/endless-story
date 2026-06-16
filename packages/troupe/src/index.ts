/**
 * @endless-story/troupe — a chain-decoupled harness that proves a 戲班 can
 * autonomously WRITE, CAST, SCORE, VERSIFY and PERFORM a new 舊戲新唱, producing
 * real, usable artifacts (script / cast table / playable score + MIDI / 詞 /
 * 戲中戲 章回). No chain, no Walrus, no Move — that wiring is gate-after, the
 * way packages/economy is to the live economy.
 */

export * from './types.ts';
export { makeAsk, askOr, type Ask, type AskRequest } from './llm.ts';
export { springSnow } from './fixtures/spring-snow.ts';
export { REPERTOIRE, resolvePlay, type Repertoire, type SceneSpec } from './repertoire.ts';
export { newProduction, advance, runToPremiere } from './pipeline.ts';
export { induct } from './genesis.ts';
export { makeMemwalSource, type MemorySource } from './memwal-source.ts';
export { derivedSkills } from './derive-skills.ts';
export { assembleXiZhe } from './xizhe.ts';
export { compose, scoreToMidi } from './music.ts';
export { CRAFT, skill, canCraft, bestFor, qualityBand, movedToCreate } from './skills.ts';
export { crossCastLabel, fitScore, castingFromRole, HANGDANG_LABEL } from './hangdang.ts';
export { chooseProduction } from './roles/director.ts';
