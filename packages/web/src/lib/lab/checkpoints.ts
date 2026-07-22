/**
 * Tick checkpoints — the run's world history, one frozen world.json per
 * completed tick, written by the manager right after each tick commits:
 *
 *   runs/<id>/state/checkpoints/t<tick·6位>/world.json
 *
 * `world.json` alone is overwrite-per-tick (only "now" exists); checkpoints are
 * what make 時間快照 possible — 演員訪談室 restores "the world right after tick
 * N" via the ordinary `WorldState.restore(dir)` (each checkpoint is a directory
 * holding exactly one world.json, so the engine's loader works unchanged).
 *
 * Honest limits: a run created before this layer has no history — only its
 * current state is visitable. Checkpoints are best-effort copies; a failed copy
 * logs and never breaks the tick.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PARTS_OF_DAY, WorldState } from '@endless-story/engine';
import { runDir } from './paths';

const CHECKPOINT_DIR = 'checkpoints';
const CHECKPOINT_NAME = /^t(\d{6})$/;

export function checkpointDirName(tick: number): string {
    return `t${String(Math.max(0, Math.floor(tick))).padStart(6, '0')}`;
}

export function checkpointsRoot(runId: string): string {
    return path.join(runDir(runId), 'state', CHECKPOINT_DIR);
}

export function checkpointDir(runId: string, tick: number): string {
    return path.join(checkpointsRoot(runId), checkpointDirName(tick));
}

/** Copy the just-committed state/world.json as the checkpoint for `tick`.
 *  Called by the manager AFTER the tick transaction committed. Best-effort:
 *  returns an error message instead of throwing (a checkpoint must never
 *  break a run). */
export function writeCheckpoint(runId: string, tick: number): string | null {
    try {
        const src = path.join(runDir(runId), 'state', 'world.json');
        const dir = checkpointDir(runId, tick);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(src, path.join(dir, 'world.json'));
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

export interface CheckpointEntry {
    tick: number;
    /** Day / part-of-day of the COMPLETED tick (the moment just lived). */
    day: number;
    partOfDay: string;
    label: string;
}

/** The lived moment of a completed tick, derived purely from the tick number
 *  (same six-part palette mapping the cold-scroll backfill uses). */
export function momentOfTick(tick: number, ticksPerDay: number): { day: number; partOfDay: string } {
    const tpd = Math.max(1, ticksPerDay);
    const tickOfDay = ((tick % tpd) + tpd) % tpd;
    const part = PARTS_OF_DAY[Math.min(PARTS_OF_DAY.length - 1, Math.floor((tickOfDay / tpd) * PARTS_OF_DAY.length))];
    return { day: Math.floor(tick / tpd) + 1, partOfDay: part };
}

export function listCheckpoints(runId: string, ticksPerDay: number): CheckpointEntry[] {
    let names: string[];
    try {
        names = fs.readdirSync(checkpointsRoot(runId));
    } catch {
        return [];
    }
    const out: CheckpointEntry[] = [];
    for (const name of names) {
        const match = CHECKPOINT_NAME.exec(name);
        if (!match) continue;
        const tick = Number(match[1]);
        if (!fs.existsSync(path.join(checkpointsRoot(runId), name, 'world.json'))) continue;
        const { day, partOfDay } = momentOfTick(tick, ticksPerDay);
        out.push({ tick, day, partOfDay, label: `第${day}日 · ${partOfDay}後` });
    }
    return out.sort((a, b) => a.tick - b.tick);
}

export function hasCheckpoint(runId: string, tick: number): boolean {
    return fs.existsSync(path.join(checkpointDir(runId, tick), 'world.json'));
}

/** Restore the frozen world of a checkpoint (read-only use by callers). */
export function restoreCheckpoint(runId: string, tick: number): WorldState {
    const dir = checkpointDir(runId, tick);
    if (!WorldState.exists(dir)) {
        throw new Error(`此卷在拍 ${tick} 沒有時光快照（checkpoint 自本功能上線後的走拍才會留存）`);
    }
    return WorldState.restore(dir);
}
