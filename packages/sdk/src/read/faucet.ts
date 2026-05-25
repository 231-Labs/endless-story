/**
 * Faucet view queries — Faucet + FaucetAdminCap.
 */
import * as gen from '../generated/endless_story/faucet.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getFaucet = (client: SuiClient, faucetId: string) =>
  gen.Faucet.get({ client, objectId: faucetId });

export const getFaucetAdminCap = (client: SuiClient, capId: string) =>
  gen.FaucetAdminCap.get({ client, objectId: capId });
