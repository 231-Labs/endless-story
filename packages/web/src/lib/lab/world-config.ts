/**
 * World-physics configuration — the off-chain analogue of "configuring the
 * contract objects" from the UI. In the lab the physical world IS the world
 * state: contested resources (drama stakes), registered WorldObjects, clock-
 * bound scheduled events and scene physics (privacy / capacity).
 *
 * First-principles rule: edits are only legal while the run is idle (between
 * ticks), go through WorldState's own invariants, and snapshot immediately —
 * so a config change is itself a durable, versioned world fact, never a
 * prompt-side whisper.
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { WorldState, type WorldObject } from '@endless-story/engine';
import { labManager } from './manager';
import { runDir } from './paths';
import type { LabWorldConfig } from './types';

export type WorldConfigOp =
    | { op: 'set-resources'; resources: Array<{ label: string; statement?: string }> }
    | {
        op: 'upsert-object';
        object: {
            id?: string;
            label: string;
            sceneId: string;
            aliases?: string[];
            portable?: boolean;
            visibility?: 'visible' | 'hidden';
            container?: string;
            state?: string;
            knownByIds?: string[];
        };
    }
    | { op: 'remove-object'; objectId: string }
    /** 轉手／贈物：operator 把一件物直接交到某角色手上（或 null＝放下）。
     *  這是 god-move —— 玩家替角色贈物；LLM 實錄的 carrierName 交遞是另一路。 */
    | { op: 'give-object'; objectId: string; toCharacterId: string | null }
    | {
        op: 'add-scheduled-event';
        event: { inTicks: number; sceneId: string; clock?: string; text: string; visibility?: 'public' | 'private'; witnessIds?: string[] };
    }
    | { op: 'remove-scheduled-event'; eventId: string }
    | { op: 'set-scene'; sceneId: string; privacyLevel?: number; capacity?: number };

interface WorldHandle {
    world: WorldState;
    persist: () => void;
}

/** Prefer the active in-memory world; otherwise edit the snapshot on disk. */
function openWorldForEdit(runId: string): WorldHandle {
    const manager = labManager();
    manager.assertIdle(runId);
    const stateDir = path.join(runDir(runId), 'state');
    const active = manager.get(runId);
    if (active) {
        return { world: active.world, persist: () => active.world.snapshot(stateDir) };
    }
    if (!WorldState.exists(stateDir)) throw new Error('run has no world snapshot yet');
    const world = WorldState.restore(stateDir);
    return { world, persist: () => world.snapshot(stateDir) };
}

export function readWorldConfig(runId: string): LabWorldConfig {
    const manager = labManager();
    const active = manager.get(runId);
    const stateDir = path.join(runDir(runId), 'state');
    const world = active?.world ?? (WorldState.exists(stateDir) ? WorldState.restore(stateDir) : null);
    if (!world) throw new Error('run has no world snapshot yet');
    const w = world.data;
    const delivered = new Set(w.deliveredScheduledEventIds ?? []);
    return {
        contestedResources: w.contestedResources.map((r) => ({ label: r.label, statement: r.statement })),
        objects: (w.objects ?? []).map((object) => ({
            id: object.id,
            label: object.label,
            sceneId: object.sceneId,
            sceneName: world.sceneNameById(object.sceneId),
            portable: object.portable,
            visibility: object.visibility,
            container: object.container,
            carriedBy: object.carriedBy,
            carriedByName: object.carriedBy ? world.nameById(object.carriedBy) : undefined,
            state: object.state,
            knownBy: object.knownBy.map((id) => world.nameById(id)),
            origin: object.origin,
        })),
        scheduledEvents: (w.scheduledEvents ?? []).map((event) => ({
            id: event.id,
            atTick: event.atTick,
            sceneId: event.sceneId,
            sceneName: world.sceneNameById(event.sceneId),
            clock: event.clock,
            text: event.text,
            visibility: event.visibility,
            witnessIds: event.witnessIds,
            delivered: delivered.has(event.id),
        })),
        scenes: w.scenes.map((scene) => ({
            id: scene.id,
            name: scene.name,
            privacyLevel: scene.privacyLevel,
            capacity: scene.capacity,
        })),
        hasEconomy: Boolean(w.economy),
    };
}

