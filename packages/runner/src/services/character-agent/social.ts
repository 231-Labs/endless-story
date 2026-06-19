/**
 * Character Agent — SOCIAL step (lightweight observation / talk).
 *
 * Between DRAMA and ACT, idle characters in the same scene can notice each
 * other, speak one small line, or do nothing. This is deliberately modest:
 * no scene creation, no artifact, no director fiat. The caller validates
 * same-scene targets and writes the resulting memories.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { parseSocial } from './parse.js';

export interface SocialSceneMate {
    id: string;
    name: string;
    role: string;
}

export interface SocialActionInput {
    name: string;
    role: string;
    sceneName: string;
    planHint?: string;
    recentMemories: string[];
    relationshipHints?: string[];
    dramaHint?: string;
    othersInScene: SocialSceneMate[];
}

export interface SocialActionResult {
    kind: 'observe' | 'talk' | 'idle';
    targetCharacterId?: string;
    line?: string;
    observation?: string;
    relationshipMemory?: string;
    reason?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你是一個戲園角色,此刻不在公開事件裡,但與旁人在同一個場景。',
        '你可以做一個很小的社交動作: observe(觀察)、talk(搭一句話)、idle(暫且不動)。',
        '',
        '**鐵則**:',
        '1. talk 只能對同場名單裡的人;沒人在場時不可 talk。',
        '2. 這不是大戲,只是一個可被記住的小瞬間。不要告白、決裂、拜師、認親、揭祕。',
        '3. observation/relationshipMemory 只能寫你此刻看見、聽見、推測到的主觀印象;不得編多年舊識、舊情、血緣或共同過去。',
        '4. 不得憑空寫跛腿、膝蓋舊傷、重病、血跡、棺材、死人、巨債、私藏信物等強設定;沒有材料就只寫眼神、身段、站位、妝面、衣袖。',
        '5. observation/relationshipMemory 若寫到別人,**必須直接寫出他的名字**(同場名單裡的名字),',
        '   不可只用「她/他」含糊帶過——日後回想要讀得出是誰。observe 時也要點明你在看誰。',
        '6. line 若有,必須是短對白,≤32 字; observation ≤90 字; relationshipMemory ≤110 字。',
        '',
        '**輸出**:嚴格只輸出 JSON 物件,例如',
        '`{"kind":"talk","targetCharacterId":"0x…","line":"孟姑娘,今晚台口風大。","observation":"我看見孟蘭收袖時仍留半分台上的光。","relationshipMemory":"我記下孟蘭在台下仍不肯散去的身段,往後與她搭戲不能只看唱腔。","reason":"同場且與我的打算有關"}`',
        '或 `{"kind":"idle","reason":"此刻不宜開口"}`。不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: SocialActionInput): string {
    const others = input.othersInScene.length > 0
        ? input.othersInScene
              .map((p) => `- id=${p.id} 「${p.name}」${p.role && p.role !== '—' ? `（${p.role}）` : ''}`)
              .join('\n')
        : '（此刻沒有其他人在場）';
    const memBlock =
        input.recentMemories.length > 0
            ? '\n## 近來浮起的記憶\n' +
              input.recentMemories.map((m, i) => `${i + 1}. ${m.slice(0, 150)}`).join('\n')
            : '';
    const relBlock =
        input.relationshipHints && input.relationshipHints.length > 0
            ? '\n## 你自己的人物印象 / 導演公開牽起的關係\n' +
              input.relationshipHints.map((r) => `- ${r}`).join('\n')
            : '';
    const planBlock = input.planHint ? `\n## 你此刻的打算\n${input.planHint}` : '';
    const dramaBlock = input.dramaHint ? `\n## 你此刻的不甘與牽引\n${input.dramaHint}` : '';
    return [
        '# 你是誰',
        `- 姓名:${input.name}`,
        `- 行當:${input.role}`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 所在:${input.sceneName}`,
        planBlock,
        dramaBlock,
        memBlock,
        relBlock,
        '',
        '## 同場人物',
        others,
        '',
        '請決定 observe / talk / idle(JSON)。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

export async function decideSocialAction(
    input: SocialActionInput,
    opts?: { model?: string },
): Promise<SocialActionResult> {
    if (input.othersInScene.length === 0) {
        return { kind: 'idle', reason: '此刻無人在場' };
    }
    const validTargets = new Set(input.othersInScene.map((p) => p.id));
    const llm = llmText.createTextClient({ kind: 'cheap' });
    const model = opts?.model ?? llm.defaultModel;
    const res = await llm.chat({
        model,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
        maxTokens: 360,
        temperature: 0.75,
    });

    const parsed = parseSocial(res.text);
    if (!parsed) return { kind: 'idle', reason: '一念閃過,沒有成形' };
    if (parsed.kind === 'talk') {
        if (!parsed.targetCharacterId || !validTargets.has(parsed.targetCharacterId)) {
            return {
                kind: parsed.observation ? 'observe' : 'idle',
                observation: parsed.observation,
                relationshipMemory: parsed.relationshipMemory,
                reason: parsed.reason ?? '目標不在同場',
            };
        }
        return parsed;
    }
    if (parsed.kind === 'observe') {
        if (!parsed.observation && !parsed.relationshipMemory && !parsed.reason) {
            return { kind: 'idle', reason: '念頭太重,先按下不表' };
        }
        return {
            kind: 'observe',
            observation: parsed.observation,
            relationshipMemory: parsed.relationshipMemory,
            reason: parsed.reason,
        };
    }
    return { kind: 'idle', reason: parsed.reason };
}
