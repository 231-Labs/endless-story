/**
 * 演員訪談室 — 對話編排（server-side only）。
 *
 * 一輪問答 = 組上下文（context）→ 組 percept（runner leaf）→ 影子 session
 * respond → 確定性預檢 → cheap 模型查驗（有鑰才評）→ 落 interview.json。
 * prompt 素材只取自 known 半邊；directorOnly 只給查驗與面板。
 */

import { recurringImagery } from '@endless-story/runner/services/character-agent/beat-prompt';
import {
    buildInterviewPercept,
} from '@endless-story/runner/services/character-agent/interview-prompt';
import { text as llmText } from '@endless-story/llm';
import {
    buildInterviewEvaluatePrompt,
    parseInterviewEvaluation,
    type InterviewEvaluation,
} from '@endless-story/llm/prompts';
import { buildInterviewContext, castMemberOf, interviewCanonOf, resolveMoment } from './context';
import { deriveBoundaryFlags } from './precheck';
import { ensureShadowSession, interviewProviderAvailable } from './session';
import {
    appendInterviewMessages,
    newInterviewId,
    newMessageId,
    readInterview,
    writeInterview,
} from './store';
import type { InterviewMessageRecord, InterviewMode, InterviewSessionFile } from './types';

const ANSWER_MAX_TOKENS = 640;

/** 開一場新訪談：解析時刻、定 canon、建影子 session、落 interview.json。 */
export function createInterview(opts: {
    runId: string;
    characterId: string;
    tick: number | null;
    mode: InterviewMode;
    interviewerIdentity?: string;
}): InterviewSessionFile {
    const moment = resolveMoment(opts.runId, opts.tick);
    const member = castMemberOf(moment.world, opts.characterId);
    const canon = interviewCanonOf(member);
    const id = newInterviewId();
    const now = new Date().toISOString();

    const shadow = ensureShadowSession({
        runId: opts.runId,
        interviewId: id,
        sagaId: moment.world.data.sagaId,
        characterId: member.id,
        characterName: member.name,
        canon,
        tick: moment.tick,
        real: interviewProviderAvailable(),
    });

    const file: InterviewSessionFile = {
        v: 1,
        id,
        runId: opts.runId,
        characterId: member.id,
        characterName: member.name,
        mode: opts.mode,
        interviewerIdentity: opts.interviewerIdentity?.trim() || undefined,
        tick: moment.tick,
        day: moment.day,
        partOfDay: moment.partOfDay,
        momentLabel: moment.momentLabel,
        canon,
        truncationNote: shadow.truncationNote,
        createdAt: now,
        updatedAt: now,
        messages: [],
    };
    writeInterview(file);
    return file;
}

export interface InterviewRound {
    interview: InterviewSessionFile;
    question: InterviewMessageRecord | null;
    answer: InterviewMessageRecord;
}

