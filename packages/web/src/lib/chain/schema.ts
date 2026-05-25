/**
 * Default attribute schema for character rolls.
 *
 * Until Phase 3 wires live World reads, server-side rolling falls back to
 * this constant. `cli/scripts/bootstrap.ts` will seed the on-chain
 * `World.rules.attribute_definitions` with EXACTLY these axes — keep
 * them in sync.
 *
 * Keys match the off-chain `Recruitment.minAttributes` field
 * (see `packages/web/src/mocks/recruitments.ts`).
 */

import type { AttributeKey } from '@endless-story/llm/prompts';

export const DEFAULT_ATTRIBUTE_SCHEMA: AttributeKey[] = [
    { key: 'appearance', label: '外貌', min: 0, max: 100 },
    { key: 'constitution', label: '筋骨', min: 0, max: 100 },
    { key: 'acuity', label: '機敏', min: 0, max: 100 },
    { key: 'disposition', label: '心性', min: 0, max: 100 },
];
