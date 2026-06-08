// The prompt registry — the single source for every prompt the lab exposes.
//
// Each entry bundles metadata + builder + parser + a default fixture, replacing the
// parallel catalog metadata (catalog.ts) and the buildPrompt switch (prompt-lab.ts).
// It lives in web because this is the only layer that can compose llm + runner builders
// together with web config (e.g. DEFAULT_ATTRIBUTE_SCHEMA); see docs/PROMPTS.md.
//
// Migration WIP: persona.distill is the proof slice. The remaining calls still run
// through prompt-lab.ts's switch + catalog.ts until each is moved here; then the switch
// collapses to a registry lookup and catalog.ts derives from this map.

import {
  buildPersonaPrompt,
  parsePersonaResponse,
  type PromptDefinition,
  type BuildPersonaPromptOptions,
  type DistilledPersona,
} from '@endless-story/llm/prompts';
import type { PromptLabCallId } from './catalog';

const personaDef: PromptDefinition<BuildPersonaPromptOptions, DistilledPersona | null> = {
  meta: {
    id: 'persona.distill',
    phase: 'CHARACTER',
    title: '本色蒸餾',
    shortTitle: 'Persona',
    kind: 'primary',
    summary: '把角色公開設定蒸成「卸妝後」的軸 / 腔 / 界（本色卡）。mint 時 first_run 生成，上 Walrus + commitment。',
    outputShape: '{"axes":["…"],"mannerisms":["…"],"boundaries":["…"]}',
    defaultTemperature: 0.85,
    existingTool: {
      label: '角色頁 本色',
      href: '/dossier',
      note: 'mint 時 redeemVoucher.after() 生成並 anchor；Lab 用 fixture 測蒸餾品質。',
    },
  },
  defaultInput: {
    name: '柳生春',
    role: '小生',
    gender: 'female',
    ageYears: 22,
    physicalFacts: '廿二歲，短髮束於腦後，眉如墨畫，肩線清瘦；右耳後一痣。',
    description:
      '外地來的女小生，台上英氣，台下怕冷，總把一枚舊銅錢縫在袖口；嘴上不肯服輸，卻不願說自己為何離開舊班。',
  },
  build: buildPersonaPrompt,
  parse: (raw) => ({ parsed: parsePersonaResponse(raw) }),
};

// Partial during migration; becomes the full Record<PromptLabCallId, ...> once every
// call is moved off the switch.
export const PROMPT_REGISTRY: Partial<Record<PromptLabCallId, PromptDefinition<unknown, unknown>>> = {
  'persona.distill': personaDef as PromptDefinition<unknown, unknown>,
};
