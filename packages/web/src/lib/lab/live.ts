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
import { bondOf, PARTS_OF_DAY, PRODUCTION, standingBoard, totalEffort, WorldState, type ProductionStatus, type RawPreset } from '@endless-story/engine';
import type { DayPart, Saga, SagaLocation, Scene } from '@endless-story/shared';
import { SPRING_SNOW_MIRROR, formatStoryDate, storyDateOfDayIndex } from '@endless-story/shared/world-clock';
import { labManager } from './manager';
import { runDir } from './paths';
import { readRunMeta } from './store';
import { readSeedRaw } from './seeds';
import { assetNoteFor, assetUrlFor, listGallery } from './assets';
import { beatsFromTickRecords, listArchiveEntries, readArchiveEntry, tailInterludeRecords, tailTickRecords } from './artifacts';
import type { LabCharacterLive, LabInterludeLive, LabLiveBeat, LabPrayer, LabRunMeta, LabRunPhase, LabSceneObject, LabTickRecord } from './types';

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
    /** 願牆 — spoken prayers voiced at temples (神明 前), newest first. Distinct
     *  from the internal 心事 on the 願榜 (`characters[].wants`). Empty when the
     *  world carries no temple / nobody has prayed. */
    prayers: LabPrayer[];
    /** 物在世 — every registered, non-destroyed world object with its current
     *  placement (scene/container or carried), for the scene 內頁 facets. */
    objects: LabSceneObject[];
    /** Per-scene recent public lines (newest first) for the 題字流. */
    streams: Record<string, LabStreamLine[]>;
    /** Beats newer than the requested cursor (empty on cold runs). */
    beats: LabLiveBeat[];
    /** Log tail for the operator console. */
    logs: Array<{ ts: number; line: string }>;
    /** 劇本產出 current state — present only when the flag is on and a production
     *  has begun. Drives the run page's 製作中 panel. */
    production?: LabProductionLive;
    /** 外力與世情 — what the deck, the director and the cast have MADE HAPPEN,
     *  plus the run's vitals. Absent when the run carries no deck: a scroll with
     *  no external-push layer has nothing to show here, and an empty panel would
     *  read as「壞了」rather than as「這一卷沒掛牌組」. */
    pressure?: LabPressureLive;
    /** 時間法則——'tick'（排演拍，多數卷）或 'mirror'（鏡像時間）。 */
    timeMode: 'tick' | 'mirror';
    /** 「民國十五年八月五日」——mirror 卷才有，由 clock.day 推得（顯示層投影，
     *  不取樣牆鐘；鐘面的即時走秒交給 `StoryClock` 元件自己）。 */
    dateLabel?: string;
    /** 「活著」開關現況——僅 mirror 卷有意義；tick 卷恆為 false。 */
    alive: boolean;
    /** 最近幾折（喚醒層 P1），newest last——供折子卡消費。tick 卷／從未捎過話
     *  的 mirror 卷是空陣列，不是「壞了」。 */
    interludes: LabInterludeLive[];
}

/** One thing that happened TO the world (or that somebody did to it). */
export interface LabPressurePlay {
    day: number;
    tick: number;
    cardId: string;
    label: string;
    chosenBy: 'director' | 'deadline' | 'operator' | 'director-proposed' | 'character';
    /** 世情動作 only — who set it in motion. */
    actorName?: string;
    targetNames: string[];
    /** the director's own one-line reason (audit only). */
    rationale?: string;
    irreversible: number;
    lines: string[];
}

/** Where somebody stands with the room — shown only for people it has moved for. */
export interface LabStandingRow {
    characterId: string;
    name: string;
    cold: number;
    warm: number;
    renown: number;
    /** derived, never stored: a supermajority cold, no warm face, a name that
     *  draws nothing. See engine `core/standing.ts`. */
    sociallyDead: boolean;
}

