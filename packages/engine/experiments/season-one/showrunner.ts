/**
 * 立局人 Showrunner (RUNNER_V2 §9) — the SEASON config. It sets world facts and
 * a pressure deadline; it NEVER scripts a character's choice (§2.42). Its razor
 * is a pure, mechanically-checkable world-state predicate (§9 "最容易腐化的一層"):
 * the season is "complete" when a 新戲 has a script fragment, ≥2 cast, enough
 * rehearsal effort, and has been performed — NOT when any character's arc lands.
 */

import { totalRehearsalEffort, type NewPlay } from './play.ts';

/** SEASON_ONE_SLICE §6 — the prologue, VERBATIM. Injected as world fact at t0. */
export const PROLOGUE = [
    '春雪社的這座戲台，原是清末一位官紳家的堂會戲台。改朝換代後，官宦人家的排場散了，這方戲台連著半進院子，被沈雪笙盤了下來，掛上春雪社的水牌。正樑上那塊舊匾額她一直沒換，燙金的字暗了，至今照舊掛著。',
    '戲台最裡頭的後台，那幾口樟木戲箱，落了十五年的灰。十五年前沈雪笙封箱那日，班裡如今這批台前的人多半還是孩子。她沒對任何人交代緣由，只說往後這幾箱小生的行頭不再動了。班子靠著幾齣熟戲，一年一年也就過來了，台下的人換了一批又一批，戲單卻還是那張戲單。',
    '今年不同。霞飛路那頭新起的戲園放出話來，年底要辦一場打對台的大會串。掛得上名的班子，往後的檔期、報上的版面、堂會的邀約，都在這一場上見高低。掛不上的，慢慢就沒人記得了。',
    '沈雪笙把那口最底下的箱子開了一條縫。裡頭壓著的，除了那幾件沒人再穿的小生戲衣，還有一只早停了的懷錶。',
    '戲箱要重開了。這一季，春雪社得排出一齣自己的新戲，趕在年底那場會串之前。至於箱底那些沒說完的舊事，沒有人交代該怎麼辦。',
].join('\n');

export interface SeasonConfig {
    /** The season's central question (§1). */
    centralQuestion: string;
    /** Total ticks; the finale (會串) runs on the last one. */
    totalTicks: number;
    /** Rehearsal-effort floor the razor requires. */
    rehearsalThreshold: number;
    /** Days-left on the deadline for a given tick (decrements). */
    daysLeft(tick: number): number;
    /** The deadline world-fact line for a tick (a FACT, never an instruction). */
    deadlineFact(tick: number): string;
    /** Full world fact injected into every character each tick: prologue essence
     *  at t0, then the season situation + the decrementing deadline. */
    worldFact(tick: number): string;
}

export function makeSeasonConfig(totalTicks = 10, rehearsalThreshold = 2): SeasonConfig {
    // Prologue essence (the season situation as standing world facts) injected
    // every tick so a character always lives inside it; the full §6 prologue text
    // is additionally injected at t0.
    const situation =
        '春雪社封了十五年的樟木戲箱重開了；霞飛路新起的戲園年底辦打對台大會串，掛得上名的班子往後拿檔期、報上的版面、堂會的邀約，掛不上的慢慢沒人記得。箱底除了沒人再穿的小生戲衣，還壓著一只早停了的懷錶。';
    const daysLeft = (tick: number): number => Math.max(3, (totalTicks - tick) * 3);
    const deadlineFact = (tick: number): string => `距年底那場打對台大會串，還有 ${daysLeft(tick)} 天。`;
    return {
        centralQuestion: '春雪社能不能重啟戲箱、排出並演出一齣自己的新戲。',
        totalTicks,
        rehearsalThreshold,
        daysLeft,
        deadlineFact,
        worldFact: (tick: number) =>
            (tick === 0 ? `${PROLOGUE}\n` : '') + `${situation}\n${deadlineFact(tick)}`,
    };
}

export interface SeasonPredicate {
    complete: boolean;
    components: {
        hasPlay: boolean;
        hasFragment: boolean;
        castAtLeastTwo: boolean;
        rehearsalMet: boolean;
        performed: boolean;
    };
}

/** The razor — a pure world-state predicate (never a character-arc outcome). */
export function isSeasonComplete(play: NewPlay | null, cfg: SeasonConfig): SeasonPredicate {
    const hasPlay = !!play;
    const hasFragment = (play?.fragments.length ?? 0) >= 1;
    const castAtLeastTwo = (play?.cast.size ?? 0) >= 2;
    const rehearsalMet = play ? totalRehearsalEffort(play) >= cfg.rehearsalThreshold : false;
    const performed = play?.performed ?? false;
    return {
        complete: hasPlay && hasFragment && castAtLeastTwo && rehearsalMet && performed,
        components: { hasPlay, hasFragment, castAtLeastTwo, rehearsalMet, performed },
    };
}
