/**
 * 處境 — where somebody stands with the people around them.
 *
 * This module STORES NOTHING. Every function here is a lens over state the
 * world already keeps: the tonal relationship graph (`edges`), the numeric bond
 * graph (`bonds`), and public 名頭 (`renown`). That is deliberate, and it is a
 * correction of an earlier design.
 *
 * The first version of the debt consequence invented a separate reputation
 * ledger — marks, knower lists, a per-vendor revocation flag. It worked, and it
 * was wrong: it answered 「欠錢不還要付什麼代價」 by building a new machine, when
 * the world already had exactly the right one. What actually happens when
 * somebody refuses to pay is that the people who saw it THINK LESS OF THEM, and
 * that is what `edges` and `bonds` are for. A parallel ledger would have meant
 * two sources of truth about the same social fact, drifting apart.
 *
 * So the consequence chain is now entirely made of parts that already existed:
 *
 *   債主當眾說了 → 在場每個人對他的 edge 轉冷（`setEdge`, disposition 'cold'）
 *                → 交情實際被打掉（`chillBond`，且連 peak 一起蝕，所以回不去）
 *                → 名頭掉（`bumpRenown`）
 *   然後既有的門一扇一扇關上：
 *     `welcome()` 掉到夜訪門檻之下  → 沒有人在夜裡替他開門
 *     `tabTrust()` 掉到賒帳門檻之下 → 賒不到東西
 *     `renownDrawPct` 貢獻歸零      → 名頭引不了座，不值得掛牌
 *     `decideLend` 讀到冷關係        → 借不到錢
 *
 * 社會性死亡 is therefore not a flag anybody sets. It is the name for what it
 * looks like when all of those gates have closed at once — which is why
 * `socialStandingOf` below only COUNTS things, and never writes.
 */

import { BOND, bondOf } from './bond-graph.ts';
import type { WorldState } from '../world-state.ts';

/**
 * 冷字 — the marker a grievance tone must contain.
 *
 * `WorldState.welcome()` already classifies an edge by scanning its tone for
 * 妒|怨|恨|冷|敵|競. Rather than add a second classifier, a grievance simply
 * writes a tone that contains 「冷」, so the existing warmth gate reads it with no
 * new code. The tone is also the prose a character sees about their own
 * relationships, so it has to read as something a person would actually think.
 */
export const GRIEVANCE_MARK = '冷';
/** The substring that identifies a debt grievance specifically, so the derived
 *  percept can talk about 帳 rather than about relationships in general. */
export const DEBT_GRIEVANCE_MARK = '欠帳';
/**
 * 街談 — the marker for a SECOND-HAND grievance: somebody who only heard about
 * it, rather than the person who was actually wronged.
 *
 * The distinction matters because the two decay completely differently. The
 * creditor's own grudge is first-hand and ends when the debt does. Everybody
 * else is holding gossip, and gossip fades when you keep having to look the
 * person in the eye — which is what `fadeHearsay` below does, in the same
 * nightly slot where bonds already cool.
 */
export const HEARSAY_MARK = '聽說';

/** 賒帳門檻 — the warmth a vendor needs to feel toward a buyer before extending
 *  credit. Credit is trust; this is the number that says how much. */
export const TAB_TRUST_FLOOR = 0.4;
/** 名頭門檻 — when the vendor is a faceless establishment there is no personal
 *  relationship to read, so it judges by the buyer's public name instead. */
export const TAB_RENOWN_FLOOR = 0.25;
/** 夜門門檻 — the warmth `welcome()` needs before a private door opens at night.
 *  Mirrors the tick's own gate; re-stated here so the diagnostics can count
 *  doors without duplicating the threshold by accident. */
export const NIGHT_DOOR_WARMTH = 0.7;

