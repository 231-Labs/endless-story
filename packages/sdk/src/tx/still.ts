/**
 * 劇照 Still (still.move) — collectible narrative moments with on-chain
 * edition tracking (one moment, many collectors; editions auto-increment in
 * the shared StillRegistry; 名場面 can be capped).
 *
 * Thin wrappers around `generated/endless_story/still.ts`; all entry points
 * are StorytellerCap-gated. The minted Still is transferred / Kiosk-placed by
 * the caller's PTB.
 */
import * as gen from '../generated/endless_story/still.js';
import { pkg } from './_package.js';

export { gen as raw };

/** Create + share the saga's StillRegistry (bootstrap, once per saga). */
export const createRegistry = (args: gen.CreateRegistryArguments) =>
    gen.createRegistry({ package: pkg(), arguments: args });

/** Cap a 名場面's editions (must not undercut already-minted count). */
export const setEditionLimit = (args: gen.SetEditionLimitArguments) =>
    gen.setEditionLimit({ package: pkg(), arguments: args });

/** Mint the next edition of a moment; returns the Still for transfer/Kiosk. */
export const mintStill = (args: gen.MintStillArguments) =>
    gen.mintStill({ package: pkg(), arguments: args });
