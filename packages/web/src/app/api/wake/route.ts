/**
 * POST /api/wake —— 喚醒層的鏈側入口（折子：拍與拍之間的單角色有界演繹）。
 *
 * 設計見 docs/narrative/AGENT_WAKE_LAYER.md（附錄 C）。這個 route 只做接線，
 * 機制全在引擎（`@endless-story/engine` 的 `runInterludes`／`collectDueIntents`）：
 * 這裡把鏈側的零件——世界時間快照、部署常數、檔案店、per-character session 座席、
 * 角色記憶——湊成引擎要的最小世界面（duck shim），跑完存回。
 *
 * 兩件事，一個入口：
 *   · `enqueue` —— 一則捎話入佇列。**便宜，不上演繹鏈**：東家一句留言不必等一整拍。
 *     這也是日後鏈上事件的 seam（indexer／webhook 直接 POST 同一個形狀即可）。
 *   · `drain`   —— 巡一次佇列：到期的起念先轉成刺激，再把 due 的捎話演成折子。
 *     **走 enactChain**（與 /api/tick 同一條鏈）：折子撞上進行中的大拍就等它。
 *
 * Auth: 同 /api/tick —— 設了 `TICK_LOOP_SECRET` 就要 `Authorization: Bearer <secret>`；
 * 沒設則開放（僅限本機開發）。
 *
 * Body（JSON）: `{ enqueue?: { characterId, kind?: 'note'|'poke', text }, drain?: boolean }`
 */

import { join as joinPath } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import {
    collectDueIntents,
    runInterludes,
    type InterludeCastMember,
    type PartOfDay,
    type RecallPort,
    type WorldClock,
} from '@endless-story/engine';
import { RunnerSceneAgent } from '@endless-story/engine/adapters/runner';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { charactersApi } from '@/lib/api/index';
import { rememberForCharacter } from '@/lib/chain/memory';
import {
    appendInterludeRecords,
    asInterludeWorld,
    enqueueWakeStimulus,
    loadWakeState,
    saveFromInterludeWorld,
} from '@/lib/chain/wake-store';
import { runOnEnactChain } from '@/lib/server/enact-chain';

// 一折是一兩個角色的一輪短演繹（受限動詞集），不是一整拍：一分鐘綽綽有餘。
export const runtime = 'nodejs';
export const maxDuration = 60;

// 與大拍同一批 per-character session 檔（同款 sessionDir/sessionKey）——折子是這個人
// **真的活過的**一輪，捎話與答話留在他自己的 transcript 裡，下一個大拍只需聽說。
// 與 tick-loop 各持一個 instance 但寫同一批檔：兩者都在演繹鏈上，不會同時寫。
const sessionSceneAgent = new RunnerSceneAgent({
    sessionDir: process.env.CHARACTER_SESSION_DIR ?? joinPath(process.cwd(), 'data', 'character-sessions'),
    sessionKey: process.env.CHARACTER_SESSION_KEY,
});

// 折子的心事入長期記憶，與大拍的反思同一條路（`rememberForCharacter` 自己推當前
// 敘事日，故引擎給的 day 不必轉手）。`recall` 在折子路徑上**不會被呼**——座席只
// 聽見此刻遞到跟前的話，不做回憶檢索——留一個空實作滿足 port 形狀。
const recallShim: RecallPort = {
    remember: (characterId, text) => rememberForCharacter(characterId, text, { kind: 'reflection', importance: 6 }),
    recall: async () => [],
};

interface WakeRequestBody {
    enqueue?: { characterId?: unknown; kind?: unknown; text?: unknown };
    drain?: boolean;
}

interface WakeResponse {
    ok: boolean;
    /** enqueue 後佇列裡待答的捎話數。 */
    queued?: number;
    /** 這一巡演成的折子數。 */
    played?: number;
    /** ok:false 的緣由（世界尚未就緒 / 演繹失手）——皆非錯誤，下一巡再來。 */
    reason?: string;
    error?: string;
}

/** 認人：id/name 供落款，persona 餵座席的持久 session。 */
async function loadCastById(sagaId: string): Promise<(id: string) => InterludeCastMember | undefined> {
    const characters = await charactersApi.listSagaCharacters(sagaId).catch(() => []);
    const byId = new Map<string, InterludeCastMember>(
        characters
            .filter((c) => !c.sagaId || c.sagaId === sagaId)
            .map((c) => [
                c.id,
                {
                    id: c.id,
                    name: c.name,
                    // 與 tick-loop 餵 session 的 persona 同源（`c.description`），
                    // 折子與大拍才是同一把 identity，canon-hash 穩定。
                    persona: c.description,
                    // agency 不寫：台柱要點名，而鏈側目前沒有點名之處 ⇒ 全員班底。
                    // 於是起念（P2）在鏈側暫不生效，被動折子與大拍全員照舊——
                    // 「沒點到名的人一毛成本也不生」（設計稿 §六之二）。
                },
            ]),
    );
    return (id: string) => byId.get(id);
}

