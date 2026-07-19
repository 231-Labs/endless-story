/**
 * Live projection — turn an engine WorldState (+ the in-process beat ring)
 * into exactly the shapes the existing handscroll components consume:
 * `Saga` / `SagaLocation[]` / `Scene[]` from @endless-story/shared, plus the
 * lab's own character/beat feeds. Pure mapping, no engine mutation.
 *
 * Works in two modes:
 *   - active run (manager has it open): live in-memory world + streaming beats
 *   - cold run  (viewing only): world.json + the tail of ticks.jsonl, so a
 *     freshly opened page still shows a living scroll without touching the LLM
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { bondOf, PARTS_OF_DAY, PRODUCTION, totalEffort, WorldState, type ProductionStatus, type RawPreset } from '@endless-story/engine';
import type { DayPart, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { labManager } from './manager';
import { runDir } from './paths';
import { readRunMeta } from './store';
import { readSeedRaw } from './seeds';
import { assetNoteFor, assetUrlFor, listGallery } from './assets';
import { beatsFromTickRecords, listArchiveEntries, readArchiveEntry, tailTickRecords } from './artifacts';
import type { LabCharacterLive, LabLiveBeat, LabRunMeta, LabRunPhase } from './types';

/** The chain-only preset fields the engine ignores but the handscroll wants. */
interface RawPresetView extends RawPreset {
    locations?: Array<{ name: string; description?: string; terrain?: string }>;
    scenes?: Array<NonNullable<RawPreset['scenes']>[number] & {
        location_index?: number;
        pos_x?: number;
        pos_y?: number;
    }>;
}

export interface LabStreamLine {
    key: string;
    text: string;
    speakerName?: string;
    kind?: string;
}

export interface LabLiveSnapshot {
    runId: string;
    meta: LabRunMeta;
    phase: LabRunPhase;
    pendingTicks: number;
    lastError?: string;
    provider?: string;
    model?: string;
    /** Beat-seq space id — when it changes, the client must reset its cursor. */
    epoch: string;
    /** Latest beat seq in the ring — pass back as ?after= next poll. */
    seq: number;
    /** The world clock in full — drives the day-progress bead curtain. */
    clock: { day: number; currentTick: number; tickOfDay: number; ticksPerDay: number; partOfDay: string };
    saga: Saga;
    locations: SagaLocation[];
    scenes: Scene[];
    /** Uploaded location art (lab 圖庫) keyed by location id; overrides the
     *  built-in name-matched oil panels. */
    artByLocationId: Record<string, string>;
    characters: LabCharacterLive[];
    /** Per-scene recent public lines (newest first) for the 題字流. */
    streams: Record<string, LabStreamLine[]>;
    /** Beats newer than the requested cursor (empty on cold runs). */
    beats: LabLiveBeat[];
    /** Log tail for the operator console. */
    logs: Array<{ ts: number; line: string }>;
    /** 劇本產出 current state — present only when the flag is on and a production
     *  has begun. Drives the run page's 製作中 panel. */
    production?: LabProductionLive;
}

/** The in-progress (or premiered) production, shaped for the 製作中 panel. */
export interface LabProductionLive {
    title: string;
    status: ProductionStatus;
    /** Everyone who has contributed, resolved to display names. */
    contributors: Array<{ id: string; name: string }>;
    scriptFragments: number;
    /** Banked effort and the threshold it must cross to premiere. */
    effort: number;
    threshold: number;
    premieredDay?: number;
    /** Recent lifecycle lines (proposal / fragments / premiere), newest last. */
    timeline: string[];
}

const DAY_PART_MAP: Record<string, DayPart> = {
    清晨: 'morning',
    日午: 'noon',
    晡時: 'noon',
    黃昏: 'dusk',
    入夜: 'night',
    深宵: 'night',
};

export function toDayPart(partOfDay: string): DayPart {
    return DAY_PART_MAP[partOfDay] ?? 'noon';
}

function loadWorldReadOnly(runId: string): WorldState | null {
    const stateDir = path.join(runDir(runId), 'state');
    if (!WorldState.exists(stateDir)) return null;
    try {
        return WorldState.restore(stateDir);
    } catch {
        return null;
    }
}

function presetView(meta: LabRunMeta): RawPresetView {
    try {
        return readSeedRaw(meta.config.seedSource, meta.config.presetId) as RawPresetView;
    } catch {
        return { id: meta.config.presetId } as RawPresetView;
    }
}

