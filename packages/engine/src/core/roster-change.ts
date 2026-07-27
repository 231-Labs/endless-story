/**
 * 人物進出 — the biggest card in the deck, and the one with the most orphans.
 *
 * When somebody leaves a troupe they do not leave cleanly: they were holding a
 * key, they owed the food stall, they were the only person who knew a thing, and
 * somebody had promised themselves to them. If those threads are simply dropped,
 * the world quietly rots — dangling keys, bills charged to a purse nobody holds,
 * secrets with no holder, 相許 with one side missing.
 *
 * `dismissFromCast` therefore performs a FORCED REDISTRIBUTION of every orphan
 * asset, deterministically: 持鑰 returns to the owner, 欠債 is reassigned to a
 * living account, 秘密 passes to whoever coveted it most successfully, 相許
 * dissolves with a consequence for the one left standing, and the departing
 * purse is banked in trust (so conservation holds — money never vanishes).
 *
 * `admitNewcomer` is the other half, and it is deliberately biased toward the
 * one entry that costs nothing to justify: 「來自現有角色過去的故人」. A newcomer
 * carrying ties to an incumbent — and, better, carrying a claim on a DORMANT
 * SECRET — arrives pre-armed. That is why the entry path can arm a secret in the
 * same call: a 故人 walking into town is the cheapest way to fire a loaded gun.
 */

import { joinCastMember, type JoinCastInput } from '../preset.ts';
import { accountFace, formatMoney, moveBetweenAccounts, openCharacterAccount } from './season-economy.ts';
import { plantWant } from './income-events.ts';
import { learnSecret } from './secret-ledger.ts';
import type { Want } from './want-core.ts';
import type { CastMember, WorldState } from '../world-state.ts';

/** One orphan thread the departure had to force to an answer. Each is
 *  irreversible, and each is counted by the vitals. */
export type OrphanSettlement =
    | { kind: 'key-returned'; objectId: string; toId?: string }
    | { kind: 'object-dropped'; objectId: string; sceneId: string }
    | { kind: 'debt-reassigned'; billId: string; toAccountId: string; amountSubunits: string }
    | { kind: 'credit-reassigned'; billId: string; toAccountId: string; amountSubunits: string }
    | { kind: 'purse-banked'; toAccountId: string; amountSubunits: string }
    | { kind: 'secret-passed'; secretId: string; toId: string }
    | { kind: 'secret-lost'; secretId: string }
    | { kind: 'pair-dissolved'; partnerId: string }
    | { kind: 'want-foreclosed'; wantId: string }
    | { kind: 'wage-ended'; accountId: string }
    | { kind: 'lead-vacated' };

export interface DepartureOutcome {
    ok: boolean;
    reason?: string;
    departedId?: string;
    publicLines: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    settlements: OrphanSettlement[];
    spawnedWants: Want[];
}

/**
 * 離班 — take one character off the board and force every thread they were
 * holding to a resolution. Order matters and is fixed, so a replay produces an
 * identical settlement: keys → carried objects → 欠債 → 進帳 → purse → 秘密 →
 * 相許 → 心事 → payroll → 榜上的名.
 */
