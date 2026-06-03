'use server';

import { createTextClient, type ChatMessage, type ChatResponse } from '@endless-story/llm/text';
import {
    buildCharacterGenPrompt,
    buildModerationPrompt,
    buildPersonaPrompt,
    buildPortraitCurationPrompt,
    parsePersonaResponse,
    parseCharacterCandidate,
    parseModerationResult,
    parsePortraitPrompt,
    type AttributeKey,
    type BuildPromptResult,
    type RolledAttribute,
} from '@endless-story/llm/prompts';
import {
    characterAgent,
    characterWorker,
    director,
    dream,
    gazette,
    genesisMemory,
    reflection,
} from '@endless-story/runner';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '@/lib/config/attribute-schema';
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
        built = buildPrompt(call.id, input, request.temperature ?? call.defaultTemperature);
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
                built.prompt.kind === 'deterministic'
                    ? {
                          note: 'DRAMA is deterministic. Inspect tick-loop drama output and the dramaHint injected into ACT / POV prompts.',
                      }
                    : undefined,
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

function buildPrompt(
    callId: PromptLabCallId,
    input: unknown,
    temperature?: number,
): BuiltPrompt {
    const obj = asRecord(input);
    switch (callId) {
        case 'recruit.moderation': {
            const prompt = fromBuildPromptResult(
                buildModerationPrompt({
                    userPrompt: stringField(obj, 'userPrompt'),
                    rulesText: optionalStringField(obj, 'rulesText'),
                }),
                'cheap',
                temperature,
            );
            return {
                prompt,
                parseOutput: (raw) => ({ parsed: parseModerationResult(raw), note: 'moderation parser' }),
            };
        }
        case 'recruit.character': {
            const rolledValues = rolledValuesFrom(obj.rolledValues);
            const prompt = fromBuildPromptResult(
                buildCharacterGenPrompt({
                    userPrompt: stringField(obj, 'userPrompt'),
                    recruitmentIntent: optionalStringField(obj, 'recruitmentIntent'),
                    castNames: stringArrayField(obj, 'castNames'),
                    storyTags: stringArrayField(obj, 'storyTags'),
                    schemaKeys: DEFAULT_ATTRIBUTE_SCHEMA,
                    rolledValues,
                }),
                'primary',
                temperature,
            );
            return {
                prompt,
                parseOutput: (raw) => ({
                    parsed: parseCharacterCandidate(raw, rolledValues),
                    note: 'character candidate parser; server-locked attributes are reattached after parse',
                }),
            };
        }
        case 'recruit.portraitCuration': {
            const prompt = fromBuildPromptResult(
                buildPortraitCurationPrompt(
                    typed<Parameters<typeof buildPortraitCurationPrompt>[0]>(asRecord(obj.character)),
                    {
                        toneHint: stringField(obj, 'toneHint'),
                        recruitmentIntent: optionalStringField(obj, 'recruitmentIntent'),
                    },
                ),
                'cheap',
                temperature,
            );
            return {
                prompt,
                parseOutput: (raw) => ({
                    parsed: { prompt: parsePortraitPrompt(raw), chars: parsePortraitPrompt(raw).length },
                    note: 'portrait output is the image prompt',
                }),
            };
        }
        case 'director.intent': {
            const prompt = fromSystemUser(
                director.buildDirectorSystemPrompt(),
                director.buildDirectorUserPrompt(
                    typed<Parameters<typeof director.buildDirectorUserPrompt>[0]>(asRecord(obj.snapshot)),
                    stringField(obj, 'intent'),
                ),
                1500,
                'primary',
                temperature,
            );
            return jsonPrompt(prompt, 'director JSON response');
        }
        case 'tick.plan': {
            const prompt = fromSystemUser(
                characterAgent.buildPlanSystemPrompt(),
                characterAgent.buildPlanUserPrompt(typed<Parameters<typeof characterAgent.buildPlanUserPrompt>[0]>(obj)),
                400,
                'cheap',
                temperature,
            );
            return jsonPrompt(prompt, 'plan JSON response');
        }
        case 'tick.move': {
            const prompt = fromSystemUser(
                characterAgent.buildMoveSystemPrompt(),
                characterAgent.buildMoveUserPrompt(typed<Parameters<typeof characterAgent.buildMoveUserPrompt>[0]>(obj)),
                200,
                'cheap',
                temperature,
            );
            return jsonPrompt(prompt, 'move JSON response; runtime clamps invalid scene ids to stay-put');
        }
        case 'tick.drama': {
            return {
                prompt: {
                    messages: [],
                    maxTokens: 0,
                    kind: 'deterministic',
                },
                parseOutput: () => ({
                    parsed: {
                        note: 'DRAMA has no LLM prompt. It derives scarce-resource tension and injects dramaHint downstream.',
                    },
                }),
            };
        }
        case 'tick.social': {
            const prompt = fromSystemUser(
                characterAgent.buildSocialSystemPrompt(),
                characterAgent.buildSocialUserPrompt(typed<Parameters<typeof characterAgent.buildSocialUserPrompt>[0]>(obj)),
                360,
                'cheap',
                temperature,
            );
            return jsonPrompt(prompt, 'social JSON response; runtime sanitizes unsupported shared past / heavy motifs');
        }
        case 'tick.act': {
            const prompt = fromSystemUser(
                characterAgent.buildActSystemPrompt(),
                characterAgent.buildActUserPrompt(typed<Parameters<typeof characterAgent.buildActUserPrompt>[0]>(obj)),
                400,
                'cheap',
                temperature,
            );
            return jsonPrompt(prompt, 'act JSON response; runtime clamps catalogIndex to hand');
        }
        case 'tick.pov': {
            const prompt = fromSystemUser(
                characterWorker.buildPovSystemPrompt(),
                characterWorker.buildPovUserPrompt(typed<Parameters<typeof characterWorker.buildPovUserPrompt>[0]>(obj)),
                1800,
                'primary',
                temperature,
            );
            return prosePrompt(prompt, 'POV prose stats');
        }
        case 'tick.povRevision': {
            const motifs = stringArrayField(obj, 'motifs') ?? [];
            const prompt = fromSystemUser(
                characterWorker.buildRevisionSystemPrompt(),
                characterWorker.buildRevisionUserPrompt(stringField(obj, 'chapter'), motifs),
                1800,
                'primary',
                temperature,
            );
            return prosePrompt(prompt, 'revision prose stats');
        }
        case 'tick.sleepConsolidate': {
            const prompt = fromSystemUser(
                reflection.buildConsolidateSystemPrompt(),
                reflection.buildConsolidateUserPrompt(typed<Parameters<typeof reflection.buildConsolidateUserPrompt>[0]>(obj)),
                500,
                'primary',
                temperature,
            );
            return arrayPrompt(prompt, 'sleep consolidation JSON array');
        }
        case 'tick.gazette': {
            const prompt = fromSystemUser(
                gazette.buildGazetteSystemPrompt(),
                gazette.buildGazetteUserPrompt(typed<Parameters<typeof gazette.buildGazetteUserPrompt>[0]>(obj)),
                1500,
                'cheap',
                temperature,
            );
            return prosePrompt(prompt, 'gazette markdown stats');
        }
        case 'memory.genesis': {
            const prompt = fromSystemUser(
                genesisMemory.buildGenesisSystemPrompt(),
                genesisMemory.buildGenesisUserPrompt(typed<Parameters<typeof genesisMemory.buildGenesisUserPrompt>[0]>(obj)),
                3200,
                'primary',
                temperature,
            );
            return jsonPrompt(prompt, 'genesis memory JSON response');
        }
        case 'dream.moderator': {
            const prompt = fromSystemUser(
                dream.buildDreamModeratorSystemPrompt(),
                dream.buildDreamModeratorUserPrompt(typed<Parameters<typeof dream.buildDreamModeratorUserPrompt>[0]>(obj)),
                800,
                'cheap',
                temperature,
            );
            return jsonPrompt(prompt, 'dream moderator JSON response');
        }
        case 'reflection.character': {
            const prompt = fromSystemUser(
                reflection.buildReflectionSystemPrompt(),
                reflection.buildReflectionUserPrompt(typed<Parameters<typeof reflection.buildReflectionUserPrompt>[0]>(obj)),
                1500,
                'primary',
                temperature,
            );
            return prosePrompt(prompt, 'reflection prose stats');
        }
        case 'persona.distill': {
            const prompt = fromBuildPromptResult(
                buildPersonaPrompt(typed<Parameters<typeof buildPersonaPrompt>[0]>(obj)),
                'primary',
                temperature,
            );
            return {
                prompt,
                parseOutput: (raw) => ({ parsed: parsePersonaResponse(raw), note: 'persona 軸/腔/界 parser' }),
            };
        }
        default:
            return assertNever(callId);
    }
}