export interface LabPressureLive {
    deckId: string;
    /** newest first. */
    plays: LabPressurePlay[];
    /** how many of each kind, over the whole run so far. */
    tally: { deadline: number; director: number; proposed: number; character: number; operator: number };
    /** 自撰遭駁 — the director reached past what the engine allows, and how far. */
    refused: Array<{ day: number; label: string; problems: string[] }>;
    /** the most recent tick's 生命體徵, when one has been computed. */
    vitals?: NonNullable<LabTickRecord['vitals']>;
    /** only people some of the room has actually gone cold on. */
    standing: LabStandingRow[];
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

/** 冷卷的折子回填——與 `coldBeats` 同一姿態：manager 沒把這一卷開在記憶體裡時，
 *  直接讀 `interludes.jsonl` 尾巴，讓折子卡在冷卷也不是空的。 */
function coldInterludes(runId: string): Array<Omit<LabInterludeLive, 'portraitUrl'>> {
    return tailInterludeRecords(runId, 40).map((r) => ({
        id: r.id,
        characterId: r.characterId,
        name: r.name,
        day: r.day,
        tick: r.tick,
        partOfDay: r.partOfDay,
        realMs: r.realMs,
        stimuli: r.stimuli.map((s) => ({ text: s.text, kind: s.kind })),
        response: r.response,
        ...(r.memoryNote ? { memoryNote: r.memoryNote } : {}),
    }));
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
    // 租金：resolve a lease's rent bill → 圓 amount (divide 分 by subunitsPerUnit).
    // undefined when the bill is absent or the world carries no economy.
    const rentSubunitsPerUnit = Math.max(1, economy?.subunitsPerUnit || 100);
    const rentYuanOf = (rentBillId?: string): number | undefined => {
        if (!rentBillId || !economy) return undefined;
        const bill = (economy.bills ?? []).find((b) => b.id === rentBillId);
        if (!bill) return undefined;
        try { return Number(BigInt(bill.amountSubunits)) / rentSubunitsPerUnit; } catch { return undefined; }
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
                    // 相識分寸: how THIS member refers to the other, at their own
                    // resolution of acquaintance. Flag off ⇒ perceivedName === name,
                    // acquaint === 'named' (no chip, no visible change).
                    perceivedName: world.perceivedName(member.id, oId),
                    acquaint: world.acquaintLevel(member.id, oId),
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
                id: want.id,
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
            // 口碑：只在此卷確實種下名頭時才掛（renownOf 自帶 0.5 底、selfRegardOf 回落
            // 至 renown），免得無名頭的卷每個人都顯「小有名氣」。
            ...(member.renown !== undefined
                ? { renown: world.renownOf(member.id), selfRegard: world.selfRegardOf(member.id) }
                : {}),
            bonds: bondsOf(member),
            // 技藝 — the character's authored skills (empty when none).
            skills: (member.skills ?? []).map((s) => ({ name: s.name, kind: s.kind, style: s.style, level: s.level, note: s.note })),
            gallery: listGallery('character', member.name).map(({ url, type }) => ({ url, type })),
            money: moneyOf(member.id),
            carrying: carryingOf(member.id),
            // 持鑰 — the 訪問權限 keys this character holds (as a guest) + who holds a
            // key to their own home. Names/portraits resolved from the cast.
            keys: {
                holding: world.keysHeldBy(member.id).map((k) => ({
                    sceneId: k.sceneId,
                    sceneName: world.sceneNameById(k.sceneId),
                    kind: k.kind,
                })),
                myPlaceHolders: (w.homeByChar[member.id] ? world.keyHoldersOf(w.homeByChar[member.id]) : []).map((h) => {
                    const holderName = world.nameById(h.charId);
                    return { id: h.charId, name: holderName, portraitUrl: assetUrlFor('character', holderName), kind: h.kind };
                }),
            },
            // 居所 — the dwelling this character calls home + their tenure of it,
            // deed-aware via ownersOf (自有屋主／租住／公處借宿). Omitted when homeless.
            // A 'rent' tenure surfaces its 租金 when the registered lease bears one.
            home: (() => {
                const homeId = w.homeByChar[member.id];
                if (!homeId) return undefined;
                const owners = world.ownersOf(homeId);
                const tenure: 'own' | 'rent' | 'public' = owners.length === 0 ? 'public' : owners.includes(member.id) ? 'own' : 'rent';
                const base = { sceneName: world.sceneNameById(homeId), tenure, ownerNames: owners.map((id) => world.nameById(id)) };
                if (tenure === 'rent') {
                    const rentYuan = rentYuanOf(w.leases?.[homeId]?.rentBillId);
                    if (rentYuan !== undefined) return { ...base, rentYuan };
                }
                return base;
            })(),
            // 收租 — the rentals this character is the landlord of (leases they own).
            rentalsOut: (() => {
                const rentals = world.rentalsBy(member.id);
                if (!rentals.length) return undefined;
                return rentals.map((r) => ({
                    sceneName: world.sceneNameById(r.sceneId),
                    tenantName: world.nameById(r.tenantId),
                    rentYuan: rentYuanOf(r.rentBillId),
                }));
            })(),
        };
    });

    // ── 願牆 (spoken prayers at temples) ─────────────────────────────────────
    // newest-first; portrait resolves by the prayer-giver's name (圖庫). The
    // engine `Prayer.sceneName` is the temple; the internal 心願 rides along as
    // wantDesc/layer for the plaque's subtle sub-line.
    const prayers: LabPrayer[] = [...(w.prayers ?? [])]
        .sort((a, b) => b.tick - a.tick || b.day - a.day)
        .map((p) => ({
            id: p.id,
            characterId: p.characterId,
            name: p.name,
            portraitUrl: assetUrlFor('character', p.name),
            day: p.day,
            tick: p.tick,
            clock: p.clock,
            templeName: p.sceneName,
            fulfilled: p.fulfilledTick !== undefined,
            owner: p.source === 'owner' || undefined,
            text: p.text,
            wantDesc: p.wantDesc,
            layer: p.layer,
        }));

    // ── 物在世 (world objects with placement) ───────────────────────────────
    const objects: LabSceneObject[] = (w.objects ?? [])
        .filter((o) => o.visibility !== 'destroyed')
        .map((o) => ({
            id: o.id,
            label: o.label,
            sceneId: o.sceneId,
            sceneName: world.sceneNameById(o.sceneId),
            container: o.container,
            state: o.state,
            carriedBy: o.carriedBy,
            carriedByName: o.carriedBy ? world.nameById(o.carriedBy) : undefined,
            visibility: o.visibility as 'visible' | 'hidden',
        }));

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

    // ── 外力與世情 ─────────────────────────────────────────────────────────
    // Read from the tick records rather than from `directorLog`: the log holds
    // card IDS, and the label of an authored card lives in the deck file, not in
    // the world. The records already carry the rendered label, the actor and the
    // outcome lines, and they are written for both active and cold runs — one
    // source, no deck load, no special case.
    const pressure = w.deckId ? buildPressure(runId, world, w.deckId) : undefined;

    // ── 時間法則 / 折子 (喚醒層 P1) ───────────────────────────────────────────
    const timeMode: 'tick' | 'mirror' = meta.config.timeMode === 'mirror' ? 'mirror' : 'tick';
    // 日期標籤是「日序」的顯示層投影（storyDateOfDayIndex），不取樣牆鐘——冷卷
    // 讀 world.json 時 clock.day 可能落後於真實此刻，鐘面走多快是 StoryClock
    // 元件自己的事，這裡只誠實地說「這一卷此刻是第幾日」。
    const dateLabel = timeMode === 'mirror' && meta.epochRealMs != null
        ? formatStoryDate(storyDateOfDayIndex(clock.day, meta.epochRealMs, SPRING_SNOW_MIRROR))
        : undefined;
    const interludeRows = active ? active.interludes : coldInterludes(runId);
    const interludes: LabInterludeLive[] = interludeRows.map((r) => ({
        ...r,
        portraitUrl: assetUrlFor('character', r.name),
    }));

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
        prayers,
        objects,
        streams,
        beats,
        logs: (active?.logs ?? []).slice(-40),
        production,
        pressure,
        timeMode,
        ...(dateLabel ? { dateLabel } : {}),
        alive: meta.alive === true,
        interludes,
    };
}

