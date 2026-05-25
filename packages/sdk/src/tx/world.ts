/**
 * World (world.move) — create World, locations, ticks, + value constructors.
 *
 * Thin wrappers around `generated/endless_story/world.ts`. Constructor
 * helpers (`new*`) are exposed because Saga / Scene creation chains them
 * inline within the same PTB.
 */
import * as gen from '../generated/endless_story/world.js';
import { pkg } from './_package.js';

export { gen as raw };

// ── World lifecycle ─────────────────────────────────────────────────────
export const createWorld = (args: gen.CreateWorldArguments) =>
  gen.createWorld({ package: pkg(), arguments: args });

export const createLocation = (args: gen.CreateLocationArguments) =>
  gen.createLocation({ package: pkg(), arguments: args });

export const advanceTick = (args: gen.AdvanceTickArguments) =>
  gen.advanceTick({ package: pkg(), arguments: args });

export const setTimeConfig = (args: gen.SetTimeConfigArguments) =>
  gen.setTimeConfig({ package: pkg(), arguments: args });

// ── Value constructors (used inline within PTBs) ─────────────────────────
export const newWorldInfo = (args: gen.NewWorldInfoArguments) =>
  gen.newWorldInfo({ package: pkg(), arguments: args });

export const newCurrencyDisplay = (args: gen.NewCurrencyDisplayArguments) =>
  gen.newCurrencyDisplay({ package: pkg(), arguments: args });

export const newWorldRules = (args: gen.NewWorldRulesArguments) =>
  gen.newWorldRules({ package: pkg(), arguments: args });

export const newLocationInfo = (args: gen.NewLocationInfoArguments) =>
  gen.newLocationInfo({ package: pkg(), arguments: args });

export const newPosition = (args: gen.NewPositionArguments) =>
  gen.newPosition({ package: pkg(), arguments: args });

export const newLocationGraph = (args: gen.NewLocationGraphArguments) =>
  gen.newLocationGraph({ package: pkg(), arguments: args });

export const newAttributeDefinition = (args: gen.NewAttributeDefinitionArguments) =>
  gen.newAttributeDefinition({ package: pkg(), arguments: args });
