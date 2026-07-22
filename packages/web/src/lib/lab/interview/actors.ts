/**
 * 演員訪談室 — 名錄與快照清單（server-side only）。
 *
 * 名錄卡走「劇院演員名錄」的口徑：行當身份、現在何處、正在做什麼、
 * 心緒一句、最後記憶落款 —— 不是數值面板。
 */

import { assetUrlFor } from '../assets';
import { readTickRecords } from '../artifacts';
import { listCheckpoints } from '../checkpoints';
import { readRunMeta } from '../store';
import {
    currentWorldOf,
    lastMemoryDayOf,
} from './context';
import type { InterviewActorCard, InterviewCheckpointList } from './types';

function moodWordOf(mood: number): string {
    if (mood >= 0.35) return '心緒尚好';
    if (mood <= -0.35) return '心緒沉沉';
    if (mood <= -0.1) return '有些不痛快';
    return '心緒平平';
}

export function listActorCards(runId: string): InterviewActorCard[] {
    const world = currentWorldOf(runId);
    if (!world) throw new Error('此卷尚無世界快照 —— 先點燈開拍');
    const w = world.data;
    return w.cast.map((member) => {
        const duty = member.duties?.find((d) => d.part === w.clock.partOfDay && d.duty);
        const planFirst = member.plan?.split(/[。\n]/)[0]?.trim();
        return {
            id: member.id,
            name: member.name,
            role: member.role,
            gender: member.gender,
            age: member.age,
            portraitUrl: assetUrlFor('character', member.name),
            sceneName: world.sceneNameById(w.roster[member.id] ?? '') || '不知何處',
            activity: duty
                ? (duty.note ?? `在${world.sceneNameById(duty.sceneId)}當值`)
                : planFirst
                    ? (planFirst.length > 40 ? `${planFirst.slice(0, 40)}…` : planFirst)
                    : undefined,
            moodWord: moodWordOf(member.state.mood),
            lastMemoryDay: lastMemoryDayOf(runId, member.id),
            persona: member.persona,
        };
    });
}

const EVENT_ANCHOR_CAP = 60;
const SNIPPET_LEN = 26;

export function checkpointListOf(runId: string): InterviewCheckpointList {
    const meta = readRunMeta(runId);
    if (!meta) throw new Error(`run not found: ${runId}`);
    const world = currentWorldOf(runId);
    if (!world) throw new Error('此卷尚無世界快照 —— 先點燈開拍');
    const clock = world.data.clock;
    const checkpoints = listCheckpoints(runId, clock.ticksPerDay);

    const anchors: InterviewCheckpointList['eventAnchors'] = [];
    const available = new Set(checkpoints.map((c) => c.tick));
    for (const record of readTickRecords(runId)) {
        // 事件錨要能落到快照上才有意義（此事後＝該拍快照）。
        if (!available.has(record.tick)) continue;
        for (const event of record.events) {
            const first = event.beats.find((b) => b.text.trim());
            const snippet = (first ? `${first.name}：${first.text}` : event.sceneName).trim();
            anchors.push({
                eventId: event.id,
                tick: record.tick,
                day: record.day,
                partOfDay: record.partOfDay,
                sceneName: event.sceneName,
                snippet: snippet.length > SNIPPET_LEN ? `${snippet.slice(0, SNIPPET_LEN)}…` : snippet,
            });
        }
    }

    return {
        current: {
            day: clock.day,
            partOfDay: clock.partOfDay,
            label: `第${clock.day}日 · ${clock.partOfDay}`,
        },
        ticksPerDay: clock.ticksPerDay,
        checkpoints,
        eventAnchors: anchors.slice(-EVENT_ANCHOR_CAP),
    };
}