/** Backfill the beat feed of a cold run from the last few tick records; for
 *  adopted engine-CLI runs (no ticks.jsonl) fall back to parsing the last few
 *  手卷 archive files, so an imported run still opens as a living scroll. */
function coldBeats(runId: string, world: WorldState): LabLiveBeat[] {
    const fromRecords = beatsFromTickRecords(tailTickRecords(runId, 3)).map((beat, i) => ({
        ...beat,
        seq: i + 1,
        ts: 0,
    }));
    if (fromRecords.length) return fromRecords;
    return coldBeatsFromShoujuan(runId, world);
}

function coldBeatsFromShoujuan(runId: string, world: WorldState): LabLiveBeat[] {
    const entries = listArchiveEntries(runId).filter((entry) => entry.kind === 'shoujuan').slice(-6);
    const beats: LabLiveBeat[] = [];
    let seq = 0;
    for (const entry of entries) {
        let content: string;
        try {
            content = readArchiveEntry(runId, entry.file);
        } catch {
            continue;
        }
        const header = /^# 〔手卷〕(.+?)\s+\(day \d+ · tick \d+(?: · event (\S+))?\)/m.exec(content);
        const sceneName = header?.[1]?.trim() ?? entry.slug;
        const idFromEvent = header?.[2]?.split(':').pop();
        const scene = (idFromEvent ? world.sceneById(idFromEvent) : undefined)
            ?? world.data.scenes.find((s) => s.name === sceneName);
        const ticksPerDay = Math.max(1, world.data.clock.ticksPerDay);
        const tickOfDay = ((entry.tick % ticksPerDay) + ticksPerDay) % ticksPerDay;
        const clockLabel = PARTS_OF_DAY[Math.min(PARTS_OF_DAY.length - 1, Math.floor((tickOfDay / ticksPerDay) * PARTS_OF_DAY.length))];
        const body = content.split(/\n---\n/)[1] ?? content;
        for (const line of body.split('\n')) {
            const beat = /^([^：\s]{1,12})：(.+)$/.exec(line.trim());
            if (!beat) continue;
            const characterId = world.idByName(beat[1]);
            if (!characterId && beat[1] !== '世界') continue;
            seq += 1;
            beats.push({
                seq,
                ts: 0,
                day: entry.day,
                tick: entry.tick,
                clock: clockLabel,
                sceneId: scene?.id ?? '',
                sceneName,
                isPrivate: (scene?.privacyLevel ?? 0) >= 3,
                characterId: characterId ?? '__world__',
                name: beat[1],
                text: beat[2].trim(),
            });
        }
    }
    return beats;
}