export function applyWorldConfigOp(runId: string, operation: WorldConfigOp): LabWorldConfig {
    const { world, persist } = openWorldForEdit(runId);
    const w = world.data;

    switch (operation.op) {
        case 'set-resources': {
            const labels = new Set<string>();
            for (const resource of operation.resources) {
                if (!resource.label.trim()) throw new Error('resource label cannot be empty');
                if (labels.has(resource.label)) throw new Error(`duplicate resource label: ${resource.label}`);
                labels.add(resource.label);
            }
            w.contestedResources = operation.resources.map((r) => ({ label: r.label.trim(), statement: r.statement?.trim() || undefined }));
            break;
        }
        case 'upsert-object': {
            const spec = operation.object;
            if (!world.sceneById(spec.sceneId)) throw new Error(`unknown scene: ${spec.sceneId}`);
            if (!spec.label.trim()) throw new Error('object label cannot be empty');
            const objects = (w.objects ??= []);
            const allIds = w.cast.map((member) => member.id);
            const knownBy = spec.knownByIds?.length ? spec.knownByIds : allIds;
            for (const id of knownBy) {
                if (!world.castById(id)) throw new Error(`unknown character in knownBy: ${id}`);
            }
            const existing = spec.id ? objects.find((o) => o.id === spec.id) : undefined;
            if (existing) {
                existing.label = spec.label.trim();
                existing.aliases = [...new Set([spec.label.trim(), ...(spec.aliases ?? existing.aliases)])];
                existing.sceneId = spec.sceneId;
                existing.portable = spec.portable ?? existing.portable;
                if (spec.visibility) existing.visibility = spec.visibility;
                existing.container = spec.container?.trim() || undefined;
                existing.state = spec.state?.trim() || undefined;
                existing.knownBy = [...new Set(knownBy)];
                existing.version += 1;
            } else {
                // Globally-unique, stable id — survives forks byte-for-byte and
                // never collides across runs/process restarts (the old
                // timestamp+process-counter scheme could repeat after a restart).
                const id = spec.id?.trim() || `lab-obj-${randomUUID()}`;
                if (objects.some((o) => o.id === id)) throw new Error(`duplicate object id: ${id}`);
                const object: WorldObject = {
                    id,
                    label: spec.label.trim(),
                    aliases: [...new Set([spec.label.trim(), ...(spec.aliases ?? [])])],
                    sceneId: spec.sceneId,
                    portable: spec.portable !== false,
                    visibility: spec.visibility ?? 'visible',
                    container: spec.container?.trim() || undefined,
                    state: spec.state?.trim() || undefined,
                    version: 0,
                    knownBy: [...new Set(knownBy)],
                    origin: { runId, day: w.clock.day, tick: w.clock.currentTick, source: 'lab' },
                };
                objects.push(object);
            }
            break;
        }
        case 'remove-object': {
            const objects = w.objects ?? [];
            const index = objects.findIndex((o) => o.id === operation.objectId);
            if (index < 0) throw new Error(`object not found: ${operation.objectId}`);
            objects.splice(index, 1);
            break;
        }
        case 'give-object': {
            const object = (w.objects ?? []).find((o) => o.id === operation.objectId);
            if (!object) throw new Error(`object not found: ${operation.objectId}`);
            if (operation.toCharacterId === null) {
                object.carriedBy = undefined; // 放下 —— 留在原場景
            } else {
                if (!world.castById(operation.toCharacterId)) throw new Error(`unknown character: ${operation.toCharacterId}`);
                object.carriedBy = operation.toCharacterId;
                const carrierScene = w.roster[operation.toCharacterId];
                if (carrierScene) object.sceneId = carrierScene; // 物隨人走
            }
            object.version += 1;
            break;
        }
        case 'add-scheduled-event': {
            const spec = operation.event;
            if (!world.sceneById(spec.sceneId)) throw new Error(`unknown scene: ${spec.sceneId}`);
            if (!spec.text.trim()) throw new Error('scheduled event text cannot be empty');
            if (!Number.isInteger(spec.inTicks) || spec.inTicks < 0) throw new Error('inTicks must be a non-negative integer');
            const witnessIds = spec.witnessIds?.length ? spec.witnessIds : w.cast.map((member) => member.id);
            for (const id of witnessIds) {
                if (!world.castById(id)) throw new Error(`unknown witness: ${id}`);
            }
            const scheduled = (w.scheduledEvents ??= []);
            const id = `lab-ev-${randomUUID()}`;
            scheduled.push({
                id,
                atTick: w.clock.currentTick + spec.inTicks,
                sceneId: spec.sceneId,
                clock: spec.clock?.trim() || undefined,
                text: spec.text.trim(),
                visibility: spec.visibility ?? 'public',
                witnessIds: [...new Set(witnessIds)],
            });
            break;
        }
        case 'remove-scheduled-event': {
            const scheduled = w.scheduledEvents ?? [];
            const delivered = new Set(w.deliveredScheduledEventIds ?? []);
            const index = scheduled.findIndex((event) => event.id === operation.eventId);
            if (index < 0) throw new Error(`scheduled event not found: ${operation.eventId}`);
            if (delivered.has(operation.eventId)) throw new Error('a delivered event is canon — it cannot be removed');
            scheduled.splice(index, 1);
            break;
        }
        case 'set-scene': {
            const scene = world.sceneById(operation.sceneId);
            if (!scene) throw new Error(`unknown scene: ${operation.sceneId}`);
            if (operation.privacyLevel !== undefined) {
                if (!Number.isInteger(operation.privacyLevel) || operation.privacyLevel < 0 || operation.privacyLevel > 5) {
                    throw new Error('privacyLevel must be an integer 0–5');
                }
                scene.privacyLevel = operation.privacyLevel;
            }
            if (operation.capacity !== undefined) {
                if (!Number.isInteger(operation.capacity) || operation.capacity < 1) {
                    throw new Error('capacity must be a positive integer');
                }
                scene.capacity = operation.capacity;
            }
            break;
        }
    }

    persist();
    return readWorldConfig(runId);
}
