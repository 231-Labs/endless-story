/**
 * 演員訪談室 — 角色上下文組裝（server-side only）。
 *
 * 兩半之律的執行處：`known`（角色可知）與 `directorOnly`（僅導演可見）在
 * 這裡分流 —— prompt 素材只從 known 取，directorOnly 只回給右側面板與
 * evaluator。知識邊界不靠散文猜，全靠結構欄位：事件用 witnessIds 篩、
 * 私語用 perceiverIds redact（沿用 engine core scene-perception 的紀律），
 * 記憶用 LocalRecall 的 as-of maxDay 篩。
 *
 * 時光快照：tick != null → 凍結的 checkpoint 世界；tick == null → 卷的
 * 「當前」世界（走拍中拒開，與「靜場才撥物界」同律）。
 */

import * as path from 'node:path';
import { LocalRecall, WorldState, bondOf } from '@endless-story/engine';
import {
    buildInterviewCanon,
    closenessWord,
    stateWordsOf,
    type InterviewKnownEventLine,
    type InterviewMemoryLine,
    type InterviewRelationLine,
} from '@endless-story/runner/services/character-agent/interview-prompt';
import { readTickRecords } from '../artifacts';
import { momentOfTick, restoreCheckpoint } from '../checkpoints';
import { labManager } from '../manager';
import { runDir } from '../paths';
import { readRunMeta } from '../store';
import type { LabTickRecord } from '../types';
import type { InterviewDirectorState, InterviewKnownState } from './types';

type CastMember = WorldState['data']['cast'][number];

export interface InterviewMoment {
    world: WorldState;
    tick: number | null;
    day: number;
    partOfDay: string;
    momentLabel: string;
}

/** Resolve the frozen (or live) world of an interview moment. */
export function resolveMoment(runId: string, tick: number | null): InterviewMoment {
    if (tick !== null) {
        const world = restoreCheckpoint(runId, tick);
        const { day, partOfDay } = momentOfTick(tick, world.data.clock.ticksPerDay);
        return { world, tick, day, partOfDay, momentLabel: `第${day}日 · ${partOfDay}後` };
    }
    const manager = labManager();
    manager.assertIdle(runId); // 走拍中的「當前」是半成品世界 —— 靜場才可訪
    const active = manager.get(runId);
    const stateDir = path.join(runDir(runId), 'state');
    const world = active?.world ?? (WorldState.exists(stateDir) ? WorldState.restore(stateDir) : null);
    if (!world) throw new Error('此卷尚無世界快照 —— 先點燈開拍');
    const clock = world.data.clock;
    return {
        world,
        tick: null,
        day: clock.day,
        partOfDay: clock.partOfDay,
        momentLabel: `第${clock.day}日 · ${clock.partOfDay}`,
    };
}

export function castMemberOf(world: WorldState, characterId: string): CastMember {
    const member = world.data.cast.find((m) => m.id === characterId);
    if (!member) throw new Error(`character not found: ${characterId}`);
    return member;
}

/** 讀取這一卷的 LocalRecall（活卷用其唯一實例；冷卷開唯讀新例）。 */
export function recallOf(runId: string): LocalRecall {
    const active = labManager().get(runId);
    if (active) {
        const recall = active.deps.recall as LocalRecall;
        if (typeof recall.listMemories === 'function') return recall;
    }
    const meta = readRunMeta(runId);
    return new LocalRecall(path.join(runDir(runId), 'memory'), {
        embeddings: meta?.config.realEmbeddings ? 'auto' : 'deterministic',
    });
}

const EVENT_CAP = 6;
const LINE_CAP = 8;
const LINE_LEN = 90;

function clip(text: string): string {
    const t = text.trim();
    return t.length > LINE_LEN ? `${t.slice(0, LINE_LEN)}…` : t;
}

/** 一條 beat 投影給某見證者：perceiverIds 在則按之 redact（舊紀錄無此欄 ⇒
 *  當年全場皆聞，如實全給）。 */