/** Everyone who currently holds a grievance-toned edge toward this person. */
export function grievedAgainst(world: WorldState, aboutId: string): string[] {
    const out: string[] = [];
    for (const [fromId, row] of Object.entries(world.data.edges)) {
        if (fromId === aboutId) continue;
        const edge = row[aboutId];
        if (!edge) continue;
        const cold = edge.disposition === 'cold' || edge.tone.includes(GRIEVANCE_MARK);
        if (cold) out.push(fromId);
    }
    return out.sort();
}

/** Those grievances that are specifically about money owed. */
export function debtGrievedAgainst(world: WorldState, aboutId: string): string[] {
    return grievedAgainst(world, aboutId).filter((fromId) =>
        (world.data.edges[fromId]?.[aboutId]?.tone ?? '').includes(DEBT_GRIEVANCE_MARK),
    );
}

/**
 * 賒不賒得到 — credit is trust, so the tab gate reads the relationship rather
 * than a revocation flag.
 *
 * A vendor with a human face (an establishment whose authorized spender is a
 * cast member — 趙阿福 behind 前街食肆) judges the buyer through `welcome()`, the
 * same warmth gate the night doors use. A faceless house has no relationship to
 * consult and falls back on the buyer's public 名頭.
 *
 * Because both inputs recover — an edge can be re-warmed by what a character
 * actually does, renown by how they carry themselves — the door reopens on its
 * own when the relationship does. Nothing needs to be un-set.
 */
export function tabTrust(world: WorldState, buyerId: string, vendorAccountId: string): { allowed: boolean; face?: string; reason?: string } {
    const account = world.data.economy?.state.accounts[vendorAccountId];
    // A personal account IS its own face; only an establishment needs a spender
    // list consulted. (A character account carries no authorizedSpenderIds.)
    const faceId = world.castById(vendorAccountId)
        ? vendorAccountId
        : account?.authorizedSpenderIds.find((id) => world.castById(id));
    if (faceId) {
        if (faceId === buyerId) return { allowed: true, face: faceId }; // 自家的攤子
        const warmth = world.welcome(faceId, buyerId);
        return warmth >= TAB_TRUST_FLOOR
            ? { allowed: true, face: faceId }
            : { allowed: false, face: faceId, reason: `${world.nameById(faceId)}如今不肯再賒給你` };
    }
    const renown = world.renownOf(buyerId);
    return renown >= TAB_RENOWN_FLOOR
        ? { allowed: true }
        : { allowed: false, reason: '你這名聲，這裡從今是現錢交易' };
}

/**
 * 街上怎麼說你 — the line a character sees about their OWN standing, derived
 * from who currently holds a cold edge toward them.
 *
 * Undefined when nobody does, which is the overwhelmingly common case. The
 * reach is stated honestly (one person is not the street), and so is the way
 * back, because a consequence a character cannot see is a consequence they can
 * never decide to do anything about.
 */
export function standingPerceptFor(world: WorldState, characterId: string): string | undefined {
    const grieved = grievedAgainst(world, characterId);
    if (!grieved.length) return undefined;
    const onBoard = world.activeCast().length;
    const reach =
        grieved.length >= Math.max(3, Math.ceil(onBoard * 0.5))
            ? '這條街差不多都這麼看你了'
            : grieved.length >= 2
              ? '不只一個人這麼看你'
              : '暫時只有一個人這麼看你';
    const lines = grieved
        .slice(0, 6)
        .map((fromId) => `- ${world.nameById(fromId)}：${world.data.edges[fromId][characterId].tone}`);
    return [
        `【街上怎麼說你】（${reach}）`,
        ...lines,
        '這些是別人心裡記下的，不會因為你不提就消失；把事做回來，話才會淡。',
    ].join('\n');
}

