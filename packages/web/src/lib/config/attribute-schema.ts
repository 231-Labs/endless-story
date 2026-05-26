/**
 * Default attribute schema for character rolls.
 *
 * Neutral location (web-internal `lib/config/`, not `lib/chain/`) so both
 * client components (e.g. RecruitmentTicket wizard) and server actions
 * (preview-character) can import without the client crossing the facade
 * boundary.
 *
 * Until `lib/chain/world-read` exposes the live `World.rules.attribute_definitions`
 * read, this constant is the source of truth. `cli/scripts/bootstrap.ts`
 * seeds the on-chain schema with EXACTLY these axes — keep them in
 * sync until chain-reader fallback wiring lands.
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
