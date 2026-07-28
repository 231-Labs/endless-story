/**
 * 秘密與洩漏 — secrets as MECHANISM, not as backstory prose.
 *
 * Diagnosed failure: 「三把上膛的槍三天未發」. 方競西's 血帳, 唐桂蘭衣箱的秘密,
 * 殷阿婆知道的舊事 all sat in `CastMember.secret` as private colour — read into
 * prompts, never able to GO OFF. A secret with no holder/coveter/leak structure
 * is a prop, and props don't fire.
 *
 * This ledger gives every loaded gun three things:
 *   · a HOLDER (who keeps it) and a SUBJECT (who it can ruin),
 *   · COVETERS (who would trade, buy, or print it), and
 *   · finite LEAK CONDITIONS the engine can evaluate deterministically.
 *
 * And it closes the press loop the diagnosis named: a 記者 who knows ANY secret
 * automatically carries a dated 「發不發」 want. Publish and it resolves; sit on it
 * past the deadline and it forecloses. Either way it leaves the board — which is
 * exactly the heartbeat a write-only want system lacked.
 */

import { accountFace, yuanToSubunits } from './season-economy.ts';
import { plantWant } from './income-events.ts';
import type { Want } from './want-core.ts';
import type { WorldState } from '../world-state.ts';

/** How a secret comes out. Every member is checkable from persisted state, so a
 *  replayed run leaks the same secrets on the same ticks. */
export type SecretLeakCondition =
    /** 日子到了 — a slow fuse: the thing simply cannot stay quiet past this day. */
    | { kind: 'day-atleast'; day: number }
    /** 當眾失了體面 — a holder whose 名頭 has fallen this far stops guarding it. */
    | { kind: 'holder-renown-below'; renown: number }
    /** 窮到頭了 — a holder whose purse falls this low will sell it. */
    | { kind: 'holder-broke-below'; yuan: number }
    /** 覬覦者到跟前 — a coveter shares the holder's scene (they got close enough). */
    | { kind: 'coveter-copresent' };

export interface WorldSecret {
    id: string;
    /** what it IS, in world language — one line, quotable in a percept. */
    matter: string;
    /** who keeps it. */
    holderIds: string[];
    /** who it can ruin (its subject). Absent for a secret about no one present. */
    aboutId?: string;
    /** who would trade, buy, or print it. */
    coveterIds: string[];
    leakWhen: SecretLeakCondition[];
    /** everyone who now knows — holders plus whoever it has reached. */
    knownByIds: string[];
    /** the day it stopped being a secret (irreversible). */
    leakedDay?: number;
    /** the day it went to print (irreversible; ruins the subject's 名頭). */
    publishedDay?: number;
    /** the 「發不發」 wants this secret has already planted, by want id — the dedup
     *  key that stops a recurring pass from re-planting the same dilemma. */
    pressWantIds?: string[];
}

/** 報館口徑 — roles the world treats as press. A character with one of these
 *  roles who learns a secret is structurally obliged to decide about it. */
export const PRESS_ROLES = ['記者', '主筆', '編輯', '報館'] as const;

/** How long a 記者 may sit on a secret before the dilemma forecloses. */
export const PRESS_DEADLINE_DAYS = 3;

export function isPressRole(role?: string): boolean {
    if (!role) return false;
    return PRESS_ROLES.some((needle) => role.includes(needle));
}

/** Seed the ledger on a fresh world. Idempotent by secret id, so re-applying a
 *  season frame never duplicates a gun. */
