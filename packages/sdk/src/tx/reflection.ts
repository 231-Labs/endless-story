/**
 * Reflection (reflection.move) — anchor character interior monologue.
 */
import * as gen from '../generated/endless_story/reflection.js';
import { pkg } from './_package.js';

export { gen as raw };

export const submit = (args: gen.SubmitArguments) =>
    gen.submit({ package: pkg(), arguments: args });