export function dismissFromCast(
    world: WorldState,
    req: { characterId: string; reason: string; day: number; nowTick: number },
): DepartureOutcome {
    const out: DepartureOutcome = { ok: false, publicLines: [], privateNotices: [], settlements: [], spawnedWants: [] };
    const member = world.castById(req.characterId);
    if (!member) return { ...out, reason: `班中無此人：${req.characterId}` };
    if ((world.data.departedIds ?? []).includes(member.id)) return { ...out, reason: `${member.name}早已離班` };
    const data = world.data.economy;
    const lastSceneId = world.data.roster[member.id] ?? world.data.homeByChar[member.id];
    const name = member.name;

    // ── 1. 持鑰歸還 ── a key is a use-right, so it goes back to the deed-holder.
    for (const object of world.data.objects ?? []) {
        if (object.carriedBy !== member.id || object.visibility === 'destroyed') continue;
        if (!object.keyFor) continue;
        const ownerId = world.ownersOf(object.keyFor)[0];
        if (ownerId) {
            object.carriedBy = ownerId;
            object.sceneId = world.data.roster[ownerId] ?? object.sceneId;
            out.settlements.push({ kind: 'key-returned', objectId: object.id, toId: ownerId });
            out.privateNotices.push({
                characterId: ownerId,
                text: `${name}走了，${object.label}回到你手裡——那道門，從今日起只認你。`,
            });
        } else {
            object.carriedBy = undefined;
            object.sceneId = lastSceneId ?? object.sceneId;
            out.settlements.push({ kind: 'key-returned', objectId: object.id });
        }
        // 訪問權限: a departed key-holder holds no standing pass anywhere.
        for (const grants of Object.values(world.data.accessGrants ?? {})) {
            grants.standing = grants.standing.filter((id) => id !== member.id);
            grants.oneTime = grants.oneTime.filter((id) => id !== member.id);
        }
    }

    // ── 2. 其餘隨身之物落地 ── whatever else they carried stays where they left it.
    for (const object of world.data.objects ?? []) {
        if (object.carriedBy !== member.id || object.visibility === 'destroyed') continue;
        object.carriedBy = undefined;
        if (lastSceneId) object.sceneId = lastSceneId;
        if (object.visibility === 'hidden') object.visibility = 'visible'; // 人走了，藏不住了
        out.settlements.push({ kind: 'object-dropped', objectId: object.id, sceneId: object.sceneId });
    }

    // ── 3+4. 欠債與進帳改道 ── a bill charged to a purse nobody holds is a rot.
    if (data) {
        const troupeId = data.troupeAccountId;
        const marketId = data.marketAccountId;
        for (const bill of data.bills ?? []) {
            const owing = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
            if (owing <= 0n) continue;
            if ((bill.fromAccountId ?? troupeId) === member.id) {
                bill.fromAccountId = troupeId;
                out.settlements.push({ kind: 'debt-reassigned', billId: bill.id, toAccountId: troupeId, amountSubunits: owing.toString() });
                out.publicLines.push(`${name}走了，${bill.label}那${formatMoney(data, owing)}沒人接——記到班庫頭上。`);
                const leaderId = accountFace(world, troupeId)?.authorizedSpenderIds[0];
                if (leaderId) {
                    out.spawnedWants.push(
                        ...plantWant(world, {
                            characterId: leaderId,
                            layer: '事務',
                            desc: `${name}留下的${bill.label}，班庫替他背了`,
                            weight: 0.6,
                            resistance: 4,
                            tick: req.nowTick,
                            dueDay: req.day + 7,
                        }),
                    );
                }
            } else if ((bill.toAccountId ?? marketId) === member.id) {
                bill.toAccountId = marketId;
                out.settlements.push({ kind: 'credit-reassigned', billId: bill.id, toAccountId: marketId, amountSubunits: owing.toString() });
                out.publicLines.push(`${name}走了，欠他的${bill.label}${formatMoney(data, owing)}轉歸市面上收——債不會因為人走就沒了。`);
            }
        }

        // ── 5. 餘銀代管 — the abandoned purse is banked in trust: money must not vanish.
        const purse = accountFace(world, member.id);
        if (purse && purse.available > 0n) {
            const moved = moveBetweenAccounts(world, {
                txnId: `depart:${member.id}:purse:d${req.day}`,
                fromAccountId: member.id,
                toAccountId: troupeId,
                amountSubunits: purse.available,
                memo: `${name}離班·餘銀代管`,
                causeEventId: `${world.data.sagaId}:depart:${member.id}`,
            });
            if (moved.ok && moved.paidSubunits > 0n) {
                out.settlements.push({ kind: 'purse-banked', toAccountId: troupeId, amountSubunits: moved.paidSubunits.toString() });
                out.publicLines.push(`${name}的${formatMoney(data, moved.paidSubunits)}餘銀交班庫代管。`);
            }
        }

        // ── payroll + 榜上的名: stop paying, stop billing them.
        const wagesBefore = data.wages.length;
        data.wages = data.wages.filter((wage) => wage.accountId !== member.id);
        if (data.wages.length !== wagesBefore) out.settlements.push({ kind: 'wage-ended', accountId: member.id });
        if (data.performance?.leadIds.includes(member.id)) {
            data.performance.leadIds = data.performance.leadIds.filter((id) => id !== member.id);
            data.performance.rehearsedToday = data.performance.rehearsedToday.filter((id) => id !== member.id);
            out.settlements.push({ kind: 'lead-vacated' });
            out.publicLines.push(`戲牌上${name}的名字撤了下來——今夜的戲，得換人領銜。`);
        }
    }

    // ── 6. 秘密改手 ── a secret with no holder left is either inherited or gone.
    for (const secret of world.data.secretLedger ?? []) {
        if (!secret.holderIds.includes(member.id)) continue;
        secret.holderIds = secret.holderIds.filter((id) => id !== member.id);
        if (secret.holderIds.length) continue;
        const heir = [...secret.coveterIds]
            .filter((id) => world.castById(id) && !(world.data.departedIds ?? []).includes(id))
            .sort((a, b) => world.renownOf(b) - world.renownOf(a) || a.localeCompare(b))[0];
        if (heir) {
            secret.holderIds.push(heir);
            learnSecret(world, secret.id, heir);
            out.settlements.push({ kind: 'secret-passed', secretId: secret.id, toId: heir });
            out.privateNotices.push({
                characterId: heir,
                text: `${name}臨走前，那樁事終究到了你這裡：${secret.matter}。如今守著它的人是你。`,
            });
        } else {
            secret.leakWhen = [];
            out.settlements.push({ kind: 'secret-lost', secretId: secret.id });
            out.publicLines.push(`有一樁事隨${name}一道出了城，從此無人說得清。`);
        }
    }

    // ── 7. 相許散了 ── the one left standing carries it.
    const pairs = world.data.establishedPairs ?? [];
    const keptPairs: string[] = [];
    for (const key of pairs) {
        const [a, b] = key.split('|');
        if (a !== member.id && b !== member.id) {
            keptPairs.push(key);
            continue;
        }
        const partnerId = a === member.id ? b : a;
        out.settlements.push({ kind: 'pair-dissolved', partnerId });
        out.privateNotices.push({ characterId: partnerId, text: `${name}走了。說過的話還在，人不在了。` });
        out.spawnedWants.push(
            ...plantWant(world, {
                characterId: partnerId,
                layer: '情',
                desc: `${name}走了，那句話怎麼算`,
                weight: 0.75,
                resistance: 5,
                tick: req.nowTick,
                dueDay: req.day + 5,
                target: member.id,
                semanticTags: ['affection'],
            }),
        );
    }
    if (world.data.establishedPairs) world.data.establishedPairs = keptPairs;

    // ── 8. 他自己的心事全數擱下 ── a departed heart presses on nobody.
    for (const want of world.data.wants) {
        if (want.retired || want.characterId !== member.id) continue;
        want.retired = true;
        want.resolvedTick = req.nowTick;
        want.resolutionCause = 'foreclosed';
        want.resolvedNote = '（人離了班，這樁隨他去了）';
        out.settlements.push({ kind: 'want-foreclosed', wantId: want.id });
    }

    // ── off the board ──
    (world.data.departedIds ??= []).push(member.id);
    member.departedDay = req.day;
    delete world.data.roster[member.id];
    out.publicLines.unshift(`${name}離了春雪社：${req.reason}。`);
    out.ok = true;
    out.departedId = member.id;
    return out;
}

