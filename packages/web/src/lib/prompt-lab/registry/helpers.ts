// Shared helpers for prompt-lab registry definitions. These were the input-coercion /
// output-parsing utilities inside prompt-lab.ts's buildPrompt switch; a def's build()
// and parse() reuse them so behavior is identical after the switch collapses.

import { DEFAULT_ATTRIBUTE_SCHEMA } from '@/lib/config/attribute-schema';
import type { AttributeKey, BuildPromptResult, RolledAttribute } from '@endless-story/llm/prompts';

// Assemble a system+user chat prompt (the runner-style defs use this).
export function sysUser(system: string, user: string, maxTokens: number): BuildPromptResult {
  return { system, messages: [{ role: 'user', content: user }], maxTokens };
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fixture 必須是 JSON object');
  }
  return value as Record<string, unknown>;
}

export function typed<T>(value: unknown): T {
  return value as T;
}

export function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string') throw new Error(`fixture.${key} 必須是 string`);
  return value;
}

export function optionalStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function stringArrayField(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error(`fixture.${key} 必須是 string[]`);
  return value.filter((item): item is string => typeof item === 'string');
}

export function rolledValuesFrom(value: unknown): RolledAttribute[] {
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
      const o = item as Record<string, unknown>;
      const key = typeof o.key === 'string' ? o.key : '';
      const label = typeof o.label === 'string' ? o.label : key;
      const v = typeof o.value === 'number' ? o.value : Number(o.value);
      if (!key || !label || !Number.isFinite(v)) return null;
      return { key, label, value: v };
    })
    .filter((item): item is RolledAttribute => item !== null);
}

export function parseJsonObject(raw: string): unknown | null {
  return parseJson(raw, '{', '}');
}

export function parseJsonArray(raw: string): unknown | null {
  return parseJson(raw, '[', ']');
}

function parseJson(raw: string, open: '{' | '[', close: '}' | ']'): unknown | null {
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(raw);
  const slice = fence ? fence[1] : sliceBetween(raw, open, close);
  if (!slice) return null;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function sliceBetween(raw: string, open: '{' | '[', close: '}' | ']'): string | null {
  const first = raw.indexOf(open);
  const last = raw.lastIndexOf(close);
  if (first < 0 || last <= first) return null;
  return raw.slice(first, last + 1);
}

// Stats shown for prose-output prompts (POV / reflection / gazette).
export function proseStats(raw: string): { chars: number; paragraphs: number; preview: string } {
  const trimmed = raw.trim();
  return {
    chars: [...trimmed].length,
    paragraphs: trimmed.split(/\n{2,}/).filter(Boolean).length,
    preview: trimmed.slice(0, 180),
  };
}
