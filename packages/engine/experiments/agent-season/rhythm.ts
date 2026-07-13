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
    /** ON DUTY this 時辰 — tied to a livelihood commitment (rehearsing, singing the
     *  堂會, running the house). A character on duty does NOT abandon it to chase a
     *  private want; the FREE party is the one who comes to them (§ user: 柳 rehearsing
     *  holds, idle 金鳳 comes to him). Their post is their venue; they can still be
     *  engaged by whoever shows up. */
    duty?: boolean;
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
                ? { venue: '練功房', active: true, duty: true, note: '班主叫了排練，該去練功房吊嗓走位——排戲脫不開身。' }
                : { venue: c.homeVenue, active: true, note: '沒排練的日子，自己的時光。' };
        case '晡時':
            return reh
                ? { venue: '雲錦台戲台', active: true, duty: true, note: '班主叫了排練，該上戲台對戲——排戲脫不開身。' }
                : { venue: c.homeVenue, active: true, note: '沒排練，理自己的事。' };
        case '黃昏':
            return {
                venue: c.homeVenue,
                active: true,
                note: '傍晚散了工，這時辰是自己的：可回房歇口氣理理心事；戲園前街的茶湯麵攤正熱鬧，包廂茶座也有人吃茶聽戲——想見誰、想躲誰，都在這一步。',
            };
        case '入夜':
            return {
                venue: c.homeVenue,
                active: true,
                note: '入夜了，自己的夜：可以關起門過自己的日子，也可以出門——霞飛路歌場正開唱、戲園前街還亮著攤燈。心裡掛著誰，這時辰是能去尋的。',
            };
        case '深宵':
            return { venue: c.homeVenue, active: false, note: '深宵，該歇了。' };
    }
}

function banzhuRhythm(c: Char, part: PartOfDay): RhythmPull {
    switch (part) {
        case '清晨':
            return { venue: null, active: false, note: '天光未亮，還沒起。' };
        case '日午':
            return { venue: '後台妝閣', active: true, duty: true, note: '開了妝閣的門，看戲、看帳、看人心——今日排不排戲，我說了算。' };
        case '晡時':
            return { venue: '後台妝閣', active: true, duty: true, note: '坐鎮後台，盯著班子。' };
        case '黃昏':
            return { venue: '後台妝閣', active: true, duty: true, note: '傍晚，理著班中事。' };
        case '入夜':
            return { venue: '後台妝閣', active: true, duty: true, note: '入夜，二樓看戲看人。' };
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
            return { venue: '霞飛路歌場', active: true, duty: true, note: '入夜掛頭牌，霞飛路歌場唱這個月的堂會——上工抽不開身。' };
        case '深宵':
            // Default = REST (the rhythm must be metabolically sustainable; a 5-awake
            // 時辰 day was a structural death spiral for the 歌女). A burning want still
            // keeps her up — the night-pursuit / hot-情 layer overrides rest, so 等一個人
            // remains possible; it is now the WANT's doing, not the timetable's.
            return { venue: '會樂里寓所', active: false, note: '深宵散了場，回會樂里寓所歇下——除非心裡燒著一樁放不下的。' };
    }
}

function guestRhythm(c: Char, part: PartOfDay): RhythmPull {
    switch (part) {
        case '清晨':
            return { venue: null, active: false, note: '千金貪睡，清晨還在繡樓。' };
        case '日午':
            return { venue: '霞飛路商店街', active: true, note: '晌午出門，逛霞飛路商店街，挑挑洋貨、在攤子上吃點東西，自己的天地。' };
        case '晡時':
            // A 名門 daughter has 名門 duties: the one anchored hour her family
            // claims (帳房、老夫人、家中規矩) — the guest occupation was the only
            // life with ZERO duty, making her a free radical any hot want could
            // hijack at no cost.
            return { venue: c.homeVenue, active: true, duty: true, note: '午後回白公館理家事、對帳房、陪老夫人說話——名門的女兒有名門的功課，這個時辰家裡點卯。' };
        case '黃昏':
            return { venue: '包廂茶座', active: true, note: '傍晚訂了包廂，預備聽戲。' };
        case '入夜':
            return { venue: '包廂茶座', active: true, note: '入夜在包廂聽戲、捧場。' };
        case '深宵':
            return { venue: c.homeVenue, active: false, note: '深宵回白公館繡樓歇著。' };
    }
}