export interface NewcomerSeed extends JoinCastInput {
    /** 故人進城 — an existing secret this arrival immediately has a claim on.
     *  `as: 'holder'` = they knew it all along; `as: 'coveter'` = they came for it.
     *  This is the entry path's real purpose: waking a dormant gun. */
    armsSecret?: { secretId: string; as: 'holder' | 'coveter' };
    /** a daily wage so the arrival is not broke on day one. Paid by `fromAccountId`
     *  (default 班庫) — still below a living cost, because scarcity stays. */
    wageYuan?: number;
    wageFromAccountId?: string;
    /** what they arrive carrying, and what living costs them per day. Both default
     *  to 0, so a deck that says nothing admits somebody with an empty purse and no
     *  overheads rather than silently inventing either. */
    openingYuan?: number;
    dailyFixedCostYuan?: number;
}

export interface ArrivalOutcome {
    ok: boolean;
    reason?: string;
    member?: CastMember;
    publicLines: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    /** did this arrival actually wake a secret? */
    armedSecretId?: string;
}

/**
 * 進場 — admit one newcomer mid-run. Wraps the existing `joinCastMember`
 * plumbing (ids, scenes, ties, bonds, acquaintance) and adds the three things a
 * mid-season arrival needs that a founding-cast member does not: an announced
 * arrival the incumbents PERCEIVE, a payroll line so they are not instantly
 * destitute, and — the point of the card — a claim on a dormant secret.
 */