function fromBuildPromptResult(
    result: BuildPromptResult,
    kind: 'cheap' | 'primary',
    temperature?: number,
): PromptLabPromptView {
    return {
        system: result.system,
        messages: result.messages,
        maxTokens: result.maxTokens,
        temperature,
        kind,
    };
}

function fromSystemUser(
    system: string,
    user: string,
    maxTokens: number,
    kind: 'cheap' | 'primary',
    temperature?: number,
): PromptLabPromptView {
    return {
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens,
        temperature,
        kind,
    };
}

function jsonPrompt(prompt: PromptLabPromptView, note: string): BuiltPrompt {
    return {
        prompt,
        parseOutput: (raw) => {
            const parsed = parseJsonObject(raw);
            return { parsed: parsed ?? { parseFailed: true }, note };
        },
    };
}

function arrayPrompt(prompt: PromptLabPromptView, note: string): BuiltPrompt {
    return {
        prompt,
        parseOutput: (raw) => {
            const parsed = parseJsonArray(raw);
            return { parsed: parsed ?? { parseFailed: true }, note };
        },
    };
}

function prosePrompt(prompt: PromptLabPromptView, note: string): BuiltPrompt {
    return {
        prompt,
        parseOutput: (raw) => ({
            parsed: {
                chars: [...raw.trim()].length,
                paragraphs: raw.trim().split(/\n{2,}/).filter(Boolean).length,
                preview: raw.trim().slice(0, 180),
            },
            note,
        }),
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('fixture 必須是 JSON object');
    }
    return value as Record<string, unknown>;
}

