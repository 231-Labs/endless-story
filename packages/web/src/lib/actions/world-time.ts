'use server';

/**
 * World time — read snapshot + admin-signed tick advance.
 *
 * 兩種時間權威（法則見 docs/narrative/WORLD_TIME_MIRROR.md）：
 *
 * - `tick`    舊制。`WorldState.current_tick` 就是時間本身，day 與時辰由
 *             tick 數 + `days_per_tick_bp` 推導。
 * - `mirror`  鏡像時間。牆鐘是時間之源，tick 降為「演繹的心跳」——世界的
 *             角色獲准行動的那一刻，不是時間的流逝本身。
 *
 * 快照形狀在兩模式下同構：`ticksPerDay === 6`、`tickOfDay` 即日內拍位
 * （mirror 之下等於時辰 bucket index），故下游的疲勞曲線、夜測、day-start
 * 與 gazette 閘門一行語義都不必改。法則本身只住在
 * `@endless-story/shared/world-clock`；這裡只做鏈讀與模式分歧。
 *
 * 推進 tick 仍是 server action：admin keypair 持 World AdminCap，不經錢包。
 */

import { Transaction } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import {
    DEFAULT_DAYS_PER_TICK_BP,
    PARTS_OF_DAY,
    formatStoryDate,
    formatStoryDateIso,
    isNightPart,
    resolveWorldClockConfig,
    storyDayIndex,
    storyNow,
    tickDerivedDay,
    tickOfDay as deriveTickOfDay,
    tickPartOfDay,
    ticksPerDay as deriveTicksPerDay,
    type MirrorTimeConfig,
    type StoryDate,
    type WorldTimeMode,
} from '@endless-story/shared/world-clock';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

export interface WorldTimeSnapshot {
    currentTick: number;
    daysPerTickBp: number;
    ticksPerDay: number;
    day: number;
    partOfDay: string;
    /** True when partOfDay is a night bucket (入夜 / 深宵) — the sleep/REFLECT window.
     *  Derived here rather than compared by callers: the previous caller test
     *  `partOfDay === 'night'` never matched the Chinese labels, silently disabling
     *  the whole nightly consolidation step. */
    isNight: boolean;
    tickOfDay: number;
    /** 時間權威：'tick' 由鏈上心跳推導，'mirror' 由牆鐘投影。 */
    mode: WorldTimeMode;
    /** 以下欄位僅 mirror 模式填寫（tick 世界無曆可言）。 */
    date?: StoryDate;
    /** 「民國十五年八月五日」。 */
    dateLabel?: string;
    /** 「1926-08-05」——tooltip／鍵值用。 */
    dateLabelIso?: string;
    /** 民用時刻「14:35」（補零）。 */
    clockHm?: string;
    /** 真十二地支加刻「未時三刻」。 */
    shichen?: string;
    /** 交給 client 時鐘元件自行走秒用的設定。 */
    mirror?: MirrorTimeConfig;
}

export interface AdvanceTickResult {
    ok: boolean;
    digest?: string;
    snapshot?: WorldTimeSnapshot;
    error?: string;
}

function deriveTickSnapshot(currentTick: number, daysPerTickBp: number): WorldTimeSnapshot {
    const partOfDay = tickPartOfDay(currentTick, daysPerTickBp);
    return {
        currentTick,
        daysPerTickBp,
        ticksPerDay: deriveTicksPerDay(daysPerTickBp),
        day: tickDerivedDay(currentTick, daysPerTickBp),
        partOfDay,
        isNight: isNightPart(partOfDay),
        tickOfDay: deriveTickOfDay(currentTick, daysPerTickBp),
        mode: 'tick',
    };
}

