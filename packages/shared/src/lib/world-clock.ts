/**
 * World clock — 世界時間法則的唯一居所。
 *
 * 兩種時間模式（見 docs/narrative/WORLD_TIME_MIRROR.md）：
 *
 * - `tick`   舊制。`current_tick` 是時間本身：day 與時辰由 tick 數推導。
 * - `mirror` 鏡像時間。牆鐘是時間之源——敘事時刻 = 真實時刻在世界民用時區
 *            （UTC+8）下的牆鐘時間，年份減 `yearOffset`（春雪社 = 100）。
 *            tick 降級為「演繹的心跳」：世界的角色獲准行動的那一刻，
 *            不再是時間的流逝本身。故事時間永不暫停。
 *
 * 減的是曆法年，不是固定毫秒差——同月同日同時刻，季節與節令對齊。
 * 所有函數皆純函數：呼叫端自傳 `realMs`，本模組不讀 Date.now()。
 *
 * 本模組同時是六時辰字面量與 tick→day 數學的單一來源（先前三份
 * `PARTS_OF_DAY` 複製與四份 bp 推導自此收攏）。
 */

// ─── 六時辰（一日六拍的字面量唯一定義）─────────────────────────────

export const PARTS_OF_DAY = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

/** 夜段——睡眠／REFLECT 窗。 */
export const NIGHT_PARTS: ReadonlySet<PartOfDay> = new Set(['入夜', '深宵'] as const);

export function isNightPart(part: string): boolean {
    return NIGHT_PARTS.has(part as PartOfDay);
}

/** 讀者站四分詞彙的收攏投影（清晨→morning、日午/晡時→noon、黃昏→dusk、夜段→night）。 */
export function toDayPart(part: string): 'morning' | 'noon' | 'dusk' | 'night' {
    switch (part) {
        case '清晨': return 'morning';
        case '日午':
        case '晡時': return 'noon';
        case '黃昏': return 'dusk';
        case '入夜':
        case '深宵': return 'night';
        default: return 'noon';
    }
}

// ─── 時間模式與設定 ─────────────────────────────────────────────────

export type WorldTimeMode = 'tick' | 'mirror';

export interface MirrorTimeConfig {
    mode: 'mirror';
    /** 敘事年 = 真實年 − yearOffset（曆法年，非毫秒差）。春雪社 = 100。 */
    yearOffset: number;
    /** 世界民用時區（分鐘）。上海／中原標準時 = +480，無夏令時。 */
    tzOffsetMinutes: number;
}

export interface TickTimeConfig {
    mode: 'tick';
    /** basis-points（1/10000）：1670 bp ≈ 1/6 天/tick = 一天 6 tick。 */
    daysPerTickBp: number;
}

export type WorldClockConfig = MirrorTimeConfig | TickTimeConfig;

export const SPRING_SNOW_MIRROR: MirrorTimeConfig = {
    mode: 'mirror',
    yearOffset: 100,
    tzOffsetMinutes: 480,
};

/**
 * mirror 世界在鏈上以心跳節律自述：`tick_interval_ms = 14_400_000`
 * （一日六拍、每拍四小時、真實時間）。舊制世界是 120000（兩分鐘）。
 * 凡心跳間隔 ≥ 一小時者視為 mirror——排程節律即曆法宣告，毋須改合約。
 */
export const MIRROR_TICK_INTERVAL_MS = 14_400_000;
export const MIRROR_MIN_INTERVAL_MS = 3_600_000;

export function inferTimeMode(tickIntervalMs: number | undefined | null): WorldTimeMode {
    return Number.isFinite(Number(tickIntervalMs)) && Number(tickIntervalMs) >= MIRROR_MIN_INTERVAL_MS
        ? 'mirror'
        : 'tick';
}

/**
 * 由環境變數解析世界時鐘設定。優先序：`ES_TIME_MODE` 明示 > 鏈上心跳間隔推斷。
 * `chainTickIntervalMs` 由呼叫端從 WorldTimeConfig 讀來（可缺）。
 */
