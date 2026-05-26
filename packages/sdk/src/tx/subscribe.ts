/**
 * Subscribe (subscribe.move) — subscribe / unsubscribe to a Character.
 */
import * as gen from '../generated/endless_story/subscribe.js';
import { pkg } from './_package.js';

export { gen as raw };

export const subscribe = (args: gen.SubscribeArguments) =>
    gen.subscribe({ package: pkg(), arguments: args });

export const unsubscribe = (args: gen.UnsubscribeArguments) =>
    gen.unsubscribe({ package: pkg(), arguments: args });
