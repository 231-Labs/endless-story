/**
 * 收入事件 — the inward half of the money loop, as MECHANISM.
 *
 * The diagnosis this module answers: 「支出是機制、收入是台詞」. Fixed costs were
 * deducted every day by `settleSeasonDay`, while 工錢／分紅／月半結帳 existed only as
 * lines characters spoke. The cast waited for a payday that structurally could
 * never arrive, and the whole company trended toward bankruptcy.
 *
 * Three arrivals live here, all deterministic, all leaving ledger rows:
 *
 *   · `payWagePacket`  一次過的工錢 — an employer pot pays named hands a lump sum.
 *   · `payDividend`    分紅 — the troupe shares its SURPLUS above a reserve floor,
 *                      by 班規 weights. Pays nothing when there is no surplus, so
 *                      it can never mint money or rescue a dead treasury.
 *   · `runReckoning`   月半結帳 — the deadline that MUST arrive. It moves NO money:
 *                      it CALLS the debt and settles the social consequence of
 *                      what the debtor chose to do about it. See its own section.
 *
 * Scarcity is deliberately PRESERVED. Nothing here guarantees solvency: the
 * dividend is capped by real surplus, the wage packet by the payer's real
 * balance, and the reckoning hands out consequences rather than relief. The fix
 * is that income now EXISTS and can be pointed at in the ledger — not that money
 * became plentiful.
 */

import {
    accountFace,
    formatMoney,
    moveBetweenAccounts,
    troupeLeaderId,
    troupePlayerIds,
    yuanToSubunits,
} from './season-economy.ts';
import { chillBond, type BondGraph } from './bond-graph.ts';
import { DEBT_GRIEVANCE_MARK, HEARSAY_MARK } from './standing.ts';
import { newWant, type Want } from './want-core.ts';
import type { WorldState } from '../world-state.ts';

// ── 工錢 (a lump wage packet) ────────────────────────────────────────────────

export interface WagePacketRequest {
    day: number;
    nowTick: number;
    /** stable id — the ledger txn id derives from it, so a replay never double-pays. */
    id: string;
    label: string;
    /** the employer pot. Default: 班庫. */
    fromAccountId?: string;
    /** 圓 per named hand. */
    perHeadYuan: number;
    /** who gets paid. Empty ⇒ every troupe player (the box-office membership signal). */
    targetIds?: string[];
}

export interface IncomeOutcome {
    landed: boolean;
    /** who actually received money, and how much (decimal minimum units). */
    paid: Array<{ characterId: string; name: string; amountSubunits: string }>;
    totalSubunits: string;
    publicLines: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    /** why nothing (or only part) landed — surfaced, never swallowed. */
    shortfallNote?: string;
}

const emptyOutcome = (): IncomeOutcome => ({
    landed: false,
    paid: [],
    totalSubunits: '0',
    publicLines: [],
    privateNotices: [],
});

/**
 * 工錢發放 — an employer pot pays a flat packet to named hands. Pays in roster
 * order and stops when the pot runs dry, so a thin week short-pays the LAST
 * names on the list (a visible, dramatic fact) rather than silently prorating
 * everyone into nothing.
 */