function typed<T>(value: unknown): T {
    return value as T;
}

function stringField(obj: Record<string, unknown>, key: string): string {
    const value = obj[key];
    if (typeof value !== 'string') {
        throw new Error(`fixture.${key} 必須是 string`);
    }
    return value;
}

function optionalStringField(obj: Record<string, unknown>, key: string): string | undefined {
    const value = obj[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArrayField(obj: Record<string, unknown>, key: string): string[] | undefined {
    const value = obj[key];
    if (value == null) return undefined;
    if (!Array.isArray(value)) throw new Error(`fixture.${key} 必須是 string[]`);
    return value.filter((item): item is string => typeof item === 'string');
}

function rolledValuesFrom(value: unknown): RolledAttribute[] {
    if (!Array.isArray(value)) {
        return DEFAULT_ATTRIBUTE_SCHEMA.map((schema: AttributeKey, idx) => ({
            key: schema.key,
            label: schema.label,
            value: [70, 45, 80, 55][idx] ?? 50,
        }));
    }
    return value
        .map((item): RolledAttribute | null => {
            if (!item || typeof item !== 'object') return null;
            const obj = item as Record<string, unknown>;
            const key = typeof obj.key === 'string' ? obj.key : '';
            const label = typeof obj.label === 'string' ? obj.label : key;
            const value = typeof obj.value === 'number' ? obj.value : Number(obj.value);
            if (!key || !label || !Number.isFinite(value)) return null;
            return { key, label, value };
        })
        .filter((item): item is RolledAttribute => item !== null);
}

function parseJsonObject(raw: string): unknown | null {
    const json = extractJson(raw, '{', '}');
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function parseJsonArray(raw: string): unknown | null {
    const json = extractJson(raw, '[', ']');
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function extractJson(raw: string, open: '{' | '[', close: '}' | ']'): string | null {
    const fence = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(raw);
    if (fence) return fence[1];
    const first = raw.indexOf(open);
    const last = raw.lastIndexOf(close);
    if (first < 0 || last <= first) return null;
    return raw.slice(first, last + 1);
}

function assertNever(value: never): never {
    throw new Error(`unsupported prompt lab call: ${value}`);
}
