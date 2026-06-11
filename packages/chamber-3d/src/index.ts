export { ChamberCanvas } from './ChamberCanvas.js';
export type { ChamberCanvasProps } from './ChamberCanvas.js';
export { SceneRenderer } from './SceneRenderer.js';
export { deterministicDesign } from './scene-design.js';
export type {
  SceneDesign,
  SceneElement,
  ElementKind,
  BackdropStyle,
  FloorType,
  TableItem,
} from './scene-design.js';
export { ChamberDiorama } from './ChamberDiorama.js';
export { ChamberLights } from './ChamberLights.js';
export { CharacterStandee } from './CharacterStandee.js';
export {
  paletteForEnv,
  deriveEnvironment,
  deriveRoomDims,
  type EnvPalette,
} from './environment.js';
export {
  ORIGIN_MM,
  PLACEMENT_KIND,
  mmToMeters,
  placementToTransform,
} from './types.js';
export type {
  ChamberPlacement,
  PlacementKind,
  PlacementTransform,
  ChamberParams,
  ChamberAvatar,
  ChamberLayout,
  ChamberEnvironment,
  RoomDims,
  TimeOfDay,
  Season,
  Weather,
} from './types.js';
