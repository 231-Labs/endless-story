/**
 * Recruit view queries — fetch + decode GenesisVoucher / JoinIntent.
 *
 * Thin wrappers around `MoveStruct.get` from `generated/endless_story/recruit.ts`.
 */
import * as gen from '../generated/endless_story/recruit.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getGenesisVoucher = (client: SuiClient, voucherId: string) =>
  gen.GenesisVoucher.get({ client, objectId: voucherId });

export const getJoinIntent = (client: SuiClient, intentId: string) =>
  gen.JoinIntent.get({ client, objectId: intentId });