export function payWagePacket(world: WorldState, req: WagePacketRequest): IncomeOutcome {
    const data = world.data.economy;
    const out = emptyOutcome();
    if (!data) return out;
    const fromAccountId = req.fromAccountId ?? data.troupeAccountId;
    const payer = accountFace(world, fromAccountId);
    if (!payer) return { ...out, shortfallNote: `無此帳戶：${fromAccountId}` };

    const targets = (req.targetIds?.length ? req.targetIds : [...troupePlayerIds(world)])
        .filter((id) => world.castById(id))
        .sort((a, b) => a.localeCompare(b));
    if (!targets.length) return { ...out, shortfallNote: '無人可領' };

    const perHead = yuanToSubunits(world, req.perHeadYuan);
    if (perHead <= 0n) return { ...out, shortfallNote: '工錢須為正數' };

    let total = 0n;
    const unpaid: string[] = [];
    for (const characterId of targets) {
        // A packet is a packet: paying somebody 1 圓 of a 2 圓 wage is not a thin
        // week, it is a rounding error nobody can act on. If the pot cannot cover
        // this head in full, they simply do not get paid — a fact the world states.
        if ((accountFace(world, fromAccountId)?.available ?? 0n) < perHead) {
            unpaid.push(world.nameById(characterId));
            continue;
        }
        const moved = moveBetweenAccounts(world, {
            txnId: `${req.id}:d${req.day}:${characterId}`,
            fromAccountId,
            toAccountId: characterId,
            amountSubunits: perHead,
            memo: req.label,
            causeEventId: `${world.data.sagaId}:income:${req.id}:d${req.day}`,
        });
        if (!moved.ok || moved.paidSubunits <= 0n) {
            unpaid.push(world.nameById(characterId));
            continue;
        }
        total += moved.paidSubunits;
        out.paid.push({ characterId, name: world.nameById(characterId), amountSubunits: moved.paidSubunits.toString() });
        out.privateNotices.push({
            characterId,
            text: `${req.label}到手：${formatMoney(data, moved.paidSubunits)}——不多，但是真的進了自己的口袋。`,
        });
    }
    out.totalSubunits = total.toString();
    out.landed = out.paid.length > 0;
    if (out.paid.length) {
        out.publicLines.push(
            `${payer.label}發${req.label}：${out.paid.map((row) => `${row.name}${formatMoney(data, BigInt(row.amountSubunits))}`).join('、')}` +
                `，當場點清，共出${formatMoney(data, total)}。`,
        );
    }
    if (unpaid.length) {
        out.shortfallNote = `${payer.label}見底，${unpaid.join('、')}這一份${req.label}沒發出來`;
        out.publicLines.push(`${out.shortfallNote}——欠著的是錢，記著的是人。`);
        for (const name of unpaid) {
            const id = world.idByName(name);
            if (id) out.privateNotices.push({ characterId: id, text: `輪到你時，${payer.label}已經空了——這一份${req.label}沒你的。` });
        }
    }
    return out;
}

// ── 分紅 (surplus sharing by 班規) ────────────────────────────────────────────

export interface DividendRule {
    /** stable id — the ledger txn id derives from it. */
    id: string;
    label: string;
    /** the sharing pot. Default: 班庫. */
    fromAccountId?: string;
    /** basis points of the SURPLUS that gets shared out (10000 = all of it). */
    surplusShareBps: number;
    /** the pot must keep this many days of its own fixed cost. The floor is what
     *  keeps 分紅 from being a solvency cheat: a treasury under water shares nothing. */
    reserveDays: number;
    /** explicit 班規 weights. Absent ⇒ an equal split among the troupe players. */
    shares?: Array<{ characterId: string; weightBps: number }>;
}

/**
 * 散戲後按票房入班庫、按班規發放 — the surplus above the reserve floor, shared by
 * weight. Deterministic to the last 分: shares are floor-divided and the整數
 * remainder goes to the FIRST beneficiary in id order, so the sum always equals
 * the amount actually withdrawn (no minting, no rounding drift, byte-identical
 * on replay).
 */