/** 問一輪（日記模式 question 可空 —— 用預設落筆之引）。 */
export async function postInterviewQuestion(
    runId: string,
    interviewId: string,
    rawQuestion: string,
): Promise<InterviewRound> {
    const interview = readInterview(runId, interviewId);
    if (!interview) throw new Error(`interview not found: ${interviewId}`);
    const question = rawQuestion.trim();
    if (!question && interview.mode !== 'diary') throw new Error('問題不可為空');

    // 記憶輪換＋反覆誦：先前各輪已上桌的記憶讓位給新召回；她此場已用過的
    // 字句意象列進迴避清單（與場上 beat 的 recurringImagery 同一把尺）。
    const previousAnswers = interview.messages.filter((m) => m.role === 'character').map((m) => m.content);
    const followUp = previousAnswers.length > 0;
    const excludeSeqs = [...new Set(interview.messages.flatMap((m) => m.recalledMemorySeqs ?? []))];

    const context = await buildInterviewContext(runId, interview.characterId, interview.tick, question, { excludeSeqs });
    const real = interviewProviderAvailable();
    const shadow = ensureShadowSession({
        runId,
        interviewId,
        sagaId: context.moment.world.data.sagaId,
        characterId: interview.characterId,
        characterName: interview.characterName,
        canon: interview.canon,
        tick: interview.tick,
        real,
    });

    const percept = buildInterviewPercept({
        name: interview.characterName,
        mode: interview.mode,
        momentLabel: interview.momentLabel,
        sceneName: context.known.sceneName,
        stateWords: context.promptMaterial.stateWords,
        witnessedToday: context.promptMaterial.witnessedToday,
        memories: context.promptMaterial.memories,
        relations: context.promptMaterial.relations,
        concerns: context.promptMaterial.concerns,
        plan: context.known.plan,
        interviewerIdentity: interview.interviewerIdentity,
        question,
        followUp,
        avoidEchoes: recurringImagery(previousAnswers),
    });

    const replyText = (await shadow.sessions.respond(shadow.identity, percept, {
        maxTokens: ANSWER_MAX_TOKENS,
        temperature: 0.9,
    })).trim();

    const boundaryFlags = deriveBoundaryFlags({
        answer: replyText,
        world: context.moment.world,
        characterId: interview.characterId,
    });

    // 第二層查驗（cheap 模型）—— 有鑰才評；解析失敗重試一次後記 null。
    let evaluation: InterviewEvaluation | null | undefined;
    if (real) {
        evaluation = await evaluateAnswer({
            characterName: interview.characterName,
            mode: interview.mode,
            question,
            answer: replyText,
            context,
        });
    }

    const now = new Date().toISOString();
    const questionRecord: InterviewMessageRecord | null = question
        ? { id: newMessageId(), role: 'interviewer', content: question, createdAt: now }
        : null;
    const answerRecord: InterviewMessageRecord = {
        id: newMessageId(),
        role: 'character',
        content: replyText,
        createdAt: new Date().toISOString(),
        recalledMemorySeqs: context.recalledSeqs.length ? context.recalledSeqs : undefined,
        injectedEventIds: context.injectedEventIds.length ? context.injectedEventIds : undefined,
        boundaryFlags: boundaryFlags.length ? boundaryFlags : undefined,
        evaluation,
    };
    const updated = appendInterviewMessages(
        runId,
        interviewId,
        questionRecord ? [questionRecord, answerRecord] : [answerRecord],
    );
    return { interview: updated, question: questionRecord, answer: answerRecord };
}

async function evaluateAnswer(opts: {
    characterName: string;
    mode: InterviewMode;
    question: string;
    answer: string;
    context: Awaited<ReturnType<typeof buildInterviewContext>>;
}): Promise<InterviewEvaluation | null> {
    const { context } = opts;
    const prompt = buildInterviewEvaluatePrompt({
        characterName: opts.characterName,
        mode: opts.mode,
        question: opts.question,
        answer: opts.answer,
        known: {
            momentLabel: context.known.momentLabel,
            sceneName: context.known.sceneName,
            stateWords: context.known.stateWords,
            witnessedToday: context.known.witnessedToday.map(
                (e) => `${e.clock ? `${e.clock} · ` : ''}${e.sceneName}：${e.lines.join('／')}`,
            ),
            memories: context.known.memories.map(
                (m) => `#${m.seq ?? '?'}（第${m.day ?? '?'}日·${m.kind ?? '—'}）${m.text}`,
            ),
            relations: context.known.relations.map(
                (r) => `${r.knownAs}：${[r.tone, r.closenessWord].filter(Boolean).join('，')}${r.line ? `（她想：「${r.line}」）` : ''}`,
            ),
            concerns: context.known.concerns,
            ownSecret: context.known.ownSecret,
        },
        directorOnly: {
            unwitnessedToday: context.directorOnly.unwitnessedToday.map(
                (e) => `${e.sceneName}（見證：${e.witnessNames.join('、') || '無'}）：${e.lines.join('／')}`,
            ),
            othersSecrets: context.directorOnly.othersSecrets.map((s) => `${s.name}：${s.secret}`),
        },
    });
    try {
        const client = llmText.createTextClient({ kind: 'cheap' });
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await client.chat({
                model: client.defaultModel,
                system: prompt.system,
                messages: prompt.messages,
                maxTokens: prompt.maxTokens,
                temperature: 0.2,
            });
            const parsed = parseInterviewEvaluation(res.text);
            if (parsed) return parsed;
        }
        return null;
    } catch {
        return null; // 查驗失敗不擋訪談 —— 面板如實顯示「未評」
    }
}
