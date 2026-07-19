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
 * deliberately NOT modelled here: that knowledge is per-world and would hard-
 * code one saga's venues into the engine core. The generic day/night shape
 * fits ANY seed; a character whose living runs against the common clock simply
 * overrides the pull with their standing plan or a live want.
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
