import type { DayPart, ScenePrivacyLevel } from '@endless-story/shared';

export interface ScenePosition {
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
}

export const SCENE_POSITIONS: Record<string, ScenePosition> = {
  // theater zone
  scene_main_stage: { x: 50, y: 25 },
  scene_music_shed: { x: 30, y: 35 },
  scene_backstage: { x: 70, y: 35 },
  scene_trunk_room: { x: 75, y: 48 },
  // courtyard zone
  scene_east_hall: { x: 25, y: 65 },
  scene_courtyard: { x: 50, y: 72 },
  scene_bunk_room: { x: 75, y: 65 },
  scene_accounting: { x: 68, y: 82 },
};

export const PRIVACY_LABEL: Record<ScenePrivacyLevel, string> = {
  0: '公開',
  1: '工作場',
  2: '半私密',
  3: '幽僻',
  4: '夜宿共寢',
  5: '獨處私房',
};

export const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: '朝',
  noon: '午',
  dusk: '暮',
  night: '夜',
};

export const DAY_PART_TINT: Record<DayPart, string> = {
  morning: 'linear-gradient(180deg, rgba(255,235,200,0.15), transparent 70%)',
  noon: 'linear-gradient(180deg, rgba(255,250,235,0.1), transparent 70%)',
  dusk: 'linear-gradient(180deg, rgba(230,130,90,0.18), transparent 80%)',
  night: 'linear-gradient(180deg, rgba(40,30,60,0.25), transparent 80%)',
};

export const WORLD_TIME_MOOD: Record<
  DayPart,
  {
    vignette: string;
    rim: string;
    grainOpacity: number;
  }
> = {
  morning: {
    vignette:
      'radial-gradient(ellipse 120% 90% at 50% -10%, rgba(255,238,210,0.22), transparent 52%)',
    rim: 'linear-gradient(180deg, rgba(176,74,60,0.06), transparent 35%, rgba(176,74,60,0.04))',
    grainOpacity: 0.035,
  },
  noon: {
    vignette:
      'radial-gradient(ellipse 100% 80% at 50% -5%, rgba(255,253,235,0.14), transparent 50%)',
    rim: 'linear-gradient(180deg, rgba(90,106,94,0.05), transparent 40%)',
    grainOpacity: 0.022,
  },
  dusk: {
    vignette:
      'radial-gradient(ellipse 110% 100% at 80% 20%, rgba(230,140,90,0.18), transparent 55%), radial-gradient(circle at 10% 80%, rgba(176,74,60,0.12), transparent 45%)',
    rim: 'linear-gradient(165deg, rgba(224,184,108,0.12), transparent 45%, rgba(40,34,26,0.15))',
    grainOpacity: 0.045,
  },
  night: {
    vignette:
      'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(45,38,82,0.35), transparent 58%), radial-gradient(circle at 85% 90%, rgba(176,74,60,0.08), transparent 40%)',
    rim: 'linear-gradient(205deg, rgba(30,24,42,0.45), transparent 42%, rgba(224,184,108,0.06))',
    grainOpacity: 0.055,
  },
};
