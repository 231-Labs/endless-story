/**
 * Livelihood day-rhythm (行當節律) — pure, seed-agnostic, no LLM.
 *
 * An honest day has a shape: you rise and go to where your keep is earned, you
 * work through the middle of the day, at dusk you wind down, and at night you
 * go home to rest. This turns the current part-of-day plus a character's own
 * 做活處／住處 (work/home scenes, seeded per-character in the preset) into a
 * one-line, plain-language sense of where a person with nothing more pressing
 * would be right now.
 *
 * It is a PULL, never a command (NARRATIVE_AGENTS §2.43). The line is fed into
 * the move prompt as a soft backdrop the character's own wants, called duties,
 * or ripe longings freely override; it routes no one. The tick keeps exactly
 * one movement authority — the character's own choice — and this only gives an
 * idle character with no live want a reason to earn their keep or go home
 * instead of wandering.
 *
 * Occupation specifics (a 歌女 who sings at 入夜, a 記者 who files at 深宵) are
 * deliberately NOT HARD-CODED here: that knowledge is per-world and would nail
 * one saga's venues into the engine core. The generic day/night shape fits ANY
 * seed; a character whose living runs against the common clock simply overrides
 * the pull with their standing plan or a live want. When a seed DOES declare a
 * character's行當專屬節律 (a per-part duty venue), the tick passes the resolved
 * duty into `dutyRhythm` below — the venue still comes from the SEED, so this
 * module stays seed-agnostic; it only renders whatever duty it is handed.
 *
 * Keyed on the six canonical part-of-day labels (see PARTS_OF_DAY in ports),
 * which the clock always produces regardless of ticks-per-day.
 */

/**
 * @param partOfDay one of the six canonical labels (清晨/日午/晡時/黃昏/入夜/深宵)
 * @param workScene the character's 做活處 name, if seeded
 * @param homeScene the character's 住處 name, if seeded
 * @returns a one-line livelihood expectation, or undefined for an unknown label
 */
export function livelihoodRhythm(
    partOfDay: string,
    workScene?: string,
    homeScene?: string,
): string | undefined {
    const at = (scene?: string) => (scene ? `「${scene}」` : undefined);
    const work = at(workScene);
    const home = at(homeScene);
    switch (partOfDay) {
        case '清晨':
            return work
                ? `天光初起，梳洗過便往營生上去。你做活的地方在${work}——沒有更要緊的牽絆，這時辰該動身理你的營生。`
                : '天光初起，多數人起身理一日的營生了。';
        case '日午':
            return work
                ? `正是做活的時辰。你營生的地方在${work}，尋常人這會兒都在本分上；除非有更要緊的事牽住你的腳，便該在那兒張羅。`
                : '正是做活的時辰，多數人都在營生上忙著。';
        case '晡時':
            return work
                ? `晌午已過，活計未歇。你做活的地方在${work}，多數人這時仍守著營生；沒有旁的要緊事，就守你的本分。`
                : '晌午已過，活計未歇，多數人仍在營生上。';
        case '黃昏':
            return home
                ? `日將落，一天的活計收尾。忙完手邊的便可打點歸家（你的住處在${home}）；也還趕得及趁天沒黑透，去辦一樁擱著的事。`
                : '日將落，一天的活計收尾。忙完手邊的便可打點歸家；也還趕得及趁天沒黑透，去辦一樁擱著的事。';
        case '入夜':
            return home
                ? `戲散人乏，這時辰各自歸宿。你的住處在${home}，沒有非做不可的事，便回去歇著。`
                : '戲散人乏，這時辰各自歸宿；沒有非做不可的事，便回住處歇著。';
        case '深宵':
            return home
                ? `夜已深，尋常人都在住處睡下。你的住處在${home}。`
                : '夜已深，尋常人都在住處睡下。';
        default:
            return undefined;
    }
}

/** Parts of the day where being on-post reads as working AGAINST the common
 *  clock (everyone else is winding down / asleep) — a 歌女 singing 堂會 or a
 *  記者 chasing the 付梓 deadline. A duty at these parts is framed as the night
 *  shift the trade demands; day duties read as the ordinary working middle. */
const NIGHT_DUTY_PARTS = new Set(['入夜', '深宵']);

/**
 * Duty-aware livelihood rhythm (行當專屬節律). When a character has a resolved
 * duty for THIS part of the clock, this returns a stronger, ON-POST line naming
 * the duty venue — framed as binding營生 (the trade's demand, your keep + your
 * face in this line ride on it), NOT a want the character may weigh. It is still
 * only fed into the move prompt as a soft pull; the tick keeps exactly one
 * movement authority (the character's own choice), so a ripe want can still
 * override it — but the framing tells the character this is the hour their
 * living is earned. With no duty it delegates to `livelihoodRhythm` unchanged.
 *
 * Pure + seed-agnostic: the venue/note are handed in (resolved from the seed's
 * occupationDuties at seed time), never hard-coded here.
 *
 * @param partOfDay one of the six canonical labels (清晨/日午/晡時/黃昏/入夜/深宵)
 * @param duty this part's resolved duty (venue name + optional note), or undefined
 * @param workScene the character's 做活處 name — the no-duty fallback's day anchor
 * @param homeScene the character's 住處 name — the no-duty fallback's night anchor
 * @returns an on-post duty line, or the generic rhythm line when there is no duty
 */
export function dutyRhythm(
    partOfDay: string,
    duty: { sceneName: string; note?: string } | undefined,
    workScene?: string,
    homeScene?: string,
): string | undefined {
    if (!duty) return livelihoodRhythm(partOfDay, workScene, homeScene);
    const note = duty.note ? `${duty.note}，` : '';
    const venue = `「${duty.sceneName}」`;
    if (NIGHT_DUTY_PARTS.has(partOfDay)) {
        // Night duty: the trade works while the town sleeps — a stronger 當值 pull.
        return `${partOfDay}正是你當值的時辰：${note}該在${venue}當差。旁人這時辰都歇下了，你的營生偏在此刻——這不是想不想去，你的進項、你這行的臉面都在這上頭。旁的事，等當差歇了再說。`;
    }
    // Day duty: the ordinary working hours, but this is your post, not a choice.
    return `${partOfDay}正是你當差的時辰：${note}該在${venue}上坐鎮理事。這是營生正事，不是想不想去——你的進項、你這行的臉面都繫在這上頭。旁的事，等當差歇了再說。`;
}
