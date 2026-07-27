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
 *   · `runReckoning`   月半結帳 — the deadline that MUST arrive. Every outstanding
 *                      obligation is pulled forward and forced to an answer; who
 *                      cannot pay is either 免帳 (and now owes a 人情) or 當眾催帳
 *                      (and has lost 體面). Both are irreversible, and both are
 *                      written back into character state and 心事 — not narrated.
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

// ── 月半結帳 (the deadline that must arrive) ──────────────────────────────────

/** One irreversible fact the reckoning produced. Counted by the vitals as an
 *  不可逆事件 — this is the tick where the world stopped being reversible. */
export type ReckoningFact =
    | { kind: 'paid'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string }
    | { kind: 'forgiven'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string }
    | { kind: 'dunned'; billId: string; debtorId?: string; creditorLabel: string; amountSubunits: string };

export interface ReckoningOutcome {
    landed: boolean;
    publicLines: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    facts: ReckoningFact[];
    /** 心事 the reckoning genuinely stirred (already in the world). */
    spawnedWants: Want[];
    /** already run for this day — a second call is a no-op, not a double charge. */
    duplicate?: boolean;
}

/** 免帳門檻 — grace is extended only by a creditor who can AFFORD it (this many
 *  days of runway left) to a debtor whose name is still worth keeping. Below
 *  either bar, the tab gets called in public. */
export const FORGIVE_CREDITOR_RUNWAY_DAYS = 3n;
export const FORGIVE_DEBTOR_RENOWN = 0.5;
/** How long a forgiven 人情 hangs over the debtor before it forecloses. */
export const FAVOUR_DEBT_DAYS = 7;

/**
 * 月半結帳 — every outstanding obligation is pulled forward, whatever its own
 * dueDay, and forced to one of three irreversible answers. This is the deadline
 * semantics the diagnosis asked for: it ARRIVES on a real tick, and arriving
 * costs something.
 *
 * The 免帳 / 當眾催帳 branch is deterministic (creditor solvency × debtor 名頭),
 * and BOTH branches write back to the world: renown / self-regard move, a
 * relationship edge records what happened, and a dated 心事 is planted. Nothing
 * about this outcome lives only in prose.
 *
 * Idempotent per narrative day via `world.data.reckonings`.
 */
