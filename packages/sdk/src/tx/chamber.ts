/**
 * Chamber (chamber.move) — PersonalVault + saga chamber PTB builders.
 *
 * Thin wrappers around `generated/endless_story/chamber.ts`; auto-inject
 * the deployed packageId. Use `raw.*` for advanced / multi-return cases.
 */
import * as gen from '../generated/endless_story/chamber.js';
import type { Transaction } from '@mysten/sui/transactions';
import { pkg } from './_package.js';

export { gen as raw };

/** Self-service vault: Kiosk + PersonalVault. Returns (KioskOwnerCap, VaultTicket). */
export const createPersonalVault = (args?: { initialLayoutBlobId?: string | null }) =>
  gen.createPersonalVault({
    package: pkg(),
    arguments: { initialLayoutBlobId: args?.initialLayoutBlobId ?? null },
  });

/** Anchor a Walrus layout blob on an existing PersonalVault. */
export const saveLayout = (args: { vault: string; blobId: string }) =>
  gen.saveLayout({ package: pkg(), arguments: args });

/** Saga-gated: enable a Scene as a decorated chamber owned by a character. */
export const enableChamber = (args: gen.EnableChamberArguments) =>
  gen.enableChamber({ package: pkg(), arguments: args });

/** Character owner re-arranges an enabled chamber's object layout. */
export const decorate = (args: gen.DecorateArguments) =>
  gen.decorate({ package: pkg(), arguments: args });