export function seedSecretLedger(
    world: WorldState,
    seeds: ReadonlyArray<{
        id: string;
        matter: string;
        holderNames: string[];
        aboutName?: string;
        coveterNames?: string[];
        leakWhen?: SecretLeakCondition[];
    }>,
): number {
    if (!seeds.length) return 0;
    const ledger = (world.data.secretLedger ??= []);
    const idOf = (name: string): string | undefined => (world.castById(name) ? name : world.idByName(name));
    let added = 0;
    for (const seed of seeds) {
        if (ledger.some((row) => row.id === seed.id)) continue;
        const holderIds = seed.holderNames.map(idOf).filter((id): id is string => !!id);
        if (!holderIds.length) continue; // a secret nobody in this cast holds is not a secret
        const aboutId = seed.aboutName ? idOf(seed.aboutName) : undefined;
        ledger.push({
            id: seed.id,
            matter: seed.matter,
            holderIds,
            ...(aboutId ? { aboutId } : {}),
            coveterIds: (seed.coveterNames ?? []).map(idOf).filter((id): id is string => !!id),
            leakWhen: seed.leakWhen ?? [],
            knownByIds: [...holderIds],
        });
        added += 1;
    }
    return added;
}

/** Someone learned it. Monotonic (never un-learns) and idempotent. */
export function learnSecret(world: WorldState, secretId: string, characterId: string): boolean {
    const secret = world.data.secretLedger?.find((row) => row.id === secretId);
    if (!secret || !world.castById(characterId)) return false;
    if (secret.knownByIds.includes(characterId)) return false;
    secret.knownByIds.push(characterId);
    return true;
}

/** Does this leak condition hold right now? Pure read. */
function conditionHolds(world: WorldState, secret: WorldSecret, condition: SecretLeakCondition, day: number): boolean {
    switch (condition.kind) {
        case 'day-atleast':
            return day >= condition.day;
        case 'holder-renown-below':
            return secret.holderIds.some((id) => world.renownOf(id) < condition.renown);
        case 'holder-broke-below': {
            const threshold = world.data.economy ? yuanToSubunits(world, condition.yuan) : 0n;
            return secret.holderIds.some((id) => {
                const purse = accountFace(world, id);
                return !!purse && purse.available < threshold;
            });
        }
        case 'coveter-copresent':
            return secret.coveterIds.some((coveterId) =>
                secret.holderIds.some((holderId) => world.data.roster[coveterId] && world.data.roster[coveterId] === world.data.roster[holderId]),
            );
    }
}

export interface SecretLeakReport {
    /** secrets that came out on this pass. */
    leaked: Array<{ secret: WorldSecret; reachedIds: string[]; line: string }>;
    /** 「發不發」 dilemmas planted for press-role characters this pass. */
    pressDilemmas: Want[];
    /** private percepts for the people who just learned something. */
    notices: Array<{ characterId: string; text: string }>;
}

/**
 * Evaluate every leak condition. A secret leaks when ANY of its conditions holds
 * (a gun has several triggers, and one is enough). Leaking is irreversible: the
 * coveters learn it, the day is stamped, and the conditions stop being read.
 */
export function evaluateSecretLeaks(world: WorldState, req: { day: number; nowTick: number }): SecretLeakReport {
    const report: SecretLeakReport = { leaked: [], pressDilemmas: [], notices: [] };
    for (const secret of world.data.secretLedger ?? []) {
        if (secret.leakedDay !== undefined) continue;
        if (!secret.leakWhen.some((condition) => conditionHolds(world, secret, condition, req.day))) continue;
        secret.leakedDay = req.day;
        const reachedIds: string[] = [];
        for (const coveterId of secret.coveterIds) {
            if (learnSecret(world, secret.id, coveterId)) reachedIds.push(coveterId);
        }
        const holders = secret.holderIds.map((id) => world.nameById(id)).join('、');
        const line =
            `一樁捂了許久的事漏了口風：${secret.matter}` +
            (reachedIds.length ? `——如今${reachedIds.map((id) => world.nameById(id)).join('、')}也知道了。` : `——${holders}守不住了。`);
        report.leaked.push({ secret, reachedIds, line });
        for (const id of reachedIds) {
            report.notices.push({ characterId: id, text: `你聽清了一件不該聽見的事：${secret.matter}。知道了，就不能當作沒知道。` });
        }
        for (const holderId of secret.holderIds) {
            report.notices.push({ characterId: holderId, text: `你捂著的那樁事，漏了。${secret.matter}——如今不只你一個人知道。` });
        }
    }
    report.pressDilemmas = ensurePressDilemmas(world, req);
    return report;
}