export function payDividend(world: WorldState, req: { day: number; nowTick: number; rule: DividendRule }): IncomeOutcome {
    const data = world.data.economy;
    const out = emptyOutcome();
    if (!data) return out;
    const { rule } = req;
    const fromAccountId = rule.fromAccountId ?? data.troupeAccountId;
    const payer = accountFace(world, fromAccountId);
    if (!payer) return { ...out, shortfallNote: `無此帳戶：${fromAccountId}` };

    const floor = payer.dailyFixedCost * BigInt(Math.max(0, Math.floor(rule.reserveDays)));
    const surplus = payer.available - floor;
    if (surplus <= 0n) {
        return {
            ...out,
            shortfallNote: `${payer.label}留不出${rule.reserveDays}日的底，這一期${rule.label}免議`,
            publicLines: [`${payer.label}這一期沒有${rule.label}：帳上連${rule.reserveDays}日的開銷都還壓著，眾人心裡有數。`],
        };
    }
    const bps = BigInt(Math.max(0, Math.min(10000, Math.floor(rule.surplusShareBps))));
    const pool = (surplus * bps) / 10000n;
    if (pool <= 0n) {
        return { ...out, shortfallNote: `${rule.label}攤下來不足一分`, publicLines: [`${payer.label}帳上那點餘裕攤不成${rule.label}，這一期作罷。`] };
    }

    const shares = (rule.shares?.length
        ? rule.shares.filter((share) => world.castById(share.characterId))
        : [...troupePlayerIds(world)].filter((id) => world.castById(id)).map((characterId) => ({ characterId, weightBps: 1 }))
    ).sort((a, b) => a.characterId.localeCompare(b.characterId));
    if (!shares.length) return { ...out, shortfallNote: '無人可分' };

    const weightTotal = shares.reduce((sum, share) => sum + BigInt(Math.max(0, Math.floor(share.weightBps))), 0n);
    if (weightTotal <= 0n) return { ...out, shortfallNote: '班規權重為零' };

    const amounts = shares.map((share) => (pool * BigInt(Math.max(0, Math.floor(share.weightBps)))) / weightTotal);
    const remainder = pool - amounts.reduce((sum, amount) => sum + amount, 0n);
    amounts[0] += remainder; // 零頭歸首名——確定性，不四捨五入漂移

    let total = 0n;
    for (let i = 0; i < shares.length; i++) {
        if (amounts[i] <= 0n) continue;
        const characterId = shares[i].characterId;
        const moved = moveBetweenAccounts(world, {
            txnId: `${rule.id}:d${req.day}:${characterId}`,
            fromAccountId,
            toAccountId: characterId,
            amountSubunits: amounts[i],
            memo: rule.label,
            causeEventId: `${world.data.sagaId}:income:${rule.id}:d${req.day}`,
        });
        if (!moved.ok || moved.paidSubunits <= 0n) continue;
        total += moved.paidSubunits;
        out.paid.push({ characterId, name: world.nameById(characterId), amountSubunits: moved.paidSubunits.toString() });
        out.privateNotices.push({
            characterId,
            text: `${rule.label}分到${formatMoney(data, moved.paidSubunits)}——這一筆是台上掙來的，不是誰賞的。`,
        });
    }
    out.totalSubunits = total.toString();
    out.landed = total > 0n;
    if (out.landed) {
        out.publicLines.push(
            `${payer.label}按班規發${rule.label}，共${formatMoney(data, total)}：` +
                `${out.paid.map((row) => `${row.name}${formatMoney(data, BigInt(row.amountSubunits))}`).join('、')}。`,
        );
    }
    return out;
}

// ── 月半結帳 (the deadline that arrives — as a social event) ──────────────────
//
// DESIGN CORRECTION. The first version of this forcibly debited every solvent
// debtor when the day came. That is the engine reaching into a purse, and it
// makes 「打死不還」 unplayable: a position a character cannot actually hold is not
// a choice, it is scenery.
//
// So the reckoning moves NO money. Ever. Money only leaves a purse when a
// character uses the `repay` verb themselves, and they have days of warning in
// which to decide. What arrives on the day is the CALLING of the debt — and its
// consequence is social, propagated, and the CREDITOR'S to choose:
//
//   · 免了 (forgive)   the paper is torn up. The debtor owes a 人情, and the
//                      street records that they were let off. A creditor who
//                      genuinely does not mind is allowed not to mind.
//   · 催  (press)      the debt stands and they were dunned to their face. A
//                      private humiliation; the street does not hear it yet.
//   · 傳出去 (broadcast) the debt stands AND the word goes out. 賒帳資格 at that
//                      vendor is revoked, 名頭 drops hard, and everyone who was
//                      there now KNOWS. This is what 打死不還 costs.
//
// The deadline still ARRIVES — it is `mustLand`, it is public, and it changes
// the world irreversibly every time. What it no longer does is decide, on the
// character's behalf, whether they are the sort of person who pays.

/** One irreversible fact the reckoning produced. Counted by the vitals as an
 *  不可逆事件 — this is the tick where the world stopped being reversible. */
export type ReckoningFact =
    /** they settled it themselves during the warning window — nothing to call. */
    | { kind: 'kept'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string }
    | { kind: 'forgiven'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string }
    | { kind: 'pressed'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string }
    | { kind: 'broadcast'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string };

/** What a creditor decided to do about one unpaid debt. */
export type DebtStance = 'forgive' | 'press' | 'broadcast';

/** The seat's view of one debt, in plain facts — no advice, and no number the
 *  seat could recompute. Handed to `SceneAgentPort.decideDebtStance`. */
