/**
 * 演員訪談室 — 檔案存儲。一場訪談 = 一目錄：
 *
 *   runs/<runId>/interviews/<interviewId>/
 *   ├── interview.json   訪談紀錄（快照拍/模式/canon/逐輪問答＋查驗）
 *   ├── session/         影子 character session（respond 只寫這裡）
 *   └── marks.json       內容候選標記
 *
 * 鐵律：訪談永不寫正卷的 sessions/、memory/、state/、ticks.jsonl ——
 * 影子世界，零污染。這裡只有 fs CRUD；組裝與對話在 context/respond。
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSafeId, readJson, runDir, writeJsonAtomic } from '../paths';
import type {
    InterviewContentMark,
    InterviewMarkKind,
    InterviewMessageRecord,
    InterviewSessionFile,
    InterviewSummary,
} from './types';

const INTERVIEW_FILE = 'interview.json';
const MARKS_FILE = 'marks.json';

export function interviewsRoot(runId: string): string {
    return path.join(runDir(runId), 'interviews');
}

export function interviewDir(runId: string, interviewId: string): string {
    return path.join(interviewsRoot(runId), assertSafeId(interviewId, 'interview id'));
}

export function shadowSessionDir(runId: string, interviewId: string): string {
    return path.join(interviewDir(runId, interviewId), 'session');
}

export function newInterviewId(): string {
    return `iv${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

export function newMessageId(): string {
    return `m${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
}

export function writeInterview(file: InterviewSessionFile): void {
    writeJsonAtomic(path.join(interviewDir(file.runId, file.id), INTERVIEW_FILE), file);
}

export function readInterview(runId: string, interviewId: string): InterviewSessionFile | null {
    return readJson<InterviewSessionFile>(path.join(interviewDir(runId, interviewId), INTERVIEW_FILE));
}

export function appendInterviewMessages(
    runId: string,
    interviewId: string,
    messages: InterviewMessageRecord[],
): InterviewSessionFile {
    const file = readInterview(runId, interviewId);
    if (!file) throw new Error(`interview not found: ${interviewId}`);
    file.messages.push(...messages);
    file.updatedAt = new Date().toISOString();
    writeInterview(file);
    return file;
}

export function readMarks(runId: string, interviewId: string): InterviewContentMark[] {
    return readJson<InterviewContentMark[]>(path.join(interviewDir(runId, interviewId), MARKS_FILE)) ?? [];
}

export function addMark(
    runId: string,
    interviewId: string,
    input: { messageId: string; kind: InterviewMarkKind; note?: string },
): InterviewContentMark[] {
    const file = readInterview(runId, interviewId);
    if (!file) throw new Error(`interview not found: ${interviewId}`);
    const answerIndex = file.messages.findIndex((m) => m.id === input.messageId && m.role === 'character');
    if (answerIndex < 0) throw new Error(`answer not found: ${input.messageId}`);
    const answer = file.messages[answerIndex];
    // 這一答對應的問 —— 往前找最近的 interviewer 句（日記模式可能沒有）。
    const question = [...file.messages.slice(0, answerIndex)].reverse().find((m) => m.role === 'interviewer');
    const marks = readMarks(runId, interviewId);
    marks.push({
        id: `mk${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`,
        interviewId,
        runId,
        characterId: file.characterId,
        characterName: file.characterName,
        worldDay: file.day,
        momentLabel: file.momentLabel,
        mode: file.mode,
        messageId: answer.id,
        question: question?.content ?? '',
        answer: answer.content,
        recalledMemorySeqs: answer.recalledMemorySeqs,
        kind: input.kind,
        note: input.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
    });
    writeJsonAtomic(path.join(interviewDir(runId, interviewId), MARKS_FILE), marks);
    return marks;
}

export function listInterviews(runId: string, characterId?: string): InterviewSummary[] {
    let names: string[];
    try {
        names = fs.readdirSync(interviewsRoot(runId));
    } catch {
        return [];
    }
    const out: InterviewSummary[] = [];
    for (const name of names) {
        const file = readJson<InterviewSessionFile>(path.join(interviewsRoot(runId), name, INTERVIEW_FILE));
        if (!file || (characterId && file.characterId !== characterId)) continue;
        out.push({
            id: file.id,
            runId: file.runId,
            characterId: file.characterId,
            characterName: file.characterName,
            mode: file.mode,
            tick: file.tick,
            momentLabel: file.momentLabel,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
            messageCount: file.messages.length,
            markCount: readMarks(runId, file.id).length,
        });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 清除本次訪談 —— 整目錄焚去（影子 session 隨之而去；正卷毫髮無傷）。 */
export function deleteInterview(runId: string, interviewId: string): void {
    fs.rmSync(interviewDir(runId, interviewId), { recursive: true, force: true });
}

/** 全卷的內容候選（跨訪談彙整，給後續 Creator/Storyteller 取料）。 */
export function listAllMarks(runId: string): InterviewContentMark[] {
    let names: string[];
    try {
        names = fs.readdirSync(interviewsRoot(runId));
    } catch {
        return [];
    }
    const out: InterviewContentMark[] = [];
    for (const name of names) {
        out.push(...(readJson<InterviewContentMark[]>(path.join(interviewsRoot(runId), name, MARKS_FILE)) ?? []));
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