export function runReckoning(
    world: WorldState,
    req: { day: number; nowTick: number; label: string },
): ReckoningOutcome {
    const data = world.data.economy;
    const out: ReckoningOutcome = { landed: false, publicLines: [], privateNotices: [], facts: [], spawnedWants: [] };
    if (!data) return out;
    const log = (world.data.reckonings ??= []);
    if (log.some((entry) => entry.day === req.day)) return { ...out, duplicate: true };

    const leaderId = troupeLeaderId(world);
    const causeEventId = `${world.data.sagaId}:reckoning:d${req.day}`;

    for (const bill of data.bills ?? []) {
        const owing = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        if (owing <= 0n) continue;
        const payerId = bill.fromAccountId ?? data.troupeAccountId;
        const payeeId = bill.toAccountId ?? data.marketAccountId;
        const creditorLabel = bill.creditor ?? accountFace(world, payeeId)?.label ?? data.shortfallCreditor ?? '債主';
        // The FACE of the debt: a character pays for themselves; an establishment's
        // debt is carried in public by whoever may spend from it (the 班主).
        const debtorId = world.castById(payerId) ? payerId : accountFace(world, payerId)?.authorizedSpenderIds[0] ?? leaderId;
        const debtorName = debtorId ? world.nameById(debtorId) : accountFace(world, payerId)?.label ?? payerId;

        const moved = moveBetweenAccounts(world, {
            txnId: `reckon:d${req.day}:${bill.id}`,
            fromAccountId: payerId,
            toAccountId: payeeId,
            amountSubunits: owing,
            memo: `${req.label}·${bill.label}`,
            causeEventId,
        });
        const paid = moved.ok ? moved.paidSubunits : 0n;
        if (paid > 0n) bill.paidSubunits = (BigInt(bill.paidSubunits) + paid).toString();
        const still = owing - paid;

        if (still <= 0n) {
            out.facts.push({ kind: 'paid', billId: bill.id, ...(debtorId ? { debtorId } : {}), creditorLabel, amountSubunits: paid.toString() });
            out.publicLines.push(`${req.label}：${bill.label}${formatMoney(data, owing)}當場結清，${creditorLabel}把${debtorName}那一筆從摺子上劃了。`);
            continue;
        }

        const creditor = accountFace(world, payeeId);
        const creditorCanAfford = !creditor || creditor.runwayDays === null || creditor.runwayDays >= FORGIVE_CREDITOR_RUNWAY_DAYS;
        const debtorWorthKeeping = debtorId ? world.renownOf(debtorId) >= FORGIVE_DEBTOR_RENOWN : false;
        const forgiven = creditorCanAfford && debtorWorthKeeping;

        if (forgiven) {
            // 免帳 —— the paper is torn up (irreversible), and a 人情 takes its place.
            bill.paidSubunits = bill.amountSubunits;
            out.facts.push({ kind: 'forgiven', billId: bill.id, ...(debtorId ? { debtorId } : {}), creditorLabel, amountSubunits: still.toString() });
            out.publicLines.push(
                `${req.label}：${bill.label}還差${formatMoney(data, still)}，${creditorLabel}當眾把那頁紅字撕了` +
                    `——「${debtorName}的帳，不記了。」帳是清了，情記下了。`,
            );
            if (debtorId) {
                world.bumpSelfRegard(debtorId, -0.03); // 被人放過，自己心裡最清楚
                world.setEdge(debtorId, debtorId === leaderId ? debtorId : debtorId, '欠著一份沒法折現的情');
                out.privateNotices.push({
                    characterId: debtorId,
                    text: `${creditorLabel}免了你${formatMoney(data, still)}的帳。這一筆從摺子上下來了，卻壓到了別的地方。`,
                });
                out.spawnedWants.push(
                    ...plantWant(world, {
                        characterId: debtorId,
                        layer: '虧欠',
                        desc: `${creditorLabel}免了那筆帳，這份情得還`,
                        weight: 0.62,
                        resistance: 4,
                        tick: req.nowTick,
                        dueDay: req.day + FAVOUR_DEBT_DAYS,
                        semanticTags: ['reckoning'],
                    }),
                );
            }
        } else {
            // 當眾催帳 —— nobody un-hears this. 名頭 drops, and the drop is real state.
            out.facts.push({ kind: 'dunned', billId: bill.id, ...(debtorId ? { debtorId } : {}), creditorLabel, amountSubunits: still.toString() });
            out.publicLines.push(
                `${req.label}：${bill.label}還欠${formatMoney(data, still)}，${creditorLabel}當著滿街的人把${debtorName}叫住` +
                    `——數目、日子、幾時還，一句句問到底。圍看的人不少。`,
            );
            if (debtorId) {
                world.bumpRenown(debtorId, -0.08);
                world.bumpSelfRegard(debtorId, -0.06);
                out.privateNotices.push({
                    characterId: debtorId,
                    text: `當街被${creditorLabel}催了${formatMoney(data, still)}的帳，圍看的人裡有認得你的。這張臉，得自己撿回來。`,
                });
                out.spawnedWants.push(
                    ...plantWant(world, {
                        characterId: debtorId,
                        layer: '體面',
                        desc: `當街被催帳那一場，臉要自己撿回來`,
                        weight: 0.7,
                        resistance: 5,
                        tick: req.nowTick,
                        dueDay: req.day + FAVOUR_DEBT_DAYS,
                        semanticTags: ['reckoning'],
                    }),
                );
            }
        }
    }

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