export interface DebtStanceSeat {
    billId: string;
    /** the creditor deciding — a character id when the creditor is a person. */
    creditorId?: string;
    creditorLabel: string;
    debtorId?: string;
    debtorName: string;
    label: string;
    /** money as world language, never a raw figure the seat could do sums on. */
    owedText: string;
    /** how long this has been outstanding, and how many times already called. */
    daysOverdue: number;
    priorCalls: number;
    /** could the debtor have paid, as far as the street can tell? This is the
     *  difference between 還不出 and 不肯還, and it is the whole question. */
    debtorCouldPay: boolean;
    /** the creditor's own footing — can they afford to be generous? */
    creditorFooting: string;
    /** the creditor's authored 立場, when the frame gave them one. */
    stance?: string;
}

export interface ReckoningOutcome {
    landed: boolean;
    publicLines: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    facts: ReckoningFact[];
    /** 心事 the reckoning genuinely stirred (already in the world). */
    spawnedWants: Want[];
    /** the seats a caller should consult BEFORE settling (see `reckoningSeats`). */
    already?: boolean;
    /** already run for this day — a second call is a no-op, not a double charge. */
    duplicate?: boolean;
}

/** 名頭的代價 — what each stance costs in PUBLIC standing. 免帳 costs nothing
 *  publicly (generosity is not a punishment); 當面催 is a private smart; 傳出去
 *  is the one that actually moves a name. */
export const PRESS_RENOWN_COST = 0.04;
export const BROADCAST_RENOWN_COST = 0.12;
export const FORGIVEN_SELF_REGARD_COST = 0.03;

/** 免帳門檻 — the deterministic FALLBACK when no creditor seat answers. Grace is
 *  extended only by a creditor who can afford it to a debtor whose name is still
 *  worth keeping. A real creditor seat overrides all of this. */
export const FORGIVE_CREDITOR_RUNWAY_DAYS = 3n;
export const FORGIVE_DEBTOR_RENOWN = 0.5;
/** How long a forgiven 人情 hangs over the debtor before it forecloses. */
export const FAVOUR_DEBT_DAYS = 7;
/** A debt called this many times and still unpaid goes public regardless of the
 *  fallback's usual leniency — 打死不還 has a trajectory, not a flat cost. */
export const PATIENCE_CALLS = 2;

/**
 * 預告 — the broadcast the whole street hears, days before the day.
 *
 * This is the common knowledge 春雪社＋前街 share: everyone learns WHEN the
 * reckoning falls and WHO is on the摺子, so a debtor has a real, dated reason to
 * act and real days in which to act. Without this window, "choosing not to pay"
 * would be indistinguishable from "never got the chance".
 *
 * Each debtor also gets a dated 心事 carrying `completion: bill-cleared`, so
 * settling it themselves RESOLVES the want, and letting the day pass forecloses
 * it. The choice is theirs either way; both exits are real.
 */
export function announceReckoning(
    world: WorldState,
    req: { day: number; nowTick: number; dueDay: number; label: string },
): { publicLine?: string; privateNotices: Array<{ characterId: string; text: string }>; spawnedWants: Want[] } {
    const data = world.data.economy;
    const out = { privateNotices: [] as Array<{ characterId: string; text: string }>, spawnedWants: [] as Want[] };
    if (!data) return out;
    const open = (data.bills ?? []).filter((bill) => BigInt(bill.paidSubunits) < BigInt(bill.amountSubunits));
    if (!open.length) return out;

    const namesOnTheBook: string[] = [];
    for (const bill of open) {
        const owing = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        const debtorId = debtorFaceOf(world, bill);
        if (!debtorId) continue;
        const creditor = bill.creditor ?? accountFace(world, bill.toAccountId ?? data.marketAccountId)?.label ?? '債主';
        if (!namesOnTheBook.includes(world.nameById(debtorId))) namesOnTheBook.push(world.nameById(debtorId));
        out.privateNotices.push({
            characterId: debtorId,
            text:
                `第 ${req.dueDay} 日${req.label}：你欠${creditor}的${bill.label}還有${formatMoney(data, owing)}。` +
                `沒有人會從你手裡把錢拿走——到那日還不還，是你自己的事；不還的話，賠的是名聲。`,
        });
        const planted = plantWant(world, {
            characterId: debtorId,
            layer: '事務',
            desc: `${req.dueDay} 日之前把${creditor}那筆${bill.label}了了`,
            weight: 0.66,
            resistance: 4,
            tick: req.nowTick,
            dueDay: req.dueDay,
        });
        for (const want of planted) want.completion = { kind: 'bill-cleared', billId: bill.id };
        out.spawnedWants.push(...planted);
    }
    if (!namesOnTheBook.length) return out;
    return {
        ...out,
        publicLine:
            `前街放出話來：第 ${req.dueDay} 日${req.label}，這半月的賒賬、花賬、繡賬一併算一算。` +
            `摺子上還有名字的是${namesOnTheBook.join('、')}——到那日誰劃得掉、誰劃不掉，這條街都看得見。`,
    };
}

