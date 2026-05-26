/**
 * Director capability catalog.
 *
 * The Saga Director LLM is a **tool-user**: it never writes prose, only
 * picks capabilities + parameters from this catalog. Each capability
 * corresponds to a typed Move call + emits a chain event consumers can
 * react to.
 *
 * Design rationale: free-form LLM "directives" produced incoherent
 * chapters in the old runner (see audit). Forcing the director through
 * a JSON-schema'd vocabulary makes outputs deterministic, auditable,
 * and easy to evaluate. The catalog is small on purpose — 5 verbs is
 * enough to express "what should happen next in this saga" while
 * still constraining the LLM hard.
 *
 * The catalog is consumed by:
 *   - `services/saga-director/prompt.ts` — embedded as JSON-schema in
 *     the LLM system prompt for tool-use
 *   - `services/saga-director/dispatch.ts` — validates LLM output,
 *     then turns each capability into a Move call (via @endless-story/sdk)
 */

/** Discriminated union of valid director calls. */
export type DirectorCapability =
    | OpenStorylet
    | AttributePressure
    | CharacterCall
    | RelationshipSeed
    | AdvancePhase;

/** Activate a storylet template — the world's "what could happen" verbs. */
export interface OpenStorylet {
    kind: 'open_storylet';
    templateId: string;            // e.g. "confession_after_show"
    sceneId: string;               // Sui object id
    characterIds: string[];        // Sui object ids
    /** Optional weight overrides for the storylet's variant table. */
    weightOverrides?: Record<string, number>;
}

/** Nudge a scene's ambient parameters — affects heat/lighting/lantern. */
export interface AttributePressure {
    kind: 'attribute_pressure';
    sceneId: string;
    axis: 'atmosphere' | 'danger' | 'prosperity';
    /** Signed delta. Magnitude clamped to ±20 to keep changes plausible. */
    delta: number;
}

/** Soft invitation for a character to enter a scene. Not a command — the
 *  character POV worker decides whether to respond. */
export interface CharacterCall {
    kind: 'character_call';
    sceneId: string;
    characterId: string;
    /** Free-form reason, surfaced in character's perception context. */
    reason?: string;
}

/** Seed a relationship tension into scene context. The relationship
 *  module picks this up during the next sleep/reflection pass. */
export interface RelationshipSeed {
    kind: 'relationship_seed';
    sceneId: string;
    characterA: string;
    characterB: string;
    tone: 'romance' | 'tension' | 'rivalry' | 'wary' | 'estrangement' | 'mentorship';
}

/** Advance the saga to a new narrative phase. Used at arc boundaries. */
export interface AdvancePhase {
    kind: 'advance_phase';
    sagaId: string;
    nextPhase: string;
}

/**
 * JSON-schema for LLM tool-use. Mirrors the union above, kept in a
 * separate const so we can feed it directly to Anthropic/OpenAI tool
 * APIs without runtime conversion.
 */
export const DIRECTOR_TOOL_SCHEMAS = [
    {
        name: 'open_storylet',
        description:
            '啟動一個 storylet 模板。Storylet 是 scene 範圍內可閉合的小情節（如「戲散後的告白」「化妝間口角」）。傳入 templateId 跟 scene + 涉及的 character。',
        input_schema: {
            type: 'object',
            properties: {
                templateId: { type: 'string', description: 'Storylet 模板 id (見 storylet library)' },
                sceneId: { type: 'string', description: 'Sui object id of the target scene' },
                characterIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Character Sui object ids 參與這個 storylet',
                },
            },
            required: ['templateId', 'sceneId', 'characterIds'],
        },
    },
    {
        name: 'attribute_pressure',
        description:
            '微調 scene 氣場參數，會影響 heat / 燈籠 / 章回氛圍。axis 三選一，delta 範圍 -20~+20。',
        input_schema: {
            type: 'object',
            properties: {
                sceneId: { type: 'string' },
                axis: { type: 'string', enum: ['atmosphere', 'danger', 'prosperity'] },
                delta: { type: 'integer', minimum: -20, maximum: 20 },
            },
            required: ['sceneId', 'axis', 'delta'],
        },
    },
    {
        name: 'character_call',
        description: '邀請角色進入某 scene（軟提示，character 可不從）。用於把分散的角色聚到一個場景。',
        input_schema: {
            type: 'object',
            properties: {
                sceneId: { type: 'string' },
                characterId: { type: 'string' },
                reason: { type: 'string', description: '短句，character perception 會看見' },
            },
            required: ['sceneId', 'characterId'],
        },
    },
    {
        name: 'relationship_seed',
        description:
            '在 scene context 種下一段角色間張力。下次 sleep/reflection 會吸收這個 seed。',
        input_schema: {
            type: 'object',
            properties: {
                sceneId: { type: 'string' },
                characterA: { type: 'string' },
                characterB: { type: 'string' },
                tone: {
                    type: 'string',
                    enum: ['romance', 'tension', 'rivalry', 'wary', 'estrangement', 'mentorship'],
                },
            },
            required: ['sceneId', 'characterA', 'characterB', 'tone'],
        },
    },
    {
        name: 'advance_phase',
        description: '推進 saga 敘事階段（用於 arc 結尾）。慎用，不要每次都呼叫。',
        input_schema: {
            type: 'object',
            properties: {
                sagaId: { type: 'string' },
                nextPhase: { type: 'string', description: '短 slug，如 "act_2_tension"' },
            },
            required: ['sagaId', 'nextPhase'],
        },
    },
] as const;
