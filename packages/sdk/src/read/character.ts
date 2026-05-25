/**
 * Character view queries — Character / OwnerCap / ControlCap.
 */
import * as gen from '../generated/endless_story/character.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getCharacter = (client: SuiClient, characterId: string) =>
  gen.Character.get({ client, objectId: characterId });

export const getOwnerCap = (client: SuiClient, ownerCapId: string) =>
  gen.OwnerCap.get({ client, objectId: ownerCapId });

export const getControlCap = (client: SuiClient, controlCapId: string) =>
  gen.ControlCap.get({ client, objectId: controlCapId });

export const getManyCharacters = (client: SuiClient, characterIds: string[]) =>
  gen.Character.getMany({ client, objectIds: characterIds });