function projectBeatLine(
    beat: LabTickRecord['events'][number]['beats'][number],
    characterId: string,
): string {
    const heard = !beat.perceiverIds || beat.perceiverIds.includes(characterId);
    if (heard) return clip(`${beat.name}：${beat.text}`);
    return beat.addressed
        ? `${beat.name}對${beat.addressed}壓低了聲音，內容聽不清。`
        : `${beat.name}壓低了聲音，內容聽不清。`;
}

interface DayEvents {
    witnessed: Array<{ eventId: string; sceneName: string; clock?: string; lines: string[] }>;
    unwitnessed: Array<{ eventId: string; sceneName: string; clock?: string; witnessIds: string[]; lines: string[] }>;
    eventDayByid: Map<string, number>;
}

/** 當日事件按見證分流（tick 上限內）。 */
function splitDayEvents(runId: string, characterId: string, day: number, maxTick: number | null): DayEvents {
    const witnessed: DayEvents['witnessed'] = [];
    const unwitnessed: DayEvents['unwitnessed'] = [];
    const eventDayByid = new Map<string, number>();
    for (const record of readTickRecords(runId)) {
        if (maxTick !== null && record.tick > maxTick) continue;
        for (const event of record.events) eventDayByid.set(event.id, record.day);
        if (record.day !== day) continue;
        for (const event of record.events) {
            if (event.witnessIds.includes(characterId)) {
                witnessed.push({
                    eventId: event.id,
                    sceneName: event.sceneName,
                    clock: record.partOfDay,
                    lines: event.beats.slice(0, LINE_CAP).map((b) => projectBeatLine(b, characterId)),
                });
            } else {
                unwitnessed.push({
                    eventId: event.id,
                    sceneName: event.sceneName,
                    clock: record.partOfDay,
                    witnessIds: event.witnessIds,
                    lines: event.beats.slice(0, LINE_CAP).map((b) => clip(`${b.name}：${b.text}`)),
                });
            }
        }
    }
    return {
        witnessed: witnessed.slice(-EVENT_CAP),
        unwitnessed: unwitnessed.slice(-EVENT_CAP),
        eventDayByid,
    };
}

function relationsOf(world: WorldState, member: CastMember) {
    const w = world.data;
    const graph = world.bondGraph();
    const key = (a: string, b: string) => `${a}→${b}`;
    const otherIds = new Set<string>([
        ...Object.keys(member.relationshipView),
        ...Object.keys(w.edges[member.id] ?? {}),
    ]);
    otherIds.delete(member.id);
    return [...otherIds]
        .map((otherId) => {
            const warmth = graph.has(key(member.id, otherId))
                ? bondOf(graph, member.id, otherId)
                : world.welcome(member.id, otherId);
            const warmthBack = graph.has(key(otherId, member.id))
                ? bondOf(graph, otherId, member.id)
                : world.welcome(otherId, member.id);
            return {
                id: otherId,
                name: world.nameById(otherId),
                knownAs: world.perceivedName(member.id, otherId),
                acquaint: world.acquaintLevel(member.id, otherId),
                tone: w.edges[member.id]?.[otherId]?.tone,
                line: member.relationshipView[otherId],
                established: world.isEstablished(member.id, otherId),
                warmth,
                warmthBack,
            };
        })
        .sort((a, b) => b.warmth - a.warmth);
}

function activityOf(world: WorldState, member: CastMember, partOfDay: string): string | undefined {
    const duty = member.duties?.find((d) => d.part === partOfDay && d.duty);
    if (duty) return duty.note ?? `在${world.sceneNameById(duty.sceneId)}當值`;
    if (member.plan) {
        const first = member.plan.split(/[。\n]/)[0]?.trim();
        if (first) return first.length > 40 ? `${first.slice(0, 40)}…` : first;
    }
    return undefined;
}

