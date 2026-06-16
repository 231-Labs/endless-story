/**
 * 行當 taxonomy + casting helpers — the Round-0 "single source of truth" the
 * production engine needs (the live repo has four divergent role vocabularies;
 * this is the consolidated shape a real `hangdang.ts` would carry).
 *
 * The load-bearing idea: a ROLE's gender is orthogonal to the ACTOR's gender,
 * so cross-casting (乾旦 = male plays 旦, 坤生 = female plays 生) is a first-class
 * boolean a casting engine reports as prestige, never an error.
 */

import type { CastAssignment, Gender, Hangdang, Part, TroupeMember, Yinggong } from './types.ts';

export const HANGDANG_LABEL: Record<Hangdang, string> = {
  生: '生',
  旦: '旦',
  淨: '淨（花臉）',
  丑: '丑',
  樂: '文武場',
};

/** Which 行當 each 應工 belongs to. */
export const YINGGONG_HANGDANG: Record<Yinggong, Hangdang> = {
  文小生: '生', 武小生: '生', 老生: '生', 武生: '生', 紅生: '生', 娃娃生: '生',
  青衣: '旦', 花旦: '旦', 花衫: '旦', 武旦: '旦', 刀馬旦: '旦', 老旦: '旦',
  銅錘花臉: '淨', 架子花臉: '淨', 武淨: '淨',
  文丑: '丑', 武丑: '丑',
  琴師: '樂', 鼓師: '樂',
};

/** 文/武 axis of an 應工 — used to match a part's martial demand. */
export function martialOf(y: Yinggong): '文' | '武' | '文武' {
  if (['武小生', '武生', '武旦', '刀馬旦', '武淨', '武丑'].includes(y)) return '武';
  if (['花衫', '紅生'].includes(y)) return '文武';
  return '文';
}

/**
 * Cross-cast label. A 旦 played by a man = 乾旦 (梅蘭芳); a 生 played by a woman
 * = 坤生 (孟小冬). Other actor≠role mismatches are legal but unnamed here.
 */
export function crossCastLabel(
  roleHangdang: Hangdang,
  actorGender: Gender,
  roleGender: Gender,
): '乾旦' | '坤生' | null {
  if (actorGender === roleGender) return null;
  if (roleHangdang === '旦' && actorGender === 'male') return '乾旦';
  if (roleHangdang === '生' && actorGender === 'female') return '坤生';
  return null;
}

/**
 * Map a 行當/應工 string (a chain role tag, e.g. '花旦' / '文小生' / '銅錘花臉' /
 * '琴師' / '班主') to a casting slot. Best-effort, never throws — used to build a
 * TroupeMember from on-chain roster data. Exact 應工 match wins (longest first);
 * else a 行當-keyword fallback; else a safe 生/文小生 default.
 */
export function castingFromRole(role: string): { hangdang: Hangdang; yinggong: Yinggong } {
  const r = (role || '').trim();
  const keys = (Object.keys(YINGGONG_HANGDANG) as Yinggong[]).sort((a, b) => b.length - a.length);
  for (const y of keys) if (r.includes(y)) return { hangdang: YINGGONG_HANGDANG[y], yinggong: y };
  if (/淨|花臉|大面|銅錘|架子/.test(r)) return { hangdang: '淨', yinggong: '銅錘花臉' };
  if (/丑/.test(r)) return { hangdang: '丑', yinggong: '文丑' };
  if (/琴|樂|鼓|場面|文武場|司鼓/.test(r)) return { hangdang: '樂', yinggong: '琴師' };
  if (/小生|坤生|乾生/.test(r)) return { hangdang: '生', yinggong: '文小生' };
  if (/旦|青衣|花衫|名伶|坤伶/.test(r)) return { hangdang: '旦', yinggong: '青衣' };
  if (/武生/.test(r)) return { hangdang: '生', yinggong: '武生' };
  if (/生|老生|鬚生/.test(r)) return { hangdang: '生', yinggong: '老生' };
  return { hangdang: '生', yinggong: '文小生' };
}

/**
 * How well a member fits a part (0..100). Pure 行當 craft fit — emotional
 * casting (giving the stage-couple role to two who love off-stage) is layered
 * on top by the caster, not here.
 */
export function fitScore(member: TroupeMember, part: Part): number {
  let s = 0;
  if (member.hangdang === part.hangdang) s += 50;
  if (member.yinggong.includes(part.yinggong)) s += 30;
  else if (member.yinggong.some((y) => martialOf(y) === part.martial)) s += 12;
  // perf competence in the matching skill nudges the fit (aligned to main's keys).
  const craftKey = part.hangdang === '旦' ? 'vocal' : part.martial === '武' ? 'movement' : 'vocal';
  s += Math.round(((member.skills.find((k) => k.key === craftKey)?.value ?? 0) / 100) * 20);
  return s;
}

/** Build a CastAssignment for a chosen member (or unfilled). */
export function assign(part: Part, member: TroupeMember | null, alternates: TroupeMember[]): CastAssignment {
  if (!member) {
    return {
      ...part,
      assignedId: null,
      assignedName: null,
      actorGender: null,
      isCrossCast: false,
      crossCastLabel: null,
      alternates: alternates.map((m) => m.name),
    };
  }
  const label = crossCastLabel(part.hangdang, member.actorGender, part.roleGender);
  return {
    ...part,
    assignedId: member.id,
    assignedName: member.name,
    actorGender: member.actorGender,
    isCrossCast: label !== null || member.actorGender !== part.roleGender,
    crossCastLabel: label,
    alternates: alternates.map((m) => m.name),
  };
}
