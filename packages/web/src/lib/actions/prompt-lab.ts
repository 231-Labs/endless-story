'use server';

import { createTextClient, type ChatMessage, type ChatResponse } from '@endless-story/llm/text';
import { PROMPT_REGISTRY } from '@/lib/prompt-lab/registry';
import {
    getPromptLabCall,
    type PromptLabCallId,
    type PromptLabExecutionMode,
} from '@/lib/prompt-lab/catalog';

export interface PromptLabActionInput {
    callId: PromptLabCallId;
    inputJson: string;
    mode: PromptLabExecutionMode;
    model?: string;
    temperature?: number;
}

export interface PromptLabPromptView {
    system?: string;
    messages: ChatMessage[];
    maxTokens: number;
    temperature?: number;
    kind: 'cheap' | 'primary' | 'deterministic';
}

export interface PromptLabActionResult {
    ok: boolean;
    callId: PromptLabCallId;
    phase: string;
    title: string;
    input?: unknown;
    prompt?: PromptLabPromptView;
    provider?: ChatResponse['provider'];
    model?: string;
    usage?: ChatResponse['usage'];
    rawOutput?: string;
    parsedOutput?: unknown;
    parserNote?: string;
    error?: string;
}

interface BuiltPrompt {
    prompt: PromptLabPromptView;
    parseOutput: (raw: string) => { parsed: unknown; note?: string };
}

export async function runPromptLabAction(
    request: PromptLabActionInput,
): Promise<PromptLabActionResult> {
    const call = getPromptLabCall(request.callId);
    let input: unknown;
    try {
        input = JSON.parse(request.inputJson);
    } catch (err) {
        return {
            ok: false,
            callId: call.id,
            phase: call.phase,
            title: call.title,
            error: `fixture JSON 格式錯誤：${err instanceof Error ? err.message : String(err)}`,
        };
    }

    let built: BuiltPrompt;
    try {
        built = buildPrompt(call.id, call.kind, input, request.temperature ?? call.defaultTemperature);
    } catch (err) {
        return {
            ok: false,
            callId: call.id,
            phase: call.phase,
            title: call.title,
            input,
            error: err instanceof Error ? err.message : String(err),
        };
    }

    if (request.mode === 'inspect' || built.prompt.kind === 'deterministic') {
        return {
            ok: true,
            callId: call.id,
            phase: call.phase,
            title: call.title,
            input,
            prompt: built.prompt,
            parsedOutput:
                built.prompt.kind === 'deterministic' ? built.parseOutput('').parsed : undefined,
        };
    }

    let client;
    try {
        client = createTextClient({ kind: built.prompt.kind });
    } catch (err) {
        return {
            ok: false,
            callId: call.id,
            phase: call.phase,
            title: call.title,
            input,
            prompt: built.prompt,
            error: err instanceof Error ? err.message : String(err),
        };
    }

    try {
        const response = await client.chat({
            model: request.model?.trim() || undefined,
            system: built.prompt.system,
            messages: built.prompt.messages,
            maxTokens: built.prompt.maxTokens,
            temperature: built.prompt.temperature,
        });
        const parsed = built.parseOutput(response.text);
        return {
            ok: true,
            callId: call.id,
            phase: call.phase,
            title: call.title,
            input,
            prompt: built.prompt,
            provider: response.provider,
            model: response.model,
            usage: response.usage,
            rawOutput: response.text,
            parsedOutput: parsed.parsed,
            parserNote: parsed.note,
        };
    } catch (err) {
        return {
            ok: false,
            callId: call.id,
            phase: call.phase,
            title: call.title,
            input,
            prompt: built.prompt,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

// Look the call's build/parse up in the registry, pair it with the catalog's kind +
// temperature. (Replaces the former per-call switch; behavior now lives in prompt-lab/registry.)
function buildPrompt(
    callId: PromptLabCallId,
    kind: PromptLabPromptView['kind'],
    input: unknown,
    temperature?: number,
): BuiltPrompt {
    const behavior = PROMPT_REGISTRY[callId];
    const result = behavior.build(input);
    return {
        prompt: {
            system: result.system,
            messages: result.messages,
            maxTokens: result.maxTokens,
            temperature,
            kind,
        },
        parseOutput: (raw) => behavior.parse(raw, input),
    };
}

