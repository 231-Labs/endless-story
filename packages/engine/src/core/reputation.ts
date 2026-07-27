/**
 * 口碑帳 — what the street knows about you, as a mechanism.
 *
 * This module exists because of one design correction: the engine must not
 * reach into a character's purse. 「打死不還」 has to be a playable choice, and a
 * choice is only real if refusing costs something OTHER than the money being
 * taken anyway. What it costs, in a world of 前街 food stalls and 錢莊 credit, is
 * your name — and a name is not a private scalar. It is something OTHER PEOPLE
 * hold, that spreads, and that closes doors.
 *
 * So a reputation mark is three things at once:
 *   · a FACT with a knower list — it spreads person to person, and somebody who
 *     never heard it does not act on it;
 *   · a MECHANICAL GATE — a standing 賒帳不還 mark revokes tab at the vendor who
 *     was stiffed, so the refusal actually closes a door rather than adding an
 *     adjective;
 *   · a PERCEPT — it reaches the beat prompt, so the character knows what the
 *     street is saying about them and can act on that.
 *
 * Crucially, a mark is only ever created by a CREDITOR'S DECISION, never by the
 * clock. A creditor who genuinely does not mind writes the debt off and no mark
 * exists — 「但那是他們的事」. The engine settles the consequence of the choice;
 * it never makes the choice.
 */

import type { WorldState } from '../world-state.ts';

export type ReputationKind =
    /** 帳到日不還，債主把話傳了出去。 */
    | 'debt-refused'
    /** 債主當眾把那頁紅字撕了——受了人情的人，街上也記著。 */
    | 'debt-forgiven'
    /** 到日之前自己把帳清了。說到做到，也是一種名聲。 */
    | 'debt-kept';

export interface ReputationMark {
    id: string;
    /** whose name this is about. */
    aboutId: string;
    kind: ReputationKind;
    day: number;
    /** the fact in world language — quotable straight into a percept. */
    note: string;
    /** who has heard. A mark nobody knows is not a reputation. */
    knownByIds: string[];
    /** the account whose door this closes (賒帳資格). Only on `debt-refused`. */
    tabRevokedFor?: string;
    /** cleared when the debt is finally settled — a mark can be lived down. */
    settledDay?: number;
}

/** How much a standing 不還 mark costs in public standing, per mark. Applied by
 *  the caller at creation; kept here so the two numbers live together. */
export const REFUSAL_RENOWN_COST = 0.12;
export const FORGIVEN_SELF_REGARD_COST = 0.03;

function ledger(world: WorldState): ReputationMark[] {
    return (world.data.reputation ??= []);
}

/** Record a mark. Idempotent by id, so a replayed tick never doubles it. */
export function recordReputation(world: WorldState, mark: ReputationMark): ReputationMark {
    const marks = ledger(world);
    const existing = marks.find((row) => row.id === mark.id);
    if (existing) return existing;
    marks.push(mark);
    return mark;
}

/** Somebody heard. Monotonic and idempotent — a name spreads, it never un-spreads. */
export function spreadReputation(world: WorldState, markId: string, hearerIds: ReadonlyArray<string>): string[] {
    const mark = ledger(world).find((row) => row.id === markId);
    if (!mark) return [];
    const fresh: string[] = [];
    for (const id of hearerIds) {
        if (!world.castById(id) || mark.knownByIds.includes(id)) continue;
        mark.knownByIds.push(id);
        fresh.push(id);
    }
    return fresh;
}

/** Standing (unsettled) marks about this character. */
export function reputationOf(world: WorldState, aboutId: string, kind?: ReputationKind): ReputationMark[] {
    return ledger(world).filter(
        (mark) => mark.aboutId === aboutId && mark.settledDay === undefined && (kind === undefined || mark.kind === kind),
    );
}

/**
 * 洗刷 — clearing the debt clears the mark. Paying late does not un-say what was
 * said (the mark keeps its day and stays in the ledger for the record), but it
 * stops gating: the door reopens and the percept stops nagging. That is what
 * makes 打死不還 a position a character can change their mind about.
 */
export function settleReputationForBill(world: WorldState, billId: string, day: number): ReputationMark[] {
    const cleared: ReputationMark[] = [];
    for (const mark of ledger(world)) {
        if (mark.settledDay !== undefined) continue;
        if (!mark.id.includes(billId)) continue;
        mark.settledDay = day;
        cleared.push(mark);
    }
    return cleared;
}

/**
 * 賒帳資格 — the mechanical bite. A vendor who was publicly stiffed stops
 * extending tab to that buyer. Read by the purchase path, so refusing to pay
 * genuinely closes a door instead of adding an adjective.
 *
 * Deliberately scoped to the vendor who was actually stiffed: 趙阿福 refusing you
 * credit is his business, and it does not make 殷阿婆 refuse you too — unless she
 * was stiffed as well. Reputation spreads as KNOWLEDGE; only the injured party's
 * door closes automatically.
 */
export function tabAllowedFor(world: WorldState, buyerId: string, vendorAccountId: string): boolean {
    return !reputationOf(world, buyerId, 'debt-refused').some((mark) => mark.tabRevokedFor === vendorAccountId);
}

/**
 * 街上怎麼說你 — the line the beat prompt shows a character about their own name.
 * Only standing marks, only what the street actually knows. Undefined when the
 * street has nothing on them (the overwhelmingly common case).
 */
export function reputationPerceptFor(world: WorldState, characterId: string): string | undefined {
    const marks = reputationOf(world, characterId);
    if (!marks.length) return undefined;
    const lines = marks.map((mark) => {
        const heard = mark.knownByIds.filter((id) => id !== characterId).length;
        const reach = heard >= 6 ? '前街差不多都知道了' : heard >= 3 ? '傳開了幾處' : heard >= 1 ? '有人聽說了' : '暫時還沒傳開';
        return `- ${mark.note}（${reach}）`;
    });
    return ['【街上怎麼說你】', ...lines, '這些話是別人記著的，不會因為你不提就消失；帳清了，話才會淡。'].join('\n');
}

/** What OTHERS know about a person — for a lender/vendor seat deciding whether to
 *  trust them. Scoped to what the viewer has actually heard. */
export function reputationAsKnownBy(world: WorldState, viewerId: string, aboutId: string): string | undefined {
    const marks = reputationOf(world, aboutId).filter((mark) => mark.knownByIds.includes(viewerId));
    if (!marks.length) return undefined;
    return marks.map((mark) => mark.note).join('；');
}
