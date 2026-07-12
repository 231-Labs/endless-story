/**
 * AGENT-SEASON · SHOWRUNNER — the season config + the ending razor (§1).
 * ============================================================================
 * The立局人 sets WORLD FACTS, never instructions to characters (§2.42 discipline):
 *   - a central question the season is testing;
 *   - a deadline (the 年底大會串) that is a WORLD FACT injected each 時辰 as
 *     "距年底大會串還有 X 天", tightening as X shrinks — never "make a play";
 *   - a razor predicate: a mechanically-checkable true/false over the Play. This is
 *     "did the season run" (separate from whether the box office was good).
 */

import { type Play, totalEffort } from './production.ts';

export interface SeasonConfig {
    centralQuestion: string;
    /** the last day = the finale. */
    deadlineDay: number;
    /** the 時辰 the finale premieres in. */
    finalePart: string;
    /** rehearsal-effort floor the razor requires. */
    rehearsalEffortThreshold: number;
    /** what the season's terminal event is CALLED in-world (e.g. 年底大會串). */
    finaleName: string;
    /** one world-context line appended to the countdown (the stakes flavor). */
    countdownFlavor: string;
}

/** Per-season theme overrides — a NEW season should grow its question out of the
 *  prior season's ending, not re-run 重啟戲箱 forever (theme fatigue). The
 *  showrunner/owner sets WORLD FACTS only; characters still choose everything. */
export interface SeasonTheme {
    centralQuestion?: string;
    finaleName?: string;
    countdownFlavor?: string;
    rehearsalEffortThreshold?: number;
}

export function makeShowrunner(days: number, theme: SeasonTheme = {}): SeasonConfig {
    return {
        centralQuestion:
            theme.centralQuestion ?? '春雪社能不能重啟戲箱、排出並演出一齣自己的新戲，趕在年底大會串之前。',
        deadlineDay: days,
        finalePart: '入夜',
        rehearsalEffortThreshold: theme.rehearsalEffortThreshold ?? 4,
        finaleName: theme.finaleName ?? '年底大會串',
        countdownFlavor:
            theme.countdownFlavor ??
            '霞飛路新戲園要辦一場打對台的大會串，掛得上名的班子往後的檔期、報上的版面、堂會的邀約都在這一場上見高低。',
    };
}

/**
 * The deadline as a WORLD FACT (not an instruction). Tightens as the day nears.
 * Injected into every 時辰's plan context; never tells a character to premiere.
 */
export function countdownLine(cfg: SeasonConfig, currentDay: number): string {
    const remaining = Math.max(0, cfg.deadlineDay - currentDay);
    if (remaining <= 0) return `距${cfg.finaleName}只剩今日：就在今夜，滿城的眼睛都望著這一場。`;
    if (remaining === 1) return `距${cfg.finaleName}還有一天：就在明日，滿城的班子都在備著。`;
    if (remaining <= 3) return `距${cfg.finaleName}還有 ${remaining} 天：日子近了，街面上議論的都是這一場。`;
    return `距${cfg.finaleName}還有 ${remaining} 天：${cfg.countdownFlavor}`;
}

export interface Verdict {
    passed: boolean;
    reasons: string[];
}

/**
 * The ending razor: a Play with script.length>0 AND cast.length>=2 AND
 * totalEffort>=threshold AND state==='premiered'. Mechanically true/false.
 */
export function razor(cfg: SeasonConfig, play: Play): Verdict {
    const scriptOk = play.scriptFragments.length > 0;
    const castOk = play.cast.length >= 2;
    const eff = totalEffort(play);
    const effortOk = eff >= cfg.rehearsalEffortThreshold;
    const premiered = play.state === 'premiered';
    const reasons = [
        `劇本片段 ${play.scriptFragments.length} 段（需 >0）：${scriptOk ? 'PASS' : 'FAIL'}`,
        `選角 ${play.cast.length} 人（需 ≥2）：${castOk ? 'PASS' : 'FAIL'}`,
        `排練投入 ${eff.toFixed(1)}（需 ≥${cfg.rehearsalEffortThreshold}）：${effortOk ? 'PASS' : 'FAIL'}`,
        `在大會串上被演出（state=premiered）：${premiered ? 'PASS' : 'FAIL'}`,
    ];
    return { passed: scriptOk && castOk && effortOk && premiered, reasons };
}
