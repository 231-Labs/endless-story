/**
 * Scene view queries — Scene + ScenePlacement.
 */
import * as gen from '../generated/endless_story/scene.js';
import type { SuiClient } from '../client.js';

export { gen as raw };

export const getScene = (client: SuiClient, sceneId: string) =>
  gen.Scene.get({ client, objectId: sceneId });

export const getManyScenes = (client: SuiClient, sceneIds: string[]) =>
  gen.Scene.getMany({ client, objectIds: sceneIds });