/** 牆鐘投影。`currentTick` 只是心跳計數，不參與任何時間推導。 */
function deriveMirrorSnapshot(args: {
    currentTick: number;
    daysPerTickBp: number;
    /** 世界創世真實毫秒（`WorldState.created_at_ms`）——日序的 epoch。 */
    createdAtMs: number;
    mirror: MirrorTimeConfig;
    nowMs?: number;
}): WorldTimeSnapshot {
    const nowMs = args.nowMs ?? Date.now();
    const m = storyNow(nowMs, args.mirror);
    const hh = String(m.hour).padStart(2, '0');
    const mm = String(m.minute).padStart(2, '0');
    return {
        currentTick: args.currentTick,
        daysPerTickBp: args.daysPerTickBp,
        // 六拍語義原封不動：一日六時辰，tickOfDay 即 bucket index。
        ticksPerDay: PARTS_OF_DAY.length,
        day: storyDayIndex(nowMs, args.createdAtMs, args.mirror),
        partOfDay: m.partOfDay,
        isNight: m.isNight,
        tickOfDay: m.partIndex,
        mode: 'mirror',
        date: m.date,
        dateLabel: formatStoryDate(m.date),
        dateLabelIso: formatStoryDateIso(m.date),
        clockHm: `${hh}:${mm}`,
        shichen: m.shichen,
        mirror: args.mirror,
    };
}

export async function getWorldTimeSnapshot(): Promise<WorldTimeSnapshot | null> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    // worldId 缺席才是真正的 null：世界尚未存在，連曆都無從談起。
    if (!d.worldId) return null;
    try {
        const admin = getAdminContext();
        const res = await read.world.getWorld(admin.client, d.worldId);
        const json = res.json as unknown as {
            state?: { current_tick?: number | string; created_at_ms?: number | string };
            time_config?: {
                days_per_tick_bp?: number | string;
                tick_interval_ms?: number | string;
            };
        };
        const currentTick = Number(json.state?.current_tick ?? 0);
        const bp = Number(json.time_config?.days_per_tick_bp ?? DEFAULT_DAYS_PER_TICK_BP)
            || DEFAULT_DAYS_PER_TICK_BP;
        const tickIntervalMs = Number(json.time_config?.tick_interval_ms ?? 0) || undefined;
        const cfg = resolveWorldClockConfig(process.env, tickIntervalMs);
        if (cfg.mode === 'tick') return deriveTickSnapshot(currentTick, bp);
        // created_at_ms 讀不到時退回「此刻創世」，日序自 1 起——寧可日序偏，
        // 不可整個時間層停擺。
        const createdAtMs = Number(json.state?.created_at_ms ?? 0) || Date.now();
        return deriveMirrorSnapshot({
            currentTick,
            daysPerTickBp: bp,
            createdAtMs,
            mirror: cfg.mirror,
        });
    } catch (err) {
        console.warn('[world-time] getWorldTimeSnapshot failed:', err);
        // 鏡像之下時間不依賴鏈：鏈讀失敗只讓心跳數未知（記 0），「現在幾時」
        // 照樣答得出來。模式須由 env 明示——沒有鏈上心跳間隔就無從推斷。
        const cfg = resolveWorldClockConfig(process.env);
        if (cfg.mode === 'tick') return null;
        return deriveMirrorSnapshot({
            currentTick: 0,
            daysPerTickBp: DEFAULT_DAYS_PER_TICK_BP,
            createdAtMs: Date.now(),
            mirror: cfg.mirror,
        });
    }
}

export async function advanceTickAction(): Promise<AdvanceTickResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.worldId || !d.adminCapId) {
        return { ok: false, error: 'World 尚未種子化（缺 worldId / adminCapId）' };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const tx = new Transaction();
        // advance_tick(admin_cap, world, clock) — the generated wrapper
        // auto-injects the 0x6 Clock, so we only pass cap + world.
        tx.add(
            endlessTx.world.advanceTick({
                adminCap: d.adminCapId,
                world: d.worldId,
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return {
                ok: false,
                error: res.error ?? '交易失敗',
                digest: res.digest,
            };
        }
        // execAdminTx waits for finality inside the admin lock, so the fullnode
        // has indexed the new tick before we re-read — otherwise read-after-write
        // lag returns the OLD tick and the panel looks like it didn't advance.
        const snapshot = await getWorldTimeSnapshot();
        return { ok: true, digest: res.digest, snapshot: snapshot ?? undefined };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
