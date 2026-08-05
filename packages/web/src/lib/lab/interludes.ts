/**
 * 捎話 — push one 折子 stimulus onto a run's world (`WorldStateData.pendingStimuli`).
 *
 * Same idle/running discipline as 注夢 (`world-config.ts`'s `injectOrQueueDream`):
 * 捎話 must land at ANY moment, including mid-tick — that is the whole point of
 * an "alive" scroll. A running tick (or a running 折子 batch — both share
 * `phase === 'running'`, see manager.ts's `loop`) OWNS the world snapshot right
 * now, so a stimulus arriving then is pushed into the LIVE in-memory world only
 * (no direct file write); it rides out on that very operation's own snapshot at
 * its boundary. An idle run applies + persists immediately. Either way this
 * never bypasses the run's single-writer discipline to write world.json itself
 * — see AGENT_WAKE_LAYER.md §五 and manager.ts's `pendingTicks`/`pendingInterlude`
 * queue this same run directory serializes through.
 */

import * as path from 'node:path';
import { WorldState, type InterludeStimulus } from '@endless-story/engine';
import { labManager } from './manager';
import { runDir } from './paths';

export interface QueueStimulusOutcome {
    queued: number;
}

export function queueStimulus(runId: string, characterId: string, text: string): QueueStimulusOutcome {
    const body = text.trim();
    if (!body) throw new Error('捎話不能是空的');
    const stateDir = path.join(runDir(runId), 'state');
    const atRealMs = Date.now();
    // 確定性構造：同一毫秒兩人各自被戳也不撞號（與引擎折子 id 同一紀律）。
    const stimulus: InterludeStimulus = {
        id: `stim-${atRealMs}-${characterId}`,
        characterId,
        kind: 'note',
        text: body,
        atRealMs,
    };

    const active = labManager().get(runId);
    if (active) {
        if (!active.world.castById(characterId)) throw new Error(`unknown character: ${characterId}`);
        const queue = (active.world.data.pendingStimuli ??= []);
        queue.push(stimulus);
        // 走拍中／折子中：世界正被寫，落檔留給它自己收尾那一刻（drainInterludePercepts
        // 或下一次折子 job 會看見這一則）——絕不在此時搶著寫 world.json。
        if (active.phase !== 'running') active.world.snapshot(stateDir);
        return { queued: queue.length };
    }

    // 冷卷：直接讀檔、寫入、落存——沒有進行中的拍，落檔即安全。
    if (!WorldState.exists(stateDir)) throw new Error('run has no world snapshot yet');
    const world = WorldState.restore(stateDir);
    if (!world.castById(characterId)) throw new Error(`unknown character: ${characterId}`);
    const queue = (world.data.pendingStimuli ??= []);
    queue.push(stimulus);
    world.snapshot(stateDir);
    return { queued: queue.length };
}
