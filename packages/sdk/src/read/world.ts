/**
 * World view queries — World / Location / AdminCap.
 */
import * as gen from '../generated/endless_story/world.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getWorld = (client: SuiClient, worldId: string) =>
  gen.World.get({ client, objectId: worldId });

export const getLocation = (client: SuiClient, locationId: string) =>
  gen.Location.get({ client, objectId: locationId });

export const getAdminCap = (client: SuiClient, adminCapId: string) =>
  gen.AdminCap.get({ client, objectId: adminCapId });
