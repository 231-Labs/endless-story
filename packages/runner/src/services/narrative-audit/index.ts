/**
 * Narrative self-check — deterministic zero-cost lint over chapter prose for structural
 * hard errors (role-craft, gender pronouns/honorifics, leaked mechanism tokens). Fully
 * data-driven from roleCraftRules + the passed roster; unknown roles are permissive.
 * The caller feeds violations back for one corrective regeneration.
 */

// Single-file subpath (not the barrel) so node --test can load this without the shared index.
import { BEARD_WORDS, PLAY_KINDS, roleCraftRules } from '@endless-story/shared/role-rules';

export interface AuditSubject {
    name: string;
    role: string;
    gender: string;
}
export interface AuditPeer {
    name: string;
    gender: string;
    role?: string;
}

// Leaked single card char in 〔〕/《》/「」. Single-char only so real plays (《斬馬謖》)
// don't trip it. Backstop; the root fix is act.ts cardActionPhrase.
const TOKEN_RE = /[〔《「][斬攻敘誘守觀讓][〕》」]/;
// <ascii-kind>:<Chinese> is a leaked mechanism label (recording:/partnership:/…).
const RAWLABEL_RE = /[a-z][a-z0-9_]{2,}:[一-鿿]/;
const BEARD_RE = new RegExp(BEARD_WORDS.join('|'), 'g');
// 他 right after these (passive/coverb/aspect) is an OBJECT pointing at someone else.
const COVERB = '被讓叫使令給跟向和與同替為陪找問看盯瞧望喚求勸罵著了過';

/** Non-negated beard mention (negation on either side means "no beard", which is fine). */
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

/** A female playing male stage roles (小生/坤生): others may call her 他, so exclude
 *  her from the female-pronoun check. Derived from role+gender, no character names. */
function presentsMale(p: { gender: string; role?: string }): boolean {
    return p.gender === '女' && /生/.test(p.role ?? '');
}

export function auditProse(text: string, subject: AuditSubject, roster: AuditPeer[] = []): string[] {
    const v: string[] = [];
    if (TOKEN_RE.test(text)) v.push('機制 token 洩漏：正文出現卡牌符號〔斬/攻/…〕，應改寫成可觀察的動作');
    if (RAWLABEL_RE.test(text)) v.push('機制 token 洩漏：正文出現資源原始標籤（recording:/partnership:/…），應用人話');

    const rules = roleCraftRules(subject.role);
    if (!rules.beardAllowed && beardViolation(text)) {
        v.push(`行當錯誤：${subject.name}（${subject.role}）俊扮無鬚，正文不該出現鬍鬚/髯口（髯口屬老生/淨）`);
    }
    for (const kind of rules.forbiddenPlayKinds) {
        const hit = (PLAY_KINDS[kind] ?? []).find((p: string) => text.includes(p));
        if (hit) v.push(`戲碼錯誤：「${hit}」是${kind}戲，非${subject.role}應工`);
    }

    // Pronoun 他: only non-stage-male females (a 坤生 is legitimately 他 on stage).
    const females = roster.filter((p) => p.gender === '女' && !presentsMale(p)).map((p) => p.name);
    const maleRef =
        [...new Set(roster.filter((p) => p.gender === '男' || presentsMale(p)).map((p) => p.name[0]))].join('') || ' ';
    for (const name of females) {
        const he = new RegExp(`${name}(?:(?![${maleRef}。？！\\n])[\\s\\S]){0,8}?(?<![${COVERB}])他(?!們)`);
        if (he.test(text)) v.push(`性別代詞錯誤：${name}是女性，第三人稱應用「她」`);
    }

    // Male kinship terms (師兄/師哥/師弟) are a gender error for every female INCLUDING a
    // 坤生 (male on stage, but as a disciple she is 師姐/師妹). Caught by name-adjacency,
    // plus a bare-term check in a female subject's POV when the cast has no male to own it.
    const hasMale = roster.some((p) => p.gender === '男');
    for (const p of roster.filter((q) => q.gender === '女')) {
        if (new RegExp(`${p.name[0]}[\\s\\S]{0,6}師[兄哥弟]|師[兄哥弟][\\s\\S]{0,6}${p.name[0]}`).test(text)) {
            v.push(
                `稱謂錯誤：${p.name}是女子，應稱師姐／師妹，不可稱師兄／師哥／師弟` +
                    (presentsMale(p) ? '（她台上扮小生，但做為人仍是女子）' : ''),
            );
        }
    }
    if (subject.gender === '女' && !hasMale && /師[兄哥弟]/.test(text)) {
        v.push(`稱謂錯誤：${subject.name}本人是女子、全班無男性，正文不該出現「師兄／師哥／師弟」，應為師姐／師妹`);
    }

    // A male honorific on any female's surname is a gender error even for a 坤生: it
    // addresses the person, not the stage role. 老闆/老板 is gender-neutral, not flagged.
    const MALE_HONORIFIC = '老爺子|老太爺|老爺|少爺|大爺|公子|相公|爺們';
    for (const p of roster.filter((q) => q.gender === '女')) {
        if (new RegExp(`${p.name[0]}(?:${MALE_HONORIFIC})`).test(text)) {
            v.push(
                `稱謂錯誤：${p.name}是女子，不可冠以「老爺／老爺子／少爺／公子」等男性稱謂；` +
                    (presentsMale(p)
                        ? '她台上扮小生，但台下、做為人仍是女子，可稱她「老闆／角兒」，不可當男人稱呼'
                        : '應以女子的稱謂相稱'),
            );
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