// ── ROUTINE KNOWLEDGE (predicting where a KNOWN person will be) ────────────────
/**
 * Venue clusters — the "same place / same building" grouping. A seeker who POSTS UP
 * (waits) in one venue can catch someone who is anywhere in the SAME cluster (the
 * 戲園 complex: stage, wings, dressing rooms, practice, the living quarters attached
 * to it). Crossing clusters (across town) means really travelling — no free catch.
 */
export const VENUE_CLUSTER: Record<string, string> = {
    雲錦台戲台: '戲園', 練功房: '戲園', 後台妝閣: '戲園', 後台小廂房: '戲園',
    二樓書寓: '戲園', 後進廂房: '戲園', 戲班大通鋪: '戲園', 包廂茶座: '戲園',
    戲園前街: '戲園',
    會樂里寓所: '霞飛里', 霞飛路歌場: '霞飛里', 霞飛路: '霞飛里', 霞飛路商店街: '霞飛里',
    沈宅小樓: '沈宅', 白公館繡樓: '白公館',
};
export const clusterOf = (venue: string): string => VENUE_CLUSTER[venue] ?? venue;
export const sameCluster = (a: string, b: string): boolean => !!a && !!b && clusterOf(a) === clusterOf(b);

/** The street a cluster opens onto (its physical throat). Private-house clusters
 *  (沈宅/白公館) have none of their own and reach town by the main road. */
export const CLUSTER_STREET: Record<string, string> = { 戲園: '戲園前街', 霞飛里: '霞飛路商店街' };

/** Streets a cross-cluster walk PHYSICALLY passes, in order — no teleporting:
 *  you leave through your cluster's street and arrive through theirs. Same
 *  cluster = a few steps, no transit. Two street-less clusters = the main road. */
export function transitStreets(from: string, to: string): string[] {
    if (!from || !to || sameCluster(from, to)) return [];
    const legs = [CLUSTER_STREET[clusterOf(from)], CLUSTER_STREET[clusterOf(to)]].filter(
        (s): s is string => !!s && s !== from && s !== to,
    );
    return legs.length ? [...new Set(legs)] : ['霞飛路商店街'];
}


export interface Whereabouts {
    /** best single-venue guess for this 時辰. */
    venue: string;
    /** the AREA they'll be in (cluster) — a waiter here can catch them. */
    cluster: string;
    /** true → at this 時辰 they are resting at home (still findable, but asleep). */
    asleep: boolean;
    /** true → this 時辰 they are ON DUTY (tied to livelihood, hard to pull away). */
    busy: boolean;
    /** human line a character who KNOWS them would reason with (routine + when
     *  they're tied up vs. when they get free — so the seeker can time the approach). */
    note: string;
}

/** What someone who KNOWS `target` can predict about where they are — derived from
 *  the SAME rhythm table `target` actually moves by, so a seeker who navigates to
 *  this and a target who moves by rhythm CONVERGE (no stale-coordinate oscillation). */
export function predictWhereabouts(target: Char, part: PartOfDay, reh: RehearsalCall): Whereabouts {
    const pull = rhythmPull(target, part, reh);
    const venue = pull.venue ?? target.homeVenue;
    const asleep = !pull.active;
    const busy = !!pull.duty;
    const hint = `（這個時辰，約莫在：${venue}${asleep ? '，多半已歇下' : busy ? '，正忙著營生脫不開身' : '，這會兒得閒'}）`;
    return { venue, cluster: clusterOf(venue), asleep, busy, note: routineNote(target, reh) + hint };
}

function routineNote(c: Char, reh: RehearsalCall): string {
    const n = c.name;
    switch (c.occupation) {
        case 'troupe':
            return reh.announced
                ? `${n}最近跟著春雪社排新戲：日午晡時在戲園一帶排戲（練功房、戲台）脫不開身，黃昏入夜才得閒、歇在戲園後頭的住處，深宵安睡。`
                : `${n}是春雪社的戲子，白日理自己的事，多在戲園一帶或住處。`;
        case 'geinu':
            return `${n}是霞飛路掛頭牌的歌女：晌午到黃昏在會樂里寓所得閒；入夜要到霞飛路歌場唱堂會、抽不開身；深宵散場才回會樂里。`;
        case 'banzhu':
            return `${n}是班主，日午到入夜都坐鎮後台妝閣看戲看帳、不好打攪，深宵才回沈宅歇著。`;
        case 'guest':
            return `${n}是白家千金：晌午逛霞飛路，傍晚起在戲園包廂聽戲捧場，深宵回白公館。`;
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