export interface ResolvedWorldClock {
    mode: WorldTimeMode;
    mirror: MirrorTimeConfig;
}

export function resolveWorldClockConfig(
    env: Record<string, string | undefined>,
    chainTickIntervalMs?: number,
): ResolvedWorldClock {
    const explicit = env.ES_TIME_MODE;
    const mode: WorldTimeMode =
        explicit === 'mirror' ? 'mirror'
        : explicit === 'tick' ? 'tick'
        : inferTimeMode(chainTickIntervalMs);
    const yearOffset = Number(env.ES_MIRROR_YEAR_OFFSET ?? '') || SPRING_SNOW_MIRROR.yearOffset;
    const tzOffsetMinutes = Number(env.ES_MIRROR_TZ_OFFSET_MIN ?? '') || SPRING_SNOW_MIRROR.tzOffsetMinutes;
    return { mode, mirror: { mode: 'mirror', yearOffset, tzOffsetMinutes } };
}

// ─── 鏡像時間推導 ───────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** 敘事日界 = 清晨 05:00（民用時）。入夜、深宵跨民用午夜仍屬前一敘事日。 */
export const DAY_START_HOUR = 5;
export const BUCKET_MS = DAY_MS / PARTS_OF_DAY.length; // 4 小時一拍

export interface StoryDate {
    /** 西元敘事年（如 1926）。 */
    year: number;
    /** 民國紀年（西元 − 1911）。 */
    rocYear: number;
    month: number;
    day: number;
    /** 0 = 星期日。由故事日期本身推得——戲班活在自己的曆裡。 */
    weekday: number;
}

export interface StoryMoment {
    realMs: number;
    /** 敘事日期（清晨日界錨定：凌晨兩點的戲文記在昨夜）。 */
    date: StoryDate;
    /** 民用時刻（顯示用，00–23 / 00–59）。 */
    hour: number;
    minute: number;
    /** 0..5 對應 清晨..深宵。 */
    partIndex: number;
    partOfDay: PartOfDay;
    isNight: boolean;
    /** 真十二地支時辰加刻（半時辰一刻）：「卯時二刻」。 */
    shichen: string;
}

function civilMs(realMs: number, cfg: MirrorTimeConfig): number {
    return realMs + cfg.tzOffsetMinutes * MINUTE_MS;
}

/** 清晨日界框架下的「第幾個敘事日」（絕對日數，內部用）。 */
function dawnDayNumber(realMs: number, cfg: MirrorTimeConfig): number {
    return Math.floor((civilMs(realMs, cfg) - DAY_START_HOUR * HOUR_MS) / DAY_MS);
}

