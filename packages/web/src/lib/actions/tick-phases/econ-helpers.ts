/* ── shared economy helpers for the GIVE / ASK tick phases ──────────────
 * Coarse, off-chain survival-shadow reads (funds / runway / vitality) + a keyword tie classifier.
 * Live data only carries relationship TONE, not the eval's typed lover/mentor — so relation is
 * coarse (ally/neutral/rival). Plain module. */
import type { Character } from '@endless-story/shared';

/** A character is a plausible GIVER when its own survival is comfortable. */
export function canSpare(c: Character | undefined): boolean {
    if (!c) return false;
    const lvl = c.survival?.level;
    return (lvl === 'healthy' || lvl === 'stable') && (c.survival?.funds ?? 0) > 0;
}

/** A character is visibly IN NEED (a candidate recipient / a would-be asker). */
export function inNeed(c: Character | undefined): boolean {
    if (!c) return false;
    const lvl = c.survival?.level;
    const vit = c.survival?.vitalityState;
    return lvl === 'low' || lvl === 'critical' || vit === 'strained' || vit === 'failing';
}

/** Coarse tie from a character's relationship hints about a named peer. Defaults to neutral. */
export function relationFromHints(hints: string[], peerName: string): 'ally' | 'neutral' | 'rival' {
    const about = hints.find((h) => h.includes(peerName));
    if (!about) return 'neutral';
    if (/仇|怨|隙|敵|爭|惡/.test(about)) return 'rival';
    if (/情|恩|盟|摯|親|愛|知己|師|義/.test(about)) return 'ally';
    return 'neutral';
}

export function situationOf(c: Character): 'dire-need' | 'tight' | 'stable' {
    const lvl = c.survival?.level;
    const vit = c.survival?.vitalityState;
    if (lvl === 'critical' || vit === 'failing') return 'dire-need';
    if (lvl === 'low' || vit === 'strained') return 'tight';
    return 'stable';
}

export function distressOf(c: Character): string {
    const s = c.survival;
    const days = s?.daysLeft != null && s.daysLeft < 999 ? `約撐 ${s.daysLeft} 日` : '勉力支應';
    const vit = s?.vitalityState === 'failing' ? '、氣血瀕危' : s?.vitalityState === 'strained' ? '、見疲態' : '';
    return `現銀約 ${Math.round(s?.funds ?? 0)}、${days}${vit}`;
}

/** How well-off a potential giver visibly is (for the ASK candidate list). */
export function standingOf(c: Character): string {
    const lvl = c.survival?.level;
    return lvl === 'healthy' ? '家底厚實' : lvl === 'stable' ? '尚可' : '自身難保';
}