export interface InterviewContext {
    moment: InterviewMoment;
    member: CastMember;
    known: InterviewKnownState;
    directorOnly: InterviewDirectorState;
    /** 本輪召回（帶 seq，供訊息記錄與 evaluator 對帳）。 */
    recalledSeqs: number[];
    injectedEventIds: string[];
    /** runner percept builder 的素材（從 known 轉印，絕不摻 directorOnly）。 */
    promptMaterial: {
        witnessedToday: InterviewKnownEventLine[];
        memories: InterviewMemoryLine[];
        relations: InterviewRelationLine[];
        concerns: string[];
        stateWords: string[];
    };
}

const PROMPT_RELATION_CAP = 6;
const PROMPT_MEMORY_LIMIT = 7;
const PANEL_MEMORY_CAP = 12;
/** 輪換底線：新記憶不足時，至多讓這麼多條舊記憶回鍋（她真只記得這些時，
 *  誠實見底，別硬湊）。 */
const REPEAT_FLOOR = 3;

/** 組一輪訪談的完整上下文（known＋directorOnly＋prompt 素材）。
 *  `excludeSeqs`＝此場訪談先前各輪已注入過的記憶 —— 召回時讓位給沒上過
 *  桌的（記憶輪換：小池子不再每問都端同一批 top-N 出來）。 */
export async function buildInterviewContext(
    runId: string,
    characterId: string,
    tick: number | null,
    question: string,
    opts: { excludeSeqs?: number[] } = {},
): Promise<InterviewContext> {
    const moment = resolveMoment(runId, tick);
    const { world, day, partOfDay } = moment;
    const w = world.data;
    const member = castMemberOf(world, characterId);
    const recall = recallOf(runId);

    const { witnessed, unwitnessed } = splitDayEvents(
        runId,
        characterId,
        day,
        tick !== null ? tick : null,
    );

    // 召回：以問題為引，錨在受訪之日（recency 以那一天算，不是卷的今天）。
    // 快照訪談加 as-of 篩（她想不起還沒活過的日子）；同日之內無法再細分
    // —— 誠實限界，記在 docs。
    // 記憶輪換：多召一輪候選，先端沒上過桌的；新的不夠才讓少量舊的回鍋。
    const query = question.trim() || '今日 心事 想對人說的話';
    const exclude = new Set(opts.excludeSeqs ?? []);
    const candidates = await recall.recall(
        characterId,
        query,
        PROMPT_MEMORY_LIMIT + exclude.size + 5,
        day,
        tick !== null ? day : undefined,
    );
    const freshOnes = candidates.filter((m) => m.seq === undefined || !exclude.has(m.seq));
    const repeats = candidates.filter((m) => m.seq !== undefined && exclude.has(m.seq));
    const recalled = [
        ...freshOnes.slice(0, PROMPT_MEMORY_LIMIT),
        ...repeats.slice(0, Math.max(0, Math.min(REPEAT_FLOOR, PROMPT_MEMORY_LIMIT - freshOnes.length))),
    ];
    const relations = relationsOf(world, member);
    const wants = world.liveWantsOf(member.id);
    const stateWords = stateWordsOf(member.state);
    const sceneName = world.sceneNameById(w.roster[member.id] ?? '') || '不知何處';

    const known: InterviewKnownState = {
        momentLabel: moment.momentLabel,
        day,
        partOfDay,
        sceneName,
        activity: activityOf(world, member, partOfDay),
        stateWords,
        witnessedToday: witnessed,
        memories: recalled.map((m) => ({ seq: m.seq, day: m.day, kind: m.kind, importance: m.importance, text: m.text })),
        relations: relations.map((r) => ({
            id: r.id,
            name: r.name,
            knownAs: r.knownAs,
            closenessWord: closenessWord(r.warmth),
            tone: r.tone,
            line: r.line,
            established: r.established || undefined,
            acquaint: r.acquaint,
        })),
        concerns: wants.slice(0, 4).map((want) => want.desc),
        plan: member.plan,
        ownSecret: member.secret,
        coreIdentity: member.coreIdentity,
    };

    const directorOnly: InterviewDirectorState = {
        unwitnessedToday: unwitnessed.map((e) => ({
            eventId: e.eventId,
            sceneName: e.sceneName,
            clock: e.clock,
            witnessNames: e.witnessIds.map((id) => world.nameById(id)),
            lines: e.lines,
        })),
        othersSecrets: w.cast
            .filter((m) => m.id !== member.id && m.secret)
            .map((m) => ({ name: m.name, secret: m.secret! })),
        viewsOfSubject: w.cast
            .filter((m) => m.id !== member.id && m.relationshipView[member.id])
            .map((m) => {
                const graph = world.bondGraph();
                const key = (a: string, b: string) => `${a}→${b}`;
                return {
                    name: m.name,
                    line: m.relationshipView[member.id],
                    warmthToSubject: graph.has(key(m.id, member.id)) ? bondOf(graph, m.id, member.id) : world.welcome(m.id, member.id),
                    warmthFromSubject: graph.has(key(member.id, m.id)) ? bondOf(graph, member.id, m.id) : world.welcome(member.id, m.id),
                };
            }),
        bondNumbers: relations.map((r) => ({
            name: r.name,
            out: Math.round(r.warmth * 100) / 100,
            back: Math.round(r.warmthBack * 100) / 100,
            tone: r.tone,
        })),
        wantsFull: wants.map((want) => ({
            desc: want.desc,
            layer: want.layer,
            tension: Math.round(want.weight * (1 - want.sat) * 100) / 100,
            target: want.target,
        })),
        stateNumbers: { ...member.state },
        ...(member.renown !== undefined
            ? { renown: world.renownOf(member.id), selfRegard: world.selfRegardOf(member.id) }
            : {}),
        secretSeed: member.secretSeed,
    };

    return {
        moment,
        member,
        known,
        directorOnly,
        recalledSeqs: recalled.map((m) => m.seq).filter((s): s is number => s !== undefined),
        injectedEventIds: witnessed.map((e) => e.eventId),
        promptMaterial: {
            witnessedToday: witnessed.map((e) => ({ sceneName: e.sceneName, clock: e.clock, lines: e.lines })),
            memories: recalled.map((m) => ({ day: m.day, kind: m.kind, text: m.text })),
            relations: known.relations.slice(0, PROMPT_RELATION_CAP).map((r) => ({
                knownAs: r.knownAs,
                closenessWord: r.closenessWord,
                tone: r.tone,
                line: r.line,
            })),
            concerns: known.concerns,
            stateWords,
        },
    };
}

