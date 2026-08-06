/**
 * 喚醒層的鏈側檔案店（P1b，server-only）—— 折子在拍與拍之間唯一的落腳處。
 *
 * 生產側沒有 engine WorldState（tick-loop 由鏈讀＋檔案店逐拍重建），可是折子機制
 * 要一份**跨拍活著**的狀態：待答的捎話、今日已花的預算、上一拍以來演過的折子、
 * 在途的起念。這個檔就是那份狀態的家，形制照 want-store／plan-intent-store 的
 * house style：明文 JSON、行程內快取、單一寫者。
 *
 * **單一寫者**：唯一會改這份狀態的是 enactChain 上的演繹（大拍或 `/api/wake` 的
 * 折子巡）——同一時刻至多一個演繹在寫，與 want-ledger 同一紀律。
 * **例外**：`enqueueWakeStimulus` 只往 `pendingStimuli` 陣列 push 一則，不改別的欄位、
 * 不重排、不刪除，所以它可以在鏈外便宜地呼（東家一句留言不必排隊等一整拍）。
 * 這正是 lab 側 `queueStimulus` 對進行中的世界所做的事：捎話任何時刻都該落得下來，
 * 同一行程共用這份快取物件，於是進行中的那次演繹會把它一併寫出去（交界處那一瞬的
 * 窄窗與 lab 同一態度——寧可讓一句話趕上這一巡，不為它加一把分散式鎖）。
 *
 * 存的是「折子在世界裡擁有的全部狀態」，`sagaId` 與 `clock` **不存**——那兩樣是
 * 世界的當下（部署常數＋世界時間快照），每次演繹現組，存起來只會多一個會漂的真相源。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    InterludeCastMember,
    InterludeRecord,
    InterludeStimulus,
    InterludeWorld,
    InterludeWorldData,
    WorldClock,
} from '@endless-story/engine';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'wake-store.json');
/** 折子的流水帳（一行一折，append-only）——與 lab 的 `interludes.jsonl` 同形。 */
const LOG_PATH = path.join(DATA_DIR, 'interludes.jsonl');

/** 檔案店的內容 = 引擎折子面（`InterludeWorldData`）扣掉世界的當下兩欄。 */
export type WakeState = Omit<InterludeWorldData, 'sagaId' | 'clock'>;

let cache: WakeState | null = null;

function empty(): WakeState {
    return {
        pendingStimuli: [],
        interludeLedger: {},
        interludesSinceLastTick: [],
        pendingIntents: [],
        activityByChar: {},
    };
}

/** 讀出可變的快取物件——就地改完，同一次演繹裡呼 `saveWakeState` 落檔。 */
export function loadWakeState(): WakeState {
    if (cache) return cache;
    let parsed: Partial<WakeState> = {};
    try {
        parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as Partial<WakeState>;
    } catch {
        /* 檔不在或壞了：一份空狀態即是正確的起點（喚醒層是純增量） */
    }
    cache = {
        ...empty(),
        ...parsed,
    };
    return cache;
}

export function saveWakeState(state: WakeState): void {
    cache = state;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 1));
    } catch (err) {
        console.warn('[wake-store] save failed:', err instanceof Error ? err.message : err);
    }
}

export interface EnqueueWakeStimulusInput {
    characterId: string;
    /** 缺省 'note'（東家的話）；'poke' 是街面上不知哪來的一句。起念不從這裡進來
     *  ——那是引擎 `collectDueIntents` 在演繹裡自己轉出來的。 */
    kind?: 'note' | 'poke';
    text: string;
    /** 落款的真實毫秒（預設此刻）。debounce 的齡從這一刻算起。 */
    atRealMs?: number;
}

/**
 * 一則捎話入佇列。**這是喚醒層的外部入口**——東家留言走這裡，日後 indexer／webhook
 * 把鏈上事件轉成一句世情也走這裡（形狀已是真的 seam，不必再造第二套佇列）。
 *
 * 便宜、不上 enactChain：只 push 不改別的欄位（見檔首單一寫者的例外條款）。
 */
export function enqueueWakeStimulus(input: EnqueueWakeStimulusInput): number {
    const text = input.text.trim();
    if (!text || !input.characterId) return 0;
    const atRealMs = input.atRealMs ?? Date.now();
    const state = loadWakeState();
    const stimulus: InterludeStimulus = {
        // 確定性構造：同一毫秒兩人各自被戳也不撞號（與引擎折子落款同一紀律）。
        id: `stim-${atRealMs}-${input.characterId}`,
        characterId: input.characterId,
        kind: input.kind ?? 'note',
        text,
        atRealMs,
    };
    const queue = (state.pendingStimuli ??= []);
    queue.push(stimulus);
    saveWakeState(state);
    return queue.length;
}

/** 折子流水帳 append（一行一折）。落檔失敗不影響世界——紀錄是給人看的。 */
export function appendInterludeRecords(records: InterludeRecord[]): void {
    if (!records.length) return;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.appendFileSync(LOG_PATH, records.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
    } catch (err) {
        console.warn('[wake-store] interlude log failed:', err instanceof Error ? err.message : err);
    }
}

/**
 * 檔案店 ＋ 世界的當下 = 引擎折子要的最小世界面（duck shim）。
 *
 * 機制仍住在 engine（`packages/engine/src/interlude.ts`）：這裡只是把一份檔案店
 * 冒充成它要的形狀，一行機制都不抄過來。`castById` 缺席時一律查無此人——
 * 拍首匯入（`drainInterludePercepts`）根本不認人，那條路省下整份 cast 讀。
 */
export function asInterludeWorld(
    state: WakeState,
    ctx: { sagaId: string; clock: WorldClock; castById?: (id: string) => InterludeCastMember | undefined },
): InterludeWorld {
    return {
        data: { sagaId: ctx.sagaId, clock: ctx.clock, ...state },
        castById: (id: string) => ctx.castById?.(id),
    };
}

/**
 * 演繹改完的世界面寫回檔案店。引擎會換掉陣列引用（如 `pendingStimuli` 的 filter），
 * 所以回存要從 `world.data` 讀，不能沿用傳進去的那份。
 */
export function saveFromInterludeWorld(world: InterludeWorld): void {
    const { sagaId: _sagaId, clock: _clock, ...rest } = world.data;
    saveWakeState({ ...empty(), ...rest });
}

/** Test hook. */
export function __resetWakeStore(): void {
    cache = null;
}
