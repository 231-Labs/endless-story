/**
 * Dream (dream.move) — owner-paid memory injection PTB wrappers.
 */
import * as gen from '../generated/endless_story/dream.js';
import { pkg } from './_package.js';

export { gen as raw };

export const createConfig = (args: gen.CreateConfigArguments) =>
    gen.createConfig({ package: pkg(), arguments: args });

export const setDreamPrice = (args: gen.SetDreamPriceArguments) =>
    gen.setDreamPrice({ package: pkg(), arguments: args });

export const setPaused = (args: gen.SetPausedArguments) =>
    gen.setPaused({ package: pkg(), arguments: args });

export const submitDream = (args: gen.SubmitDreamArguments) =>
    gen.submitDream({ package: pkg(), arguments: args });