/**
 * 記者知道任何秘密 ⇒ 一樁帶死線的「發不發」. Planted once per (secret, journalist)
 * pair, carrying BOTH exits:
 *   · `completion: secret-published` — printing it resolves the want, and
 *   · `dueDay` — sitting on it past the deadline forecloses it.
 * A press dilemma therefore always leaves the board, which is the point.
 */
export function ensurePressDilemmas(world: WorldState, req: { day: number; nowTick: number }): Want[] {
    const planted: Want[] = [];
    const pressIds = world.data.cast.filter((member) => isPressRole(member.role)).map((member) => member.id);
    if (!pressIds.length) return planted;
    for (const secret of world.data.secretLedger ?? []) {
        if (secret.publishedDay !== undefined) continue;
        for (const pressId of pressIds) {
            if (!secret.knownByIds.includes(pressId)) continue;
            const desc = `${secret.matter}——這條發不發`;
            if ((secret.pressWantIds ?? []).length && world.data.wants.some((w) => w.desc === desc && w.characterId === pressId)) continue;
            const wants = plantWant(world, {
                characterId: pressId,
                layer: '事務',
                desc,
                weight: 0.72,
                resistance: 5,
                tick: req.nowTick,
                dueDay: req.day + PRESS_DEADLINE_DAYS,
                ...(secret.aboutId ? { target: secret.aboutId } : {}),
            });
            for (const want of wants) {
                want.completion = { kind: 'secret-published', secretId: secret.id };
                (secret.pressWantIds ??= []).push(want.id);
                planted.push(want);
            }
        }
    }
    return planted;
}

export interface SecretPublishOutcome {
    ok: boolean;
    reason?: string;
    /** the objective line the whole street reads. */
    line?: string;
    notices: Array<{ characterId: string; text: string }>;
}

/**
 * 見報 — the irreversible one. Print stamps the day, ruins the subject's 名頭
 * (real state, not adjectives), and lifts the publisher's own standing: a scoop
 * is a scoop. The 「發不發」 want resolves through its completion test on the next
 * lifecycle pass — this function never retires it by hand, so the ledger and the
 * want board can never disagree about why.
 */
export function publishSecret(
    world: WorldState,
    req: { secretId: string; byId?: string; day: number; nowTick: number },
): SecretPublishOutcome {
    const secret = world.data.secretLedger?.find((row) => row.id === req.secretId);
    if (!secret) return { ok: false, reason: `無此秘密：${req.secretId}`, notices: [] };
    if (secret.publishedDay !== undefined) return { ok: false, reason: '此事已見報', notices: [] };
    secret.publishedDay = req.day;
    if (secret.leakedDay === undefined) secret.leakedDay = req.day;
    for (const member of world.data.cast) learnSecret(world, secret.id, member.id); // 見報即眾所周知

    const notices: SecretPublishOutcome['notices'] = [];
    if (secret.aboutId) {
        world.bumpRenown(secret.aboutId, -0.15);
        world.bumpSelfRegard(secret.aboutId, -0.1);
        notices.push({
            characterId: secret.aboutId,
            text: `報上見了你的名字：${secret.matter}。看報的人今日都認得你了——這一頁撕不回來。`,
        });
    }
    if (req.byId && world.castById(req.byId)) {
        world.bumpRenown(req.byId, 0.08);
        notices.push({ characterId: req.byId, text: `這條你到底發了。${secret.matter}——白紙黑字，收不回。` });
    }
    const byline = req.byId ? `${world.nameById(req.byId)}的稿子` : '報館的稿子';
    return {
        ok: true,
        line: `今日報上登了一條：${secret.matter}。${byline}，白紙黑字，滿街都在看。`,
        notices,
    };
}