export function admitNewcomer(
    world: WorldState,
    req: { seed: NewcomerSeed; day: number; nowTick: number },
): ArrivalOutcome {
    const out: ArrivalOutcome = { ok: false, publicLines: [], privateNotices: [] };
    let member: CastMember;
    try {
        member = joinCastMember(world, req.seed);
    } catch (error) {
        return { ...out, reason: error instanceof Error ? error.message : String(error) };
    }

    const data = world.data.economy;
    if (data) {
        // 開戶 FIRST, always. A newcomer with a wage but no purse makes the daily
        // settle throw on an unknown destination — the arrival must be solvent as
        // a matter of plumbing before it is solvent as a matter of drama.
        openCharacterAccount(world, {
            characterId: member.id,
            label: member.name,
            openingYuan: req.seed.openingYuan ?? 0,
            dailyFixedCostYuan: req.seed.dailyFixedCostYuan ?? 0,
        });
        if (req.seed.wageYuan && req.seed.wageYuan > 0) {
            const amount = BigInt(Math.round(req.seed.wageYuan * data.subunitsPerUnit));
            data.wages.push({
                accountId: member.id,
                amountSubunits: amount.toString(),
                ...(req.seed.wageFromAccountId ? { fromAccountId: req.seed.wageFromAccountId } : {}),
            });
        }
    }

    if (req.seed.armsSecret) {
        const secret = world.data.secretLedger?.find((row) => row.id === req.seed.armsSecret!.secretId);
        if (secret) {
            if (req.seed.armsSecret.as === 'holder') {
                if (!secret.holderIds.includes(member.id)) secret.holderIds.push(member.id);
                learnSecret(world, secret.id, member.id);
            } else if (!secret.coveterIds.includes(member.id)) {
                secret.coveterIds.push(member.id);
            }
            out.armedSecretId = secret.id;
            out.privateNotices.push({
                characterId: member.id,
                text:
                    req.seed.armsSecret.as === 'holder'
                        ? `你進城時，把那樁事一併帶了進來：${secret.matter}。`
                        : `你進城，是為了那樁事：${secret.matter}。`,
            });
        }
    }

    const arrivalScene = world.sceneNameById(world.data.roster[member.id] ?? '');
    out.publicLines.push(
        `${member.name}進了城，人在${arrivalScene}` +
            (req.seed.ties?.length ? `——認得的人裡有${req.seed.ties.map((tie) => tie.target).join('、')}。` : '——面生。'),
    );
    out.ok = true;
    out.member = member;
    return out;
}
