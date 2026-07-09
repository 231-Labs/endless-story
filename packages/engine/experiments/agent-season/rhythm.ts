/**
 * AGENT-SEASON · OCCUPATION-RHYTHM (the multi-gravity-well fix).
 * ============================================================================
 * Time (時辰) drives WHERE each character's own life pulls them. The rhythm is a
 * PULL, not a command (§2.43): it sets the DEFAULT venue + whether the character
 * is awake/active this 時辰, shown to the agent as context and used if the agent
 * does not choose to move elsewhere. A hot want can override it (柳 goes to 會樂里;
 * 白韻秋 summons 柳) — that is the drama, layered on the rhythm.
 *
 * The 6 時辰 of a day (PARTS_OF_DAY): 清晨 · 日午 · 晡時 · 黃昏 · 入夜 · 深宵.
 * Night = 入夜 / 深宵. 深宵 = the sleep/consolidation 時辰 (reflect runs here for
 * everyone; characters auto-route home; empty 時辰 fast-forwards).
 *
 * 班主 rehearsal channel: when 沈雪笙 has called rehearsal (an agent decision, not
 * a hardcoded milestone), it becomes a STANDING PULL that gathers the troupe to
 * the 戲台 / 練功房 during the day 時辰.
 */

import type { PartOfDay } from '../../src/index.ts';
import type { Char, Occupation } from './world.ts';

export const DAY_PARTS: PartOfDay[] = ['清晨', '日午', '晡時', '黃昏', '入夜', '深宵'];
export const isNightPart = (p: PartOfDay): boolean => p === '入夜' || p === '深宵';
export const isDeepNight = (p: PartOfDay): boolean => p === '深宵';

/** Standing rehearsal call — the 班主 channel (troupe's shared structure). */
export interface RehearsalCall {
    announced: boolean;
    /** in-world announcement line. */
    line: string;
    /** day.part it was announced (for the report). */
    at?: string;
}

export interface RhythmPull {
    /** null → asleep/inactive this 時辰 (no agent turn). */
    venue: string | null;
    active: boolean;
    /** short context line shown to the agent (the time-driven life anchor). */
    note: string;
}

/**
 * The occupation-rhythm table. Returns each character's DEFAULT pull for a 時辰.
 * `null` venue = asleep (theater/nightlife folk keep late hours → 清晨 is empty
 * until the world wakes at 日午; that empty 時辰 fast-forwards).
 */
export function rhythmPull(c: Char, part: PartOfDay, reh: RehearsalCall): RhythmPull {
    const rehearseDay = reh.announced;
    switch (c.occupation) {
        case 'troupe':
            return troupeRhythm(c, part, rehearseDay);
        case 'banzhu':
            return banzhuRhythm(c, part);
        case 'geinu':
            return geinuRhythm(c, part);
        case 'guest':
            return guestRhythm(c, part);
    }
}

function troupeRhythm(c: Char, part: PartOfDay, reh: boolean): RhythmPull {
    switch (part) {
        case '清晨':
            return { venue: null, active: false, note: '天光未亮，戲子夜工，還在夢裡。' };
        case '日午':
            return reh
                ? { venue: '練功房', active: true, note: '班主叫了排練，該去練功房吊嗓走位。' }
                : { venue: c.homeVenue, active: true, note: '沒排練的日子，自己的時光。' };
        case '晡時':
            return reh
                ? { venue: '雲錦台戲台', active: true, note: '班主叫了排練，該上戲台對戲。' }
                : { venue: c.homeVenue, active: true, note: '沒排練，理自己的事。' };
        case '黃昏':
            return { venue: c.homeVenue, active: true, note: '傍晚時分，歇口氣，理理心事。' };
        case '入夜':
            return { venue: c.homeVenue, active: true, note: '入夜了，自己的夜。' };
        case '深宵':
            return { venue: c.homeVenue, active: false, note: '深宵，該歇了。' };
    }
}

function banzhuRhythm(c: Char, part: PartOfDay): RhythmPull {
    switch (part) {
        case '清晨':
            return { venue: null, active: false, note: '天光未亮，還沒起。' };
        case '日午':
            return { venue: '後台妝閣', active: true, note: '開了妝閣的門，看戲、看帳、看人心——今日排不排戲，我說了算。' };
        case '晡時':
            return { venue: '後台妝閣', active: true, note: '坐鎮後台，盯著班子。' };
        case '黃昏':
            return { venue: '後台妝閣', active: true, note: '傍晚，理著班中事。' };
        case '入夜':
            return { venue: '後台妝閣', active: true, note: '入夜，二樓看戲看人。' };
        case '深宵':
            return { venue: c.homeVenue, active: false, note: '深宵，回沈宅歇著。' };
    }
}

function geinuRhythm(c: Char, part: PartOfDay): RhythmPull {
    switch (part) {
        case '清晨':
            return { venue: null, active: false, note: '唱夜工的人，清晨還睡著。' };
        case '日午':
            return { venue: '會樂里寓所', active: true, note: '晌午才起，寓所裡理著自己的事。' };
        case '晡時':
            return { venue: '會樂里寓所', active: true, note: '午後的閒空，是我自己的。' };
        case '黃昏':
            return { venue: '會樂里寓所', active: true, note: '傍晚，理妝理嗓，預備出局。' };
        case '入夜':
            return { venue: '霞飛路歌場', active: true, note: '入夜掛頭牌，霞飛路歌場唱這個月的堂會。' };
        case '深宵':
            return { venue: '會樂里寓所', active: true, note: '深宵散了場，回會樂里寓所——有時等一個人。' };
    }
}

function guestRhythm(c: Char, part: PartOfDay): RhythmPull {
    switch (part) {
        case '清晨':
            return { venue: null, active: false, note: '千金貪睡，清晨還在繡樓。' };
        case '日午':
            return { venue: '霞飛路', active: true, note: '晌午出門，逛霞飛路、看洋片，自己的天地。' };
        case '晡時':
            return { venue: '霞飛路', active: true, note: '午後在霞飛路閒逛。' };
        case '黃昏':
            return { venue: '包廂茶座', active: true, note: '傍晚訂了包廂，預備聽戲。' };
        case '入夜':
            return { venue: '包廂茶座', active: true, note: '入夜在包廂聽戲、捧場。' };
        case '深宵':
            return { venue: c.homeVenue, active: false, note: '深宵回白公館繡樓歇著。' };
    }
}

/** Which venues are "active" this 時辰 (the union of everyone's rhythm pulls +
 *  the rehearsal call). Used for the report's active-venue determination. */
export function activeVenues(cast: Char[], part: PartOfDay, reh: RehearsalCall): string[] {
    const set = new Set<string>();
    for (const c of cast) {
        const pull = rhythmPull(c, part, reh);
        if (pull.active && pull.venue) set.add(pull.venue);
    }
    return [...set];
}

/** Occupation label for reports. */
export function occLabel(o: Occupation): string {
    return { troupe: '戲班', banzhu: '班主', geinu: '歌女', guest: '客' }[o];
}