/**
 * 街談會淡 — second-hand grievances soften for the pairs that actually MET today.
 *
 * Runs in the same nightly slot as `decayBonds`, on the same `togetherToday`
 * signal, because it is the same physics: relationships evolve with contact.
 * Somebody who merely heard that you stiffed 趙阿福 finds it harder to keep
 * holding that against you the more they have to share a room with you. The
 * WRONGED party is exempt — their grudge is first-hand and ends when the debt
 * does, not when they get used to your face.
 *
 * This is what keeps 社會性死亡 from being a one-way door: the derived state can
 * un-happen, but only by actually being around people, which costs the
 * character something to do while everyone is cold to them.
 *
 * Returns the pairs it softened, for the log.
 */
export function fadeHearsay(
    world: WorldState,
    togetherToday: ReadonlySet<string>,
): Array<{ fromId: string; toId: string }> {
    const softened: Array<{ fromId: string; toId: string }> = [];
    for (const [fromId, row] of Object.entries(world.data.edges)) {
        for (const [toId, edge] of Object.entries(row)) {
            if (!edge.tone.includes(HEARSAY_MARK)) continue;
            if (!togetherToday.has([fromId, toId].sort().join('|'))) continue;
            world.setEdge(fromId, toId, '那樁傳聞聽過就算了，人還是天天照面', 'neutral');
            softened.push({ fromId, toId });
        }
    }
    return softened;
}

export interface SocialStanding {
    characterId: string;
    /** how many people hold a cold edge toward them. */
    cold: number;
    /** how many hold a warm one. */
    warm: number;
    /** how many private doors would open for them tonight (`welcome` ≥ gate). */
    doorsOpen: number;
    /** public 名頭, 0..1. */
    renown: number;
    /** mean numeric bond OTHERS hold toward them (0..1) — the deep version of
     *  the same question the tonal edges answer coarsely. */
    meanBond: number;
    /**
     * 社會性死亡 — not a state anybody set, but a description of a world in which
     * a supermajority of the room has gone COLD, not one person is warm, and the
     * name draws nothing.
     *
     * Deliberately NOT keyed on `doorsOpen`. The night gate needs an actively
     * warm edge (0.7), and an unseeded pair reads neutral (0.5), so at world
     * start almost nobody has a door open to them — a trace over three
     * reckonings showed `doorsOpen` sitting at 0 from the first tick, which
     * makes it true of everyone and therefore evidence about no one. `cold`,
     * `warm` and `renown` are the terms that actually move.
     */
    sociallyDead: boolean;
}

/** Read-only census of where somebody stands. Writes nothing. */
export function socialStandingOf(world: WorldState, characterId: string): SocialStanding {
    const others = world.activeCast().filter((member) => member.id !== characterId);
    const bonds = world.bondGraph();
    let cold = 0;
    let warm = 0;
    let doorsOpen = 0;
    let bondSum = 0;
    for (const other of others) {
        const warmth = world.welcome(other.id, characterId);
        if (warmth >= NIGHT_DOOR_WARMTH) {
            warm += 1;
            doorsOpen += 1;
        } else if (warmth <= 0.3) {
            cold += 1;
        }
        bondSum += bondOf(bonds, other.id, characterId);
    }
    const renown = world.renownOf(characterId);
    return {
        characterId,
        cold,
        warm,
        doorsOpen,
        renown,
        meanBond: others.length ? Number((bondSum / others.length).toFixed(4)) : BOND.seed.stranger,
        // A supermajority actively cold, not one warm face left, and a name that
        // draws nothing. All three have to be true at once, and all three can
        // come back — which is what keeps this a description rather than a verdict.
        sociallyDead: others.length >= 3 && warm === 0 && cold >= Math.ceil(others.length * 0.6) && renown < 0.25,
    };
}

/** The cast, worst standing first — for the diagnostics' 處境 section. */
export function standingBoard(world: WorldState): SocialStanding[] {
    return world
        .activeCast()
        .map((member) => socialStandingOf(world, member.id))
        .sort((a, b) => a.doorsOpen - b.doorsOpen || a.renown - b.renown || a.characterId.localeCompare(b.characterId));
}
