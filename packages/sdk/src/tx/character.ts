/**
 * Character (character.move) — mint paths, lifecycle, skills, image, seal.
 *
 * Thin wrappers around `generated/endless_story/character.ts`. Constructor
 * helpers (`new*`) are exposed because mint paths chain them inline.
 *
 * Pure getter functions (e.g. `characterId`, `tagLabel`) are NOT re-exposed
 * here — use `read/character.ts` to decode struct fields directly, or reach
 * for `raw.*` if you need them in-PTB.
 */
import * as gen from '../generated/endless_story/character.js';
import { pkg } from './_package.js';

export { gen as raw };

// ── Mint paths ──────────────────────────────────────────────────────────
export const mintGenesisCharacter = (args: gen.MintGenesisCharacterArguments) =>
  gen.mintGenesisCharacter({ package: pkg(), arguments: args });

export const mintCollectibleCharacter = (args: gen.MintCollectibleCharacterArguments) =>
  gen.mintCollectibleCharacter({ package: pkg(), arguments: args });

// ── ControlCap lifecycle ───────────────────────────────────────────────
export const issueControlCap = (args: gen.IssueControlCapArguments) =>
  gen.issueControlCap({ package: pkg(), arguments: args });

export const revokeAllControl = (args: gen.RevokeAllControlArguments) =>
  gen.revokeAllControl({ package: pkg(), arguments: args });

export const reassignSaga = (args: gen.ReassignSagaArguments) =>
  gen.reassignSaga({ package: pkg(), arguments: args });

// ── Movement / wild-release / walk ─────────────────────────────────────
export const moveCharacter = (args: gen.MoveCharacterArguments) =>
  gen.moveCharacter({ package: pkg(), arguments: args });

export const releaseCharacterToWild = (args: gen.ReleaseCharacterToWildArguments) =>
  gen.releaseCharacterToWild({ package: pkg(), arguments: args });

export const forceReleaseCharacter = (args: gen.ForceReleaseCharacterArguments) =>
  gen.forceReleaseCharacter({ package: pkg(), arguments: args });

export const walkInWorld = (args: gen.WalkInWorldArguments) =>
  gen.walkInWorld({ package: pkg(), arguments: args });

// ── Skills (Phase 1.5c) ────────────────────────────────────────────────
export const setCharacterSkill = (args: gen.SetCharacterSkillArguments) =>
  gen.setCharacterSkill({ package: pkg(), arguments: args });

export const clearCharacterSkill = (args: gen.ClearCharacterSkillArguments) =>
  gen.clearCharacterSkill({ package: pkg(), arguments: args });

// ── Image update (dual path) ───────────────────────────────────────────
export const updateProfileDescriptionByStoryteller = (
  args: gen.UpdateProfileDescriptionByStorytellerArguments,
) => gen.updateProfileDescriptionByStoryteller({ package: pkg(), arguments: args });

export const updateImageByStoryteller = (args: gen.UpdateImageByStorytellerArguments) =>
  gen.updateImageByStoryteller({ package: pkg(), arguments: args });

export const updateImageByOwner = (args: gen.UpdateImageByOwnerArguments) =>
  gen.updateImageByOwner({ package: pkg(), arguments: args });

// Gallery (append variants + owner cover selection).
export const addMediaAssetByStoryteller = (args: gen.AddMediaAssetByStorytellerArguments) =>
  gen.addMediaAssetByStoryteller({ package: pkg(), arguments: args });

export const addMediaAssetByOwner = (args: gen.AddMediaAssetByOwnerArguments) =>
  gen.addMediaAssetByOwner({ package: pkg(), arguments: args });

export const setCoverFromMedia = (args: gen.SetCoverFromMediaArguments) =>
  gen.setCoverFromMedia({ package: pkg(), arguments: args });

// ── Seal access policy ─────────────────────────────────────────────────
export const sealApproveControl = (args: gen.SealApproveControlArguments) =>
  gen.sealApproveControl({ package: pkg(), arguments: args });

export const sealApproveOwner = (args: gen.SealApproveOwnerArguments) =>
  gen.sealApproveOwner({ package: pkg(), arguments: args });

// ── Value constructors (used inline within mint PTBs) ──────────────────
export const newAttributeValue = (args: gen.NewAttributeValueArguments) =>
  gen.newAttributeValue({ package: pkg(), arguments: args });

export const newPhysicalFacts = (args: gen.NewPhysicalFactsArguments) =>
  gen.newPhysicalFacts({ package: pkg(), arguments: args });

export const newCharacterProfile = (args: gen.NewCharacterProfileArguments) =>
  gen.newCharacterProfile({ package: pkg(), arguments: args });

export const newMediaAsset = (args: gen.NewMediaAssetArguments) =>
  gen.newMediaAsset({ package: pkg(), arguments: args });

export const newTag = (args: gen.NewTagArguments) =>
  gen.newTag({ package: pkg(), arguments: args });

export const newDeathRecord = (args: gen.NewDeathRecordArguments) =>
  gen.newDeathRecord({ package: pkg(), arguments: args });