/** Who publicly carries a bill: a character pays for themselves; an
 *  establishment's debt is carried by whoever may spend from it (the 班主). */
function debtorFaceOf(world: WorldState, bill: { fromAccountId?: string }): string | undefined {
    const data = world.data.economy!;
    const payerId = bill.fromAccountId ?? data.troupeAccountId;
    if (world.castById(payerId)) return payerId;
    return accountFace(world, payerId)?.authorizedSpenderIds[0] ?? troupeLeaderId(world);
}

/**
 * The creditor seats for this reckoning — one per genuinely unpaid debt, built
 * BEFORE any state changes so the tick can consult them asynchronously and inject
 * the verdicts back into the pure settle below. Same shape as the existing
 * negotiation-seat pattern.
 */
export function reckoningSeats(world: WorldState, req: { day: number }): DebtStanceSeat[] {
    const data = world.data.economy;
    if (!data) return [];
    const seats: DebtStanceSeat[] = [];
    const priorCalls = world.data.debtCalls ?? [];
    for (const bill of data.bills ?? []) {
        const owing = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        if (owing <= 0n) continue;
        const payeeId = bill.toAccountId ?? data.marketAccountId;
        const creditorFace = accountFace(world, payeeId);
        // Whose grudge this is. A PERSONAL account is its own face — a character
        // account carries no authorizedSpenderIds (ownership is by id), so reading
        // only that list silently produced no creditor at all for the commonest
        // case of one character owing another, and the relationship never moved.
        const creditorId = world.castById(payeeId)
            ? payeeId
            : creditorFace?.authorizedSpenderIds.find((id) => world.castById(id));
        const debtorId = debtorFaceOf(world, bill);
        const debtorPurse = debtorId ? accountFace(world, debtorId) : undefined;
        // A creditor with no modelled account (an off-stage 錢莊) is treated as
        // able to absorb the loss — the world has no evidence that they cannot.
        const runway = creditorFace ? creditorFace.runwayDays : null;
        seats.push({
            billId: bill.id,
            ...(creditorId ? { creditorId } : {}),
            creditorLabel: bill.creditor ?? creditorFace?.label ?? '債主',
            ...(debtorId ? { debtorId } : {}),
            debtorName: debtorId ? world.nameById(debtorId) : (accountFace(world, bill.fromAccountId ?? data.troupeAccountId)?.label ?? '欠帳的'),
            label: bill.label,
            owedText: formatMoney(data, owing),
            daysOverdue: Math.max(0, req.day - bill.dueDay),
            priorCalls: priorCalls.filter((call) => call.billId === bill.id).length,
            debtorCouldPay: !!debtorPurse && debtorPurse.available >= owing,
            creditorFooting:
                runway === null ? '這筆收不收得回，都還過得去' : runway <= 1n ? '自己也快撐不住了' : runway <= 3n ? '手頭也緊' : '還撐得住',
            ...(data.stances?.[payeeId] ? { stance: data.stances[payeeId] } : {}),
        });
    }
    return seats.sort((a, b) => a.billId.localeCompare(b.billId));
}

/** The deterministic fallback stance, used when no creditor seat answers (a
 *  rehearsal run, a fake agent, a thrown call). Replayable by construction. */
