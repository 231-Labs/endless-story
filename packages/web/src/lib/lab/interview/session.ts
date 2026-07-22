/**
 * 演員訪談室 — 影子 session。
 *
 * 一場訪談有自己的 character session（訪談目錄之內），從正卷 session 截斷
 * 複製而來：快照拍之後才發生的親歷，一句也不帶。respond 只寫影子，
 * 正卷 sessions/ 全程唯讀 —— 訪談永不改寫她真正的人生。
 *
 * 截斷之律：SessionMessage 帶 eventId（事件親歷）與 at（落款時刻）。
 * eventId 能對上 ticks.jsonl 的，按事件所屬拍篩；無 eventId 的雜項
 * percept，按快照拍的 finishedAt 時刻篩。已被 compact() 壓進 summary 的
 * 早段無法精確截斷 —— 如實記進 truncationNote，不裝作沒有。
 */

import * as path from 'node:path';
import {
    FileCharacterSessionStore,
    PersistentCharacterSessions,
    type CharacterSessionIdentity,
    type CharacterSessionModel,
} from '@endless-story/engine/session';
import { loadLLMConfig, resolveTextProvider, text as llmText } from '@endless-story/llm';
import { readTickRecords } from '../artifacts';
import { runDir } from '../paths';
import { shadowSessionDir } from './store';

/** 有無真模型可用（訪談與走拍檔位無關：排演卷也可用真模型受訪）。 */
export function interviewProviderAvailable(): boolean {
    try {
        return resolveTextProvider(loadLLMConfig()) !== null;
    } catch {
        return false;
    }
}

/** 真模型 complete —— 與 RunnerSceneAgent 同款惰性建 client。 */
function realModel(): CharacterSessionModel {
    let client: ReturnType<typeof llmText.createTextClient> | undefined;
    return {
        complete: async (input) => {
            client ??= llmText.createTextClient({ kind: 'primary' });
            const res = await client.chat({
                model: client.defaultModel,
                system: input.system,
                messages: input.messages,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
            });
            return res.text;
        },
    };
}

/** 排演檔的確定性假角 —— 零鑰跑通整條訪談管線。從 percept 撿一條記憶或
 *  一句親歷回一段固定格式的話（機制同一份、內容明示是排演）。 */
function fakeModel(characterName: string): CharacterSessionModel {
    return {
        complete: async (input) => {
            const percept = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
            const pick = (marker: string): string | undefined => {
                const at = percept.indexOf(marker);
                if (at < 0) return undefined;
                const body = percept.slice(at + marker.length);
                const line = body.split('\n').map((l) => l.trim()).find((l) => l.startsWith('-') || l.startsWith('·'));
                return line?.replace(/^[-·]\s*/, '').replace(/^（第\d+日）/, '');
            };
            const memory = pick('【心頭浮起的記憶】');
            const concern = pick('【心上懸著的事】');
            const isDiary = percept.includes('【今日私記之邀】') || percept.includes('【落筆之引】');
            if (isDiary) {
                return `（排演）今日記下一筆：${memory ?? concern ?? '無甚大事，心裡卻不算平靜。'}此事先擱在心裡，明日再看。`;
            }
            return `（排演）${characterName}略一沉吟：「${memory ? `你這一問，倒叫我想起——${memory}` : concern ? `眼下心裡掛著的，是${concern}` : '今日無甚可說，改日再敘。'}」`;
        },
    };
}

export interface ShadowSession {
    sessions: PersistentCharacterSessions;
    identity: CharacterSessionIdentity;
    truncationNote?: string;
}

/** 開（或接續）一場訪談的影子 session。首次開啟時從正卷 session 截斷複製。 */
export function ensureShadowSession(opts: {
    runId: string;
    interviewId: string;
    sagaId: string;
    characterId: string;
    characterName: string;
    canon: string;
    /** 綁定的快照拍；null＝當前（不截斷）。 */
    tick: number | null;
    real: boolean;
}): ShadowSession {
    const identity: CharacterSessionIdentity = {
        sagaId: opts.sagaId,
        characterId: opts.characterId,
        characterName: opts.characterName,
        canon: opts.canon,
    };
    const key = process.env.CHARACTER_SESSION_KEY;
    const sessions = new PersistentCharacterSessions(
        new FileCharacterSessionStore(shadowSessionDir(opts.runId, opts.interviewId), key),
        opts.real ? realModel() : fakeModel(opts.characterName),
    );

    let truncationNote: string | undefined;
    const existing = sessions.store.load(identity);
    if (!existing) {
        // 首開 —— 從正卷 session 截斷複製（有則）。
        const runStore = new FileCharacterSessionStore(path.join(runDir(opts.runId), 'sessions'), key);
        let source: ReturnType<typeof runStore.load> = null;
        try {
            source = runStore.load(identity);
        } catch {
            source = null; // 加密鑰不符等 —— 視同無正卷 session，白手起家
        }
        const shadow = sessions.inspect(identity); // 空白影子（canonHash 由此定）
        if (source) {
            let kept = source.messages;
            if (opts.tick !== null) {
                const records = readTickRecords(opts.runId);
                const allowed = new Set<string>();
                let cutoffAt: string | undefined;
                for (const record of records) {
                    if (record.tick > opts.tick) continue;
                    for (const event of record.events) allowed.add(event.id);
                    if (record.tick === opts.tick) cutoffAt = record.finishedAt;
                    else if (!cutoffAt || record.finishedAt > cutoffAt) cutoffAt = record.finishedAt;
                }
                kept = source.messages.filter((m) =>
                    m.eventId ? allowed.has(m.eventId) : (!cutoffAt || m.at <= cutoffAt),
                );
                if (source.summary) {
                    truncationNote = '此卷較早親歷已被壓縮成摘要，無法按拍截斷 —— 這個時點的她會帶著壓縮後的記憶底色（可能含少量後見）。';
                } else if (kept.length < source.messages.length) {
                    truncationNote = undefined; // 乾淨截斷 —— 不需警示
                }
            }
            shadow.summary = source.summary;
            shadow.messages = kept.map((m) => ({ ...m }));
            sessions.store.save(shadow);
        }
    }

    return { sessions, identity, truncationNote };
}