function isLeapYear(y: number): boolean {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** 由「絕對敘事日數」定出該日的敘事日期（年份減 yearOffset，閏日鉗到 2/28）。 */
function storyDateOfDawnDay(dawnDay: number, cfg: MirrorTimeConfig): StoryDate {
    // 該敘事日的正午（民用），避開任何邊界歧義後取民用年月日。
    const noonCivil = dawnDay * DAY_MS + DAY_START_HOUR * HOUR_MS + 7 * HOUR_MS;
    const d = new Date(noonCivil);
    const year = d.getUTCFullYear() - cfg.yearOffset;
    const month = d.getUTCMonth() + 1;
    let day = d.getUTCDate();
    // 真實 2/29 而故事年非閏年：鉗到 2/28。offset=100 之下 2400 年前不會觸發，純防禦。
    if (month === 2 && day === 29 && !isLeapYear(year)) day = 28;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { year, rocYear: year - 1911, month, day, weekday };
}

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
const QUARTERS = ['初刻', '一刻', '二刻', '三刻'] as const;

/** 真實民用時刻直推十二地支加刻（子時起於 23:00；半時辰一刻）。 */
export function shichenLabel(hour: number, minute: number): string {
    const branch = BRANCHES[Math.floor(((hour + 1) % 24) / 2)];
    const minuteOfShichen = (((hour + 1) % 2) * 60 + minute);
    return `${branch}時${QUARTERS[Math.min(3, Math.floor(minuteOfShichen / 30))]}`;
}

/** 鏡像時間的此刻。純函數：realMs 由呼叫端提供。 */
export function storyNow(realMs: number, cfg: MirrorTimeConfig): StoryMoment {
    const cms = civilMs(realMs, cfg);
    const msOfDay = ((cms % DAY_MS) + DAY_MS) % DAY_MS;
    const hour = Math.floor(msOfDay / HOUR_MS);
    const minute = Math.floor((msOfDay % HOUR_MS) / MINUTE_MS);
    const relMs = (msOfDay - DAY_START_HOUR * HOUR_MS + DAY_MS) % DAY_MS;
    const partIndex = Math.min(PARTS_OF_DAY.length - 1, Math.floor(relMs / BUCKET_MS));
    const partOfDay = PARTS_OF_DAY[partIndex];
    return {
        realMs,
        date: storyDateOfDawnDay(dawnDayNumber(realMs, cfg), cfg),
        hour,
        minute,
        partIndex,
        partOfDay,
        isNight: NIGHT_PARTS.has(partOfDay),
        shichen: shichenLabel(hour, minute),
    };
}

/**
 * 1-indexed 敘事日序：自世界創世（`WorldState.created_at_ms` 的敘事日）起算。
 * 資料層（分組、排序、事件 id `d{day}:t{tick}`）繼續用整數日序；
 * 日期是它的顯示層投影（`storyDateOfDayIndex`）。
 */
export function storyDayIndex(realMs: number, epochRealMs: number, cfg: MirrorTimeConfig): number {
    return dawnDayNumber(realMs, cfg) - dawnDayNumber(epochRealMs, cfg) + 1;
}

/** 日序 → 敘事日期（新舊資料不斷鏈的橋）。 */
export function storyDateOfDayIndex(
    dayIndex: number,
    epochRealMs: number,
    cfg: MirrorTimeConfig,
): StoryDate {
    return storyDateOfDawnDay(dawnDayNumber(epochRealMs, cfg) + dayIndex - 1, cfg);
}

/**
 * 下一個時辰邊界（05/09/13/17/21/01 民用時）的真實毫秒。排程器睡到這一刻再打拍。
 * 恰在邊界上時回傳下一個邊界（+4h）。
 */
export function nextBucketBoundaryMs(realMs: number, cfg: MirrorTimeConfig): number {
    const cms = civilMs(realMs, cfg);
    const msOfDay = ((cms % DAY_MS) + DAY_MS) % DAY_MS;
    const relMs = (msOfDay - DAY_START_HOUR * HOUR_MS + DAY_MS) % DAY_MS;
    const delta = BUCKET_MS - (relMs % BUCKET_MS);
    return realMs + delta;
}

/** 兩個時刻之間經過的時辰邊界數（停機後「班子歇了幾拍」的世情事實）。 */
export function bucketsBetween(fromMs: number, toMs: number, cfg: MirrorTimeConfig): number {
    if (toMs <= fromMs) return 0;
    const bucketOrdinal = (ms: number) => {
        const cms = civilMs(ms, cfg);
        return Math.floor((cms - DAY_START_HOUR * HOUR_MS) / BUCKET_MS);
    };
    return bucketOrdinal(toMs) - bucketOrdinal(fromMs);
}

// ─── 紀年顯示 ───────────────────────────────────────────────────────

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

/** 1..9999 的中文數字（十五、二十九、一百一十五）。 */
export function chineseNumber(n: number): string {
    if (!Number.isInteger(n) || n < 0) return String(n);
    if (n === 0) return CN_DIGITS[0];
    if (n >= 10_000) return String(n);
    const units = ['', '十', '百', '千'] as const;
    const digits: number[] = [];
    let v = n;
    while (v > 0) { digits.push(v % 10); v = Math.floor(v / 10); }
    let out = '';
    let zeroPending = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        const d = digits[i];
        if (d === 0) { zeroPending = out.length > 0; continue; }
        if (zeroPending) { out += CN_DIGITS[0]; zeroPending = false; }
        // 「一十五」讀作「十五」：最高位是十位的一可省。
        out += (d === 1 && i === 1 && out.length === 0) ? units[1] : CN_DIGITS[d] + units[i];
    }
    return out;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export interface FormatStoryDateOptions {
    /** 'roc'（民國十五年，預設）或 'western'（一九二六年）。 */
    era?: 'roc' | 'western';
    withWeekday?: boolean;
}

/** 「民國十五年八月五日」。西曆模式給「1926 年 8 月 5 日」。 */
export function formatStoryDate(d: StoryDate, opts: FormatStoryDateOptions = {}): string {
    const era = opts.era ?? 'roc';
    const base = era === 'roc'
        ? `民國${chineseNumber(d.rocYear)}年${chineseNumber(d.month)}月${chineseNumber(d.day)}日`
        : `${d.year} 年 ${d.month} 月 ${d.day} 日`;
    return opts.withWeekday ? `${base} 星期${WEEKDAYS[d.weekday]}` : base;
}

/** 「1926-08-05」——tooltip／鍵值用。 */
export function formatStoryDateIso(d: StoryDate): string {
    const mm = String(d.month).padStart(2, '0');
    const dd = String(d.day).padStart(2, '0');
    return `${d.year}-${mm}-${dd}`;
}

/** 「民國十五年八月五日 · 晡時」——dayLabel 的鏡像形。 */
export function formatStoryMoment(m: StoryMoment, opts: FormatStoryDateOptions = {}): string {
    return `${formatStoryDate(m.date, opts)} · ${m.partOfDay}`;
}

// ─── tick 模式推導（bp 數學的單一來源）──────────────────────────────

export const BP_DENOM = 10_000;
export const DEFAULT_DAYS_PER_TICK_BP = 1670;

/** 一日幾拍：round(10000 / bp)，至少 1。 */
export function ticksPerDay(daysPerTickBp: number): number {
    if (!Number.isFinite(daysPerTickBp) || daysPerTickBp <= 0) return 1;
    return Math.max(1, Math.round(BP_DENOM / daysPerTickBp));
}

/**
 * 1-indexed 敘事日。canonical 公式是整數節律 `floor(tick / ticksPerDay) + 1`：
 * bp 是 ticksPerDay 的編碼，不是精確有理數——舊的 `floor(tick·bp/10000)+1`
 * 在 1670 bp（6×1670 = 10020 ≠ 10000）下每約 60 拍提早跨一日，
 * 與引擎的整數推導漂移。自此統一。
 */
export function tickDerivedDay(currentTick: number, daysPerTickBp: number): number {
    return Math.floor(currentTick / ticksPerDay(daysPerTickBp)) + 1;
}

/** 0-based 日內拍位。 */
export function tickOfDay(currentTick: number, daysPerTickBp: number): number {
    const perDay = ticksPerDay(daysPerTickBp);
    return ((currentTick % perDay) + perDay) % perDay;
}

/** 日內拍位攤到六時辰字面量（粗節律如 2 拍/日仍落在合理標籤）。 */
export function tickPartOfDay(currentTick: number, daysPerTickBp: number): PartOfDay {
    const perDay = ticksPerDay(daysPerTickBp);
    const idx = Math.floor((tickOfDay(currentTick, daysPerTickBp) / perDay) * PARTS_OF_DAY.length);
    return PARTS_OF_DAY[Math.min(idx, PARTS_OF_DAY.length - 1)];
}
