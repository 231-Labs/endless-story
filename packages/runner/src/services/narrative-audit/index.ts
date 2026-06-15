/**
 * Narrative self-check — deterministic, zero-cost lint over generated chapter prose.
 *
 * Catches the *structural* hard errors a beardless 行當 sprouting a beard, a 小生 leading a
 * 老生 play, a female character mis-pronouned 他, mechanism tokens leaking into prose. It is
 * NOT a taste/plot critic (an optional LLM pass can do that later).
 *
 * Fully data-driven, no per-saga hardcoding:
 *   - craft rules come from `roleCraftRules` (substring match on the free-form role string;
 *     unknown roles are permissive — we never block prose for a 行當 we don't recognise);
 *   - gender/pronoun rules are derived from the roster passed in (who is female, who presents
 *     male on stage), so adding a character or a 行當 needs no change here.
 *
 * Returns a list of human-readable violations (empty = clean). The caller (character-worker /
 * event-chapter-compiler) feeds these back for a single corrective regeneration.
 */

// Import from the single-file subpath (not the barrel) so the self-check stays a pure,
// dependency-light module the test runner can load without resolving the whole shared index.
import { BEARD_WORDS, PLAY_KINDS, roleCraftRules } from '@endless-story/shared/role-rules';

export interface AuditSubject {
    name: string;
    role: string;
    gender: string;
}
/** A saga peer the prose might refer to; only name + gender + role are needed. */
export interface AuditPeer {
    name: string;
    gender: string;
    role?: string;
}

// A leaked card token: a single card char wrapped in 〔〕 / 《》 / 「」. Single-char
// only, so real multi-char plays (《斬馬謖》) don't trip it. Root fix is to never feed
// the raw token to the prompt (act.ts cardActionPhrase); this is the backstop.
const TOKEN_RE = /[〔《「][斬攻敘誘守觀讓][〕》」]/;
// Any <ascii-kind>:<Chinese> shape is a leaked mechanism label (recording:/partnership:/…).
const RAWLABEL_RE = /[a-z][a-z0-9_]{2,}:[一-鿿]/;
const BEARD_RE = new RegExp(BEARD_WORDS.join('|'), 'g');
// 「他」right after these (passive/coverb/aspect) is an OBJECT pointing at someone else.
const COVERB = '被讓叫使令給跟向和與同替為陪找問看盯瞧望喚求勸罵著了過';

/** A non-negated beard mention (negation on either side ⇒ "has no beard", which is fine). */
function beardViolation(text: string): boolean {
    BEARD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BEARD_RE.exec(text)) !== null) {
        const pre = text.slice(Math.max(0, m.index - 5), m.index);
        const post = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
        const negated = /[不沒未無莫勿別]/.test(pre) || /[沒無未]|不見|半根/.test(post);
        if (!negated) return true;
    }
    return false;
}

/** A 女演員 playing male roles on stage (小生/坤生/…): others may call her 他, so exclude her
 *  from the female-pronoun check. Derived from role+gender — no character names. */
function presentsMale(p: { gender: string; role?: string }): boolean {
    return p.gender === '女' && /生/.test(p.role ?? '');
}

export function auditProse(text: string, subject: AuditSubject, roster: AuditPeer[] = []): string[] {
    const v: string[] = [];
    if (TOKEN_RE.test(text)) v.push('機制 token 洩漏：正文出現卡牌符號〔斬/攻/…〕，應改寫成可觀察的動作');
    if (RAWLABEL_RE.test(text)) v.push('機制 token 洩漏：正文出現資源原始標籤（recording:/partnership:/…），應用人話');

    // Craft rules from the role string (flexible substring match; unknown roles permissive).
    const rules = roleCraftRules(subject.role);
    if (!rules.beardAllowed && beardViolation(text)) {
        v.push(`行當錯誤：${subject.name}（${subject.role}）俊扮無鬚，正文不該出現鬍鬚/髯口（髯口屬老生/淨）`);
    }
    for (const kind of rules.forbiddenPlayKinds) {
        const hit = (PLAY_KINDS[kind] ?? []).find((p: string) => text.includes(p));
        if (hit) v.push(`戲碼錯誤：「${hit}」是${kind}戲，非${subject.role}應工`);
    }

    // Pronoun + kinship: derived from the roster (no hardcoded names).
    const females = roster.filter((p) => p.gender === '女' && !presentsMale(p)).map((p) => p.name);
    const maleRef =
        [...new Set(roster.filter((p) => p.gender === '男' || presentsMale(p)).map((p) => p.name[0]))].join('') || ' ';
    for (const name of females) {
        const he = new RegExp(`${name}(?:(?![${maleRef}。？！\\n])[\\s\\S]){0,8}?(?<![${COVERB}])他(?!們)`);
        if (he.test(text)) v.push(`性別代詞錯誤：${name}是女性，第三人稱應用「她」`);
        if (new RegExp(`${name}[\\s\\S]{0,6}師[兄哥]|師[兄哥][\\s\\S]{0,6}${name}`).test(text)) {
            v.push(`稱謂錯誤：${name}是女性，應稱師姐/師妹，不可稱師兄/師哥`);
        }
    }
    return [...new Set(v)];
}

/** Format violations into a corrective addendum for one regeneration pass. */
export function correctionNote(violations: string[]): string {
    return [
        '',
        '# ⚠️ 上一稿有以下硬傷，請在保留情節與好句的前提下改寫修正（只動錯處）：',
        ...violations.map((x) => `- ${x}`),
        '改寫後直接輸出修正版正文，不要解釋。',
    ].join('\n');
}
