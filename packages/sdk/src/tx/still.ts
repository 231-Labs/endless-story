/**
 * 劇照 Still (still.move) — collectible narrative moments.
 *
 * Thin wrappers around `generated/endless_story/still.ts`. One entry function
 * (`mint_still`, StorytellerCap-gated); the returned Still is transferred /
 * Kiosk-placed by the caller's PTB.
 */
import * as gen from '../generated/endless_story/still.js';
import { pkg } from './_package.js';

export { gen as raw };

/** Mint a 劇照 from an event moment; returns the Still for transfer/Kiosk. */
export const mintStill = (args: gen.MintStillArguments) =>
    gen.mintStill({ package: pkg(), arguments: args });