/**
 * 巡一次佇列。**只在 enactChain 上呼**（唯一寫者鐵律）。
 *
 * 留下的比演掉的更要緊：未滿齡、超預算、查無此人、座席沒答上——引擎一律把那一組
 * 原封留在佇列，等下一巡或下一個大拍（大拍會把滯留的捎話說給本人聽，見 C5）。
 */
async function drainWake(): Promise<WakeResponse> {
    const state = loadWakeState();
    // 佇列空、也沒有在途的念 ⇒ 零成本收工：連鏈都不讀、不認人、不碰座席、不寫檔。
    // 兩分鐘一巡的常態就是這一行，世界照舊只有六拍。
    if (!state.pendingStimuli?.length && !state.pendingIntents?.length) return { ok: true, played: 0 };

    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    const snapshot = await getWorldTimeSnapshot();
    // 世界還沒有時間（未部署／tick 世界鏈讀失敗）⇒ 折子沒有落款可寫。不是錯誤：
    // 佇列原封不動，下一巡再來。
    if (!sagaId || !snapshot) return { ok: false, reason: 'world-not-ready' };
    // 鏡像或 tick 皆可：快照兩模式同構（ticksPerDay 六拍、tickOfDay 即日內拍位），
    // 六個時辰標籤與引擎同源於 shared/world-clock。
    const clock: WorldClock = {
        currentTick: snapshot.currentTick,
        ticksPerDay: snapshot.ticksPerDay,
        day: snapshot.day,
        tickOfDay: snapshot.tickOfDay,
        partOfDay: snapshot.partOfDay as PartOfDay,
    };

    const nowMs = Date.now();
    const world = asInterludeWorld(state, { sagaId, clock, castById: await loadCastById(sagaId) });
    // 起念到點——在隊內取出、轉成與東家留言同形的刺激推進同一個佇列，此後走折子
    // 那一套既有閘門（分組、debounce、預算、落款、拍首兜底）。
    const due = collectDueIntents(world, nowMs);
    if (due.length) world.data.pendingStimuli = [...(world.data.pendingStimuli ?? []), ...due];

    let played: number;
    try {
        const records = await runInterludes(
            world,
            { agent: sessionSceneAgent, recall: recallShim },
            { nowMs, ...(snapshot.dateLabel ? { dateLabel: snapshot.dateLabel } : {}) },
        );
        played = records.length;
        // 一折未成也可能有東西要落檔：到期的念已從 pendingIntents 移進 pendingStimuli，
        // 這一步不寫，重啟後那枚念就兩頭落空——「捎話只會晚到，不會失蹤」及於起念。
        if (played || due.length) saveFromInterludeWorld(world);
        if (played) appendInterludeRecords(records);
    } catch (err) {
        // 演繹失手不是刺激的錯：那一組原封留在佇列，下一巡再試。
        if (due.length) saveFromInterludeWorld(world);
        return { ok: false, reason: 'interlude-failed', error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true, played };
}

function authorized(req: NextRequest): boolean {
    const secret = process.env.TICK_LOOP_SECRET;
    if (!secret) return true; // open in dev when no secret configured
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    let body: WakeRequestBody = {};
    try {
        const parsed = (await req.json()) as WakeRequestBody | null;
        if (parsed && typeof parsed === 'object') body = parsed;
    } catch {
        /* empty / invalid body → 什麼都不做的一巡 */
    }

    const out: WakeResponse = { ok: true };
    try {
        const enqueue = body.enqueue;
        if (enqueue && typeof enqueue.characterId === 'string' && typeof enqueue.text === 'string') {
            const kind = enqueue.kind === 'poke' ? 'poke' : 'note';
            out.queued = enqueueWakeStimulus({ characterId: enqueue.characterId, kind, text: enqueue.text });
        }
        if (body.drain) {
            const drained = await runOnEnactChain(drainWake);
            out.ok = drained.ok;
            if (drained.played !== undefined) out.played = drained.played;
            if (drained.reason) out.reason = drained.reason;
            if (drained.error) out.error = drained.error;
        }
        return NextResponse.json(out);
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