/** 名錄卡素材：面板用的「最後記憶落款日」。 */
export function lastMemoryDayOf(runId: string, characterId: string): number | undefined {
    const memories = recallOf(runId).listMemories(characterId);
    return memories.length ? Math.max(...memories.map((m) => m.day)) : undefined;
}

/** 右側「所知」面板的記憶帳（非召回，是全帳的近況截面）。 */
export function panelMemoriesOf(runId: string, characterId: string, maxDay: number | null) {
    return recallOf(runId)
        .listMemories(characterId)
        .filter((m) => maxDay === null || m.day <= maxDay)
        .slice(0, PANEL_MEMORY_CAP);
}

/** session canon —— 開場定一次，整場訪談不變。 */
export function interviewCanonOf(member: CastMember): string {
    return buildInterviewCanon({
        name: member.name,
        persona: member.persona,
        role: member.role,
        gender: member.gender,
        age: member.age,
        coreIdentity: member.coreIdentity,
        secret: member.secret,
        secretSeed: member.secretSeed,
        styleHints: (member.skills ?? []).slice(0, 4).map((s) => `${s.name}（${s.kind}）：${s.style}`),
    });
}

/** actors 名錄用的當前世界（活卷取記憶體世界、冷卷 restore 唯讀）。 */
export function currentWorldOf(runId: string): WorldState | null {
    const active = labManager().get(runId);
    if (active) return active.world;
    const stateDir = path.join(runDir(runId), 'state');
    if (!WorldState.exists(stateDir)) return null;
    try {
        return WorldState.restore(stateDir);
    } catch {
        return null;
    }
}