export async function buildLiveSnapshot(runId: string, afterSeq = 0): Promise<LabLiveSnapshot> {
    const manager = labManager();
    const active = manager.get(runId);
    const meta = active?.meta ?? readRunMeta(runId);
    if (!meta) throw new Error(`run not found: ${runId}`);

    const world = active?.world ?? loadWorldReadOnly(runId);
    if (!world) throw new Error(`run has no world snapshot yet: ${runId}`);
    const raw = active ? (active.raw as RawPresetView) : presetView(meta);
    const w = world.data;
    const clock = w.clock;

    // ── locations ──────────────────────────────────────────────────────────
    const rawLocations = raw.locations ?? [];
    const locations: SagaLocation[] = rawLocations.length
        ? rawLocations.map((loc, i) => ({
            id: `loc${i}`,
            name: loc.name,
            description: loc.description ?? '',
            terrain: loc.terrain,
        }))
        : [{ id: 'loc0', name: raw.saga?.name ?? meta.title, description: raw.saga?.description ?? '', terrain: undefined }];
    const artByLocationId: Record<string, string> = {};
    for (const location of locations) {
        const url = assetUrlFor('location', location.name);
        if (url) artByLocationId[location.id] = url;
    }

    // ── beats / streams ────────────────────────────────────────────────────
    const allBeats = active ? active.beats : coldBeats(runId, world);
    const beats = allBeats.filter((b) => b.seq > afterSeq);
    const latestSeq = allBeats.length ? allBeats[allBeats.length - 1].seq : 0;

    const streams: Record<string, LabStreamLine[]> = {};
    for (const beat of allBeats) {
        if (beat.isPrivate) continue; // 窗內事 never floats onto the public scroll
        if (beat.kind === 'move') continue; // 移步是痕跡，不是題字
        const list = (streams[beat.sceneId] ??= []);
        list.unshift({
            key: `b${beat.seq}`,
            text: beat.text,
            speakerName: beat.name,
        });
        if (list.length > 5) list.pop();
    }

    const latestBeatByChar = new Map<string, LabLiveBeat>();
    for (const beat of allBeats) {
        if (beat.kind === 'move' || beat.characterId === '__world__') continue;
        latestBeatByChar.set(beat.characterId, beat);
    }
    const activeTickScenes = new Set(
        allBeats.filter((b) => b.tick === clock.currentTick).map((b) => b.sceneId),
    );

    // ── scenes (engine scene id `s${i}` ↔ preset scene index i) ────────────
    const rawScenes = raw.scenes ?? [];
    const presentByScene = new Map<string, string[]>();
    for (const [charId, sceneId] of Object.entries(w.roster)) {
        const list = presentByScene.get(sceneId) ?? [];
        list.push(charId);
        presentByScene.set(sceneId, list);
    }
    const scenes: Scene[] = w.scenes.map((scene) => {
        const index = Number(scene.id.slice(1));
        const rawScene = Number.isFinite(index) ? rawScenes[index] : undefined;
        const locationId = rawLocations.length
            ? `loc${Math.min(Math.max(rawScene?.location_index ?? 0, 0), rawLocations.length - 1)}`
            : 'loc0';
        const ghost = streams[scene.id]?.[0];
        return {
            id: scene.id,
            sagaId: w.sagaId,
            locationId,
            name: scene.name,
            description: assetNoteFor('scene', scene.name) ?? scene.description ?? '',
            posX: rawScene?.pos_x,
            posY: rawScene?.pos_y,
            privacyLevel: Math.min(Math.max(scene.privacyLevel, 0), 5) as Scene['privacyLevel'],
            currentCharacterIds: presentByScene.get(scene.id) ?? [],
            imageUrl: assetUrlFor('scene', scene.name),
            ghostQuotes: ghost ? [{ characterId: '', text: ghost.text }] : undefined,
            performance: activeTickScenes.has(scene.id)
                ? { title: '戲正上演', startedAt: '' }
                : undefined,
        };
    });

    // ── characters ─────────────────────────────────────────────────────────
    // 錢：僅掛 economy 季框的卷才有；available 是「分」（subunit）整數字串。
    const economy = w.economy;
    const moneyOf = (id: string): string | undefined => {
        const acct = economy?.state.accounts[id];
        if (!acct) return undefined;
        const per = BigInt(Math.max(1, economy!.subunitsPerUnit || 100));
        let sub: bigint;
        try { sub = BigInt(acct.available); } catch { return undefined; }
        const neg = sub < 0n;
        const abs = neg ? -sub : sub;
        const unit = economy!.unitLabel || '圓';
        const body = abs % per === 0n ? `${abs / per} ${unit}` : `${abs / per} ${unit} ${abs % per} 分`;
        return neg ? `欠 ${body}` : body;
    };
    // 物品欄：carriedBy===此人、未毀之物件。
    const worldObjects = w.objects ?? [];
    const carryingOf = (id: string) =>
        worldObjects
            .filter((o) => o.carriedBy === id && o.visibility !== 'destroyed')
            .map((o) => ({ id: o.id, label: o.label, state: o.state, hidden: o.visibility === 'hidden', origin: o.origin }));

    const roleById = new Map(w.cast.map((m) => [m.id, m.role]));
    // The numeric bond underlay, if the world carries one (empty Map otherwise).
    const bondGraph = world.bondGraph();
    const bondKey = (from: string, to: string) => `${from}→${to}`; // mirrors bond-graph.ts key()
    // 羈絆：this member → every significant other, UNIONing the narrative view
    // lines with the mechanical edge graph so a seeded edge (no line) and a view
    // (no edge) both surface. `warmth` prefers the continuous bond value (0..1)
    // when the graph carries the pair, else the coarse tone-bucketed welcome.
    const bondsOf = (member: (typeof w.cast)[number]) => {
        const otherIds = new Set<string>([
            ...Object.keys(member.relationshipView),
            ...Object.keys(w.edges[member.id] ?? {}),
        ]);
        otherIds.delete(member.id); // never self
        return [...otherIds]
            .map((oId) => {
                const otherName = world.nameById(oId);
                return {
                    id: oId,
                    name: otherName,
                    role: roleById.get(oId),
                    portraitUrl: assetUrlFor('character', otherName),
                    tone: w.edges[member.id]?.[oId]?.tone,
                    warmth: bondGraph.has(bondKey(member.id, oId))
                        ? bondOf(bondGraph, member.id, oId)
                        : world.welcome(member.id, oId),
                    warmthBack: bondGraph.has(bondKey(oId, member.id))
                        ? bondOf(bondGraph, oId, member.id)
                        : world.welcome(oId, member.id),
                    line: member.relationshipView[oId],
                    // 相許 badge — lit once the world recognises this pair as established.
                    established: world.isEstablished(member.id, oId),
                };
            })
            .sort((a, b) => b.warmth - a.warmth);
    };

    const characters: LabCharacterLive[] = w.cast.map((member) => {
        const sceneId = w.roster[member.id] ?? '';
        const latest = latestBeatByChar.get(member.id);
        return {
            id: member.id,
            name: member.name,
            role: member.role,
            gender: member.gender,
            age: member.age,
            portraitUrl: assetUrlFor('character', member.name),
            sceneId,
            sceneName: world.sceneNameById(sceneId),
            fatigue: member.state.fatigue,
            hunger: member.state.hunger,
            mood: member.state.mood,
            wants: world.liveWantsOf(member.id).map((want) => ({
                desc: want.desc,
                layer: want.layer,
                tension: Math.round(want.weight * (1 - want.sat) * 100) / 100,
                target: want.target,
            })),
            latestLine: latest
                ? { text: latest.text, clock: latest.clock, day: latest.day, sceneName: latest.sceneName }
                : undefined,
            description: assetNoteFor('character', member.name) ?? member.persona,
            coreIdentity: member.coreIdentity,
            secret: member.secret,
            plan: member.plan,
            bonds: bondsOf(member),
            gallery: listGallery('character', member.name).map(({ url, type }) => ({ url, type })),
            money: moneyOf(member.id),
            carrying: carryingOf(member.id),
        };
    });

    // ── saga ───────────────────────────────────────────────────────────────
    const partOfDay = toDayPart(clock.partOfDay);
    const saga: Saga = {
        id: w.sagaId,
        name: raw.saga?.name ?? raw.label ?? meta.title,
        description: raw.saga?.description ?? '',
        currentDay: clock.day,
        castIds: w.cast.map((member) => member.id),
        premise: w.sagaPremise,
        coveredLocationIds: locations.map((location) => location.id),
        worldTime: {
            day: clock.day,
            partOfDay,
            label: `第${clock.day}日 · ${clock.partOfDay}`,
        },
    };

    // ── 劇本產出 ───────────────────────────────────────────────────────────
    const production: LabProductionLive | undefined = w.production
        ? {
            title: w.production.title,
            status: w.production.status,
            contributors: w.production.contributors.map((id) => ({ id, name: world.nameById(id) })),
            scriptFragments: w.production.scriptFragments.length,
            effort: totalEffort(w.production),
            threshold: PRODUCTION.rehearsalThreshold,
            premieredDay: w.production.premieredDay,
            timeline: w.production.timeline.slice(-6),
        }
        : undefined;

    return {
        runId,
        meta,
        phase: active?.phase ?? 'idle',
        pendingTicks: active?.pendingTicks ?? 0,
        lastError: active?.lastError,
        provider: active?.provider,
        model: active?.model,
        epoch: active?.epoch ?? 'cold',
        seq: latestSeq,
        clock: {
            day: clock.day,
            currentTick: clock.currentTick,
            tickOfDay: clock.tickOfDay,
            ticksPerDay: clock.ticksPerDay,
            partOfDay: clock.partOfDay,
        },
        saga,
        locations,
        scenes,
        artByLocationId,
        characters,
        streams,
        beats,
        logs: (active?.logs ?? []).slice(-40),
        production,
    };
}

/** Ensure PARTS_OF_DAY stays imported (documents the 六時辰 rhythm source). */
export const LAB_PARTS_OF_DAY = PARTS_OF_DAY;

export function runExistsOnDisk(runId: string): boolean {
    return fs.existsSync(path.join(runDir(runId), 'lab-run.json'));
}
