/**
 * Saga Director — prompt builder.
 *
 * Strategy: JSON-mode prompting (LLM emits a JSON array of capability
 * calls). Tool-use API would be cleaner but requires extending the llm
 * package; JSON-mode is good enough for v1 and the catalog itself is
 * embedded into the system prompt as a schema reference.
 */

import { DIRECTOR_TOOL_SCHEMAS } from '../../types/capabilities.js';

export interface SagaSnapshot {
    sagaId: string;
    sagaName: string;
    departurePolicy?: string;
    /** Active scene ids with names — director needs these to target. */
    scenes: Array<{ id: string; name: string }>;
    /** Cast ids with names — director needs these to call/seed. */
    characters: Array<{ id: string; name: string }>;
}

export function buildSystemPrompt(): string {
    return [
        '你是一位戲班的「導演 / saga director」。',
        '你的工作：把使用者（班主）對戲班的意圖，翻譯成一組結構化的 capability call。',
        '',
        '**鐵則**：',
        '1. 你**不寫對白、不寫劇情**。你只挑 capability + 參數。',
        '2. 你輸出**純 JSON**，結構為：',
        '   { "rationale": "<簡短內心理由 30 字內>", "capabilities": [ ... ] }',
        '   capabilities 陣列每個元素是 { "name": "<capability>", "input": <對應 schema 的物件> }。',
        '3. capability 只能從下方目錄選。所有 id（saga / scene / character）必須使用實際提供的值，不要編造。',
        '4. 每次回應**至少 1 個、至多 5 個** capability。寧少勿濫。',
        '',
        '## Capability 目錄（JSON schema）',
        '```json',
        JSON.stringify(DIRECTOR_TOOL_SCHEMAS, null, 2),
        '```',
    ].join('\n');
}

export function buildUserPrompt(snapshot: SagaSnapshot, intent: string): string {
    const sceneList = snapshot.scenes
        .map((s) => `  - ${s.id} · ${s.name}`)
        .join('\n');
    const charList = snapshot.characters
        .map((c) => `  - ${c.id} · ${c.name}`)
        .join('\n');
    return [
        `# Saga`,
        `- id: ${snapshot.sagaId}`,
        `- 名字: ${snapshot.sagaName}`,
        snapshot.departurePolicy ? `- 離職政策: ${snapshot.departurePolicy}` : '',
        '',
        `# Scenes (可指派的場景)`,
        sceneList || '  (無)',
        '',
        `# Characters (戲班角色，可呼叫 / seed)`,
        charList || '  (無)',
        '',
        `# 班主意圖`,
        intent,
        '',
        '請輸出 JSON。',
    ]
        .filter(Boolean)
        .join('\n');
}