/** How many recent plays the panel shows. Enough to read the last day or two at
 *  a glance; the full audit trail is the diagnostics export's job. */
const PRESSURE_PLAY_WINDOW = 12;
/** How deep to scan for the tally + refusals. Bounded so a long run's panel
 *  stays cheap; the export is where the complete history lives. */
const PRESSURE_SCAN_TICKS = 240;

/**
 * The tick-record scan is memoised on the log file's own size+mtime.
 *
 * `ticks.jsonl` is append-only and the live endpoint polls every couple of
 * seconds; re-reading and JSON-parsing the whole file each time would put a
 * multi-megabyte parse on the poll path of a long run. Keyed on the file's
 * stat rather than a timer, so it is exact rather than merely fresh-ish.
 *
 * 處境 is deliberately NOT cached: it is derived live from edges/bonds/renown,
 * which move without the log file changing at all.
 */
const pressureCache = new Map<string, { key: string; value: Omit<LabPressureLive, 'deckId' | 'standing'> }>();

function scanPressureRecords(runId: string): Omit<LabPressureLive, 'deckId' | 'standing'> {
    let key = 'missing';
    try {
        const stat = fs.statSync(path.join(runDir(runId), 'ticks.jsonl'));
        key = `${stat.size}:${stat.mtimeMs}`;
    } catch {
        // no log yet — fall through and produce an empty scan
    }
    const cached = pressureCache.get(runId);
    if (cached?.key === key) return cached.value;

    const records = tailTickRecords(runId, PRESSURE_SCAN_TICKS);
    const tally = { deadline: 0, director: 0, proposed: 0, character: 0, operator: 0 };
    const plays: LabPressurePlay[] = [];
    const refused: LabPressureLive['refused'] = [];
    let vitals: LabPressureLive['vitals'];

    for (const record of records) {
        if (record.vitals) vitals = record.vitals;
        for (const row of record.proposalsRefused ?? []) refused.push({ day: record.day, ...row });
        for (const card of record.cardsPlayed ?? []) {
            if (card.chosenBy === 'director-proposed') tally.proposed += 1;
            else if (card.chosenBy in tally) tally[card.chosenBy as keyof typeof tally] += 1;
            plays.push({ day: record.day, tick: record.tick, ...card });
        }
    }
    plays.reverse(); // newest first — the panel reads top-down as「剛剛發生了什麼」

    const value = {
        plays: plays.slice(0, PRESSURE_PLAY_WINDOW),
        tally,
        refused: refused.slice(-4),
        ...(vitals ? { vitals } : {}),
    };
    pressureCache.set(runId, { key, value });
    return value;
}

function buildPressure(runId: string, world: WorldState, deckId: string): LabPressureLive {
    // 處境 is DERIVED live from edges/bonds/renown (there is no stored ledger),
    // so it is always current even on a cold run reading world.json.
    const standing = standingBoard(world)
        .filter((row) => row.cold > 0)
        .sort((a, b) => Number(b.sociallyDead) - Number(a.sociallyDead) || b.cold - a.cold || a.renown - b.renown)
        .slice(0, 8)
        .map((row) => ({
            characterId: row.characterId,
            name: world.nameById(row.characterId),
            cold: row.cold,
            warm: row.warm,
            renown: row.renown,
            sociallyDead: row.sociallyDead,
        }));

    return { deckId, ...scanPressureRecords(runId), standing };
}

/** Ensure PARTS_OF_DAY stays imported (documents the 六時辰 rhythm source). */
export const LAB_PARTS_OF_DAY = PARTS_OF_DAY;

export function runExistsOnDisk(runId: string): boolean {
    return fs.existsSync(path.join(runDir(runId), 'lab-run.json'));
}