export function fallbackStance(seat: DebtStanceSeat, world: WorldState): DebtStance {
    // 打死不還 escalates: patience is finite even in the fallback.
    if (seat.priorCalls >= PATIENCE_CALLS) return 'broadcast';
    // Somebody who could have paid and did not is a different matter from
    // somebody who could not — this is the distinction the whole redesign turns on.
    if (seat.debtorCouldPay) return seat.priorCalls >= 1 ? 'broadcast' : 'press';
    const creditorCanAfford = seat.creditorFooting.includes('過得去') || seat.creditorFooting.includes('撐得住');
    const worthKeeping = seat.debtorId ? world.renownOf(seat.debtorId) >= FORGIVE_DEBTOR_RENOWN : false;
    return creditorCanAfford && worthKeeping ? 'forgive' : 'press';
}

/**
 * 月半結帳 — the calling. Moves NO money: it reads what each debtor DID during
 * the warning window and settles the social consequence of that choice.
 *
 * `stances` carries the creditor verdicts computed asynchronously by the caller
 * (from `reckoningSeats`); anything absent falls back deterministically, so a
 * rehearsal run without an LLM produces a complete, replayable reckoning.
 *
 * Idempotent per narrative day via `world.data.reckonings`.
 */
export function runReckoning(
    world: WorldState,
    req: {
        day: number;
        nowTick: number;
        label: string;
        stances?: Record<string, DebtStance>;
        /** The tick's LIVE bond graph. `world.bondGraph()` hands back a fresh copy
         *  parsed from JSON, so a reckoning that loaded its own would be silently
         *  overwritten by the tick's own `setBonds` at the end of the tick. Pass
         *  the working graph in; a caller outside a tick may omit it and this
         *  loads + persists one itself. */
        bonds?: BondGraph;
    },
): ReckoningOutcome {
    const data = world.data.economy;
    const out: ReckoningOutcome = { landed: false, publicLines: [], privateNotices: [], facts: [], spawnedWants: [] };
    if (!data) return out;
    const log = (world.data.reckonings ??= []);
    if (log.some((entry) => entry.day === req.day)) return { ...out, duplicate: true };

    const witnesses = world.activeCast().map((member) => member.id);
    const calls = (world.data.debtCalls ??= []);
    // See the `bonds` doc on the request: a self-loaded graph would be clobbered
    // by the tick's own setBonds, so only persist the one WE loaded.
    const bonds = req.bonds ?? world.bondGraph();
    const ownsGraph = req.bonds === undefined;

    // 說到做到 — anyone who cleared their tab during the warning window. Their
    // choice is as much a fact as a refusal, and the street records it too.
    for (const bill of data.bills ?? []) {
        if (BigInt(bill.paidSubunits) < BigInt(bill.amountSubunits)) continue;
        if (!calls.some((call) => call.billId === bill.id)) continue; // never was called ⇒ nothing to note
        const debtorId = debtorFaceOf(world, bill);
        // 洗刷 — the creditor's view goes back to plain. NOT to warm: paying what
        // you owed restores you to owing nothing, it does not buy affection. A
        // neutral tone reads as 0.5 in `welcome()`, which reopens the doors a
        // grievance had shut without pretending the grievance never happened.
        const payeeAccountId = bill.toAccountId ?? data.marketAccountId;
        const payeeFace = world.castById(payeeAccountId)
            ? payeeAccountId
            : accountFace(world, payeeAccountId)?.authorizedSpenderIds.find((id) => world.castById(id));
        if (debtorId && payeeFace && payeeFace !== debtorId) {
            world.setEdge(payeeFace, debtorId, `${bill.label}那筆，他自己清了`, 'neutral');
        }
        out.facts.push({
            kind: 'kept',
            billId: bill.id,
            ...(debtorId ? { debtorId } : {}),
            creditorLabel: bill.creditor ?? '債主',
            amountSubunits: bill.amountSubunits,
        });
        if (debtorId) {
            world.bumpRenown(debtorId, 0.05);
            out.publicLines.push(`${req.label}：${world.nameById(debtorId)}的${bill.label}早幾日就自己清了，摺子上乾乾淨淨。`);
        }
    }

    for (const seat of reckoningSeats(world, { day: req.day })) {
        const bill = (data.bills ?? []).find((row) => row.id === seat.billId)!;
        const owing = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        const stance = req.stances?.[seat.billId] ?? fallbackStance(seat, world);
        calls.push({ billId: seat.billId, day: req.day, stance, ...(seat.debtorId ? { debtorId: seat.debtorId } : {}) });

        if (stance === 'forgive') {
            // 免了 —— the ONLY branch that touches the paper, and it is the creditor
            // choosing to eat the loss. No money moves; the debt simply stops existing.
            bill.paidSubunits = bill.amountSubunits;
            out.facts.push({ kind: 'forgiven', billId: seat.billId, ...(seat.debtorId ? { debtorId: seat.debtorId } : {}), creditorLabel: seat.creditorLabel, amountSubunits: owing.toString() });
            out.publicLines.push(
                `${req.label}：${seat.debtorName}的${bill.label}還差${seat.owedText}，${seat.creditorLabel}當眾把那頁紅字撕了` +
                    `——「這筆，不記了。」帳是清了，情記下了。`,
            );
            if (seat.debtorId) {
                // Being let off privately stings, and the creditor's own view of
                // them does NOT cool — generosity is not a punishment. The debtor
                // now carries a 人情 instead, which is its own kind of weight.
                world.bumpSelfRegard(seat.debtorId, -FORGIVEN_SELF_REGARD_COST);
                if (seat.creditorId) world.setEdge(seat.creditorId, seat.debtorId, '這筆我免了，他自己心裡有數', 'warm');
                out.privateNotices.push({
                    characterId: seat.debtorId,
                    text: `${seat.creditorLabel}免了你${seat.owedText}的帳。這一筆從摺子上下來了，卻壓到了別的地方。`,
                });
                out.spawnedWants.push(
                    ...plantWant(world, {
                        characterId: seat.debtorId,
                        layer: '虧欠',
                        desc: `${seat.creditorLabel}免了那筆帳，這份情得還`,
                        weight: 0.62,
                        resistance: 4,
                        tick: req.nowTick,
                        dueDay: req.day + FAVOUR_DEBT_DAYS,
                        semanticTags: ['reckoning'],
                    }),
                );
            }
            continue;
        }

        // 催 / 傳出去 —— the debt STANDS either way. Nobody's purse is touched.
        const couldPay = seat.debtorCouldPay;
        out.facts.push({
            kind: stance === 'broadcast' ? 'broadcast' : 'pressed',
            billId: seat.billId,
            ...(seat.debtorId ? { debtorId: seat.debtorId } : {}),
            creditorLabel: seat.creditorLabel,
            amountSubunits: owing.toString(),
        });

        if (stance === 'press') {
            out.publicLines.push(
                `${req.label}：${bill.label}還欠${seat.owedText}，${seat.creditorLabel}把${seat.debtorName}叫到一邊` +
                    `——數目、日子、幾時還，一句句問到底。話沒往外傳，臉是當面丟的。`,
            );
            if (seat.debtorId) {
                // 話沒外傳 —— ONLY the creditor's own view cools, and only a little.
                // Nobody else's edge moves, because nobody else heard.
                world.bumpRenown(seat.debtorId, -PRESS_RENOWN_COST);
                world.bumpSelfRegard(seat.debtorId, -0.06);
                if (seat.creditorId) {
                    world.setEdge(seat.creditorId, seat.debtorId, `${DEBT_GRIEVANCE_MARK}到期沒還，我把話問到底了——心裡冷了幾分`, 'cold');
                    chillBond(bonds, seat.creditorId, seat.debtorId, 'dunned');
                }
                out.privateNotices.push({
                    characterId: seat.debtorId,
                    text:
                        `${seat.creditorLabel}當面把${seat.owedText}的帳問到底了。` +
                        `他沒往外說——這一次。錢仍在你手裡，還不還，仍舊是你自己的事。`,
                });
                out.spawnedWants.push(
                    ...plantWant(world, {
                        characterId: seat.debtorId,
                        layer: '體面',
                        desc: `${seat.creditorLabel}那筆帳，趁話還沒傳出去`,
                        weight: 0.7,
                        resistance: 4,
                        tick: req.nowTick,
                        dueDay: req.day + FAVOUR_DEBT_DAYS,
                        semanticTags: ['reckoning'],
                    }),
                );
            }
            continue;
        }

        // 傳出去 —— the word goes out. This is what 打死不還 costs, and it is a
        // door closing, not an adjective: 賒帳資格 at this vendor is revoked.
        out.publicLines.push(
            `${req.label}：${bill.label}還欠${seat.owedText}，${seat.creditorLabel}不再私下說了` +
                `——當著滿街的人把${seat.debtorName}的名字和數目一併報了出來。` +
                `${couldPay ? '有錢不還，這條街往後自有分寸。' : '還不出也是還不出，可話已經出去了。'}`,
        );
        if (seat.debtorId) {
            // 傳出去 —— the consequence is NOT a flag anybody sets. It is that every
            // person who heard now thinks less of him, held in the same directed
            // relationship graph every other social gate already reads. The doors
            // close because the relationships closed, not because a rule said so:
            //   · `welcome()` reads the cold tone → nobody opens a door at night
            //   · `tabTrust()` reads the same warmth → 趙阿福 stops extending credit
            //   · `renownDrawPct` reads 名頭 → he stops drawing a house
            // Keep refusing and those pile up until every gate is shut at once,
            // which is what 社會性死亡 actually is.
            world.bumpRenown(seat.debtorId, -BROADCAST_RENOWN_COST);
            world.bumpSelfRegard(seat.debtorId, -0.08);
            // 當事人的怨 vs 街談 —— the wronged party's grudge is FIRST-HAND and ends
            // when the debt does; everyone else is holding gossip, which fades as
            // they keep sharing rooms with him (`fadeHearsay`). Marking the two
            // differently is what keeps social death reversible without making it
            // cheap: he has to face people, and pay the one he actually wronged.
            const firstHand = `${DEBT_GRIEVANCE_MARK}到期不還${couldPay ? '——手裡不是沒有' : ''}，我當眾把話說了，心是冷的`;
            const hearsay = `${HEARSAY_MARK}他${DEBT_GRIEVANCE_MARK}不還${couldPay ? '，手裡還不是沒有' : ''}，這種人往後冷著點`;
            for (const witnessId of witnesses) {
                if (witnessId === seat.debtorId) continue;
                const wronged = witnessId === seat.creditorId;
                world.setEdge(witnessId, seat.debtorId, wronged ? firstHand : hearsay, 'cold');
                chillBond(bonds, witnessId, seat.debtorId, wronged ? 'shamed' : 'slighted');
            }
            out.privateNotices.push({
                characterId: seat.debtorId,
                text:
                    `${seat.creditorLabel}把你欠${seat.owedText}的事說給了整條街聽。往後在他那裡賒不到東西，` +
                    `夜裡敲誰的門，也未必有人應。錢還在你手裡——這條街的話，卻不在了。`,
            });
            out.spawnedWants.push(
                ...plantWant(world, {
                    characterId: seat.debtorId,
                    layer: '體面',
                    desc: `滿街都在說我欠帳不還，這名聲要自己撿回來`,
                    weight: 0.75,
                    resistance: 5,
                    tick: req.nowTick,
                    semanticTags: ['reckoning'],
                }),
            );
        }
    }

    if (ownsGraph) world.setBonds(bonds);
    out.landed = out.facts.length > 0;
    log.push({ day: req.day, label: req.label, facts: out.facts.length });
    if (!out.landed) {
        out.publicLines.push(`${req.label}：前街把摺子翻了一遍，這半月竟沒有一筆賒著的——難得。`);
    }
    return out;
}

/** Plant a dated 心事 with dedup on (character, desc). Returns [] when the heart
 *  already carries it, so a recurring card cannot stack duplicates. */
function plantWant(
    world: WorldState,
    init: {
        characterId: string;
        layer: string;
        desc: string;
        weight: number;
        resistance: number;
        tick: number;
        dueDay?: number;
        target?: string;
        semanticTags?: Want['semanticTags'];
    },
): Want[] {
    if (world.data.wants.some((w) => !w.retired && w.characterId === init.characterId && w.desc === init.desc)) return [];
    const want = newWant({
        id: world.data.wantSeq !== undefined ? world.nextWantId() : undefined,
        characterId: init.characterId,
        layer: init.layer,
        desc: init.desc,
        weight: init.weight,
        sat: 0.15,
        resistance: init.resistance,
        kind: 'narrative',
        source: 'aftermath',
        bornTick: init.tick,
        ...(init.target ? { target: init.target } : {}),
        ...(init.semanticTags?.length ? { semanticTags: init.semanticTags } : {}),
    });
    if (init.dueDay !== undefined) want.dueDay = init.dueDay;
    world.data.wants.push(want);
    return [want];
}

export { plantWant };
