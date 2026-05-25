/**
 * Saga view queries — Saga / StorytellerCap.
 */
import * as gen from '../generated/endless_story/saga.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getSaga = (client: SuiClient, sagaId: string) =>
  gen.Saga.get({ client, objectId: sagaId });

export const getStorytellerCap = (client: SuiClient, capId: string) =>
  gen.StorytellerCap.get({ client, objectId: capId });
