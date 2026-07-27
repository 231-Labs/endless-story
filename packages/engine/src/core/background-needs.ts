/**
 * 生理需求降級 — hunger as background, not as a scene.
 *
 * Diagnosed failure: 「糖粥」 appeared 149 times, and on one 深宵 tick eight of
 * twelve characters' 眼下打算 was to go buy a bowl of it. Hunger had become a
 * HOMOGENIZING ATTRACTOR (the Smallville coffee-shop problem): a need every
 * character shares, satisfiable in one place, strong enough to out-compete their
 * actual wants. Twelve distinct people converged on one errand and the night
 * stopped being drama.
 *
 * The mistake was not modelling hunger — it is that a shared, trivially
 * satisfiable need was allowed to spend a whole SCENE. The existing 順路而食 pass
 * already handles a character standing at a stall (no beat, one log line). This
 * module extends the same treatment to everyone else: if hunger is not
 * dramatically relevant right now, it settles OFFSTAGE — money leaves the purse,
 * the belly is quieter, and the world gets one clause about it. The character
 * never travels for it and never spends a beat on it.
 *
 * Two things are deliberately NOT fixed:
 *   · a character who CANNOT afford food stays hungry, and the stake stays live.
 *     Scarcity is producing the best material in this world (「現結不記帳」,
 *     江聞鶴 holding his dignity on 0 圓) and must survive this change.
 *   · a character who is STARVING keeps their hunger in play. A belly that far
 *     gone is its own drama; a belly that is merely empty is an errand.
 */

import { accountFace, foodScenesOf, formatMoney, moveBetweenAccounts } from './season-economy.ts';
import { HUNGER_SEEK } from './stakes-brief.ts';
import type { SeasonCatalogItem } from './season-economy.ts';
import type { WorldState } from '../world-state.ts';

/** How much a background meal settles the belly — the same relief the catalog's
 *  `relieve-hunger` effect applies, so onstage and offstage eating agree. */
export const BACKGROUND_MEAL_RELIEF = 0.6;

export interface BackgroundNeedsReport {
    /** characters whose hunger was settled offstage this pass. */
    settledIds: string[];
    /** one terse clause per settlement, for the day log (never a scene beat). */
    lines: string[];
    /** characters left hungry ON PURPOSE — at a stall already, unable to pay,
     *  starving, or among the hungriest few who keep the stake. */
    keptOnstageIds: string[];
    /** total money that left the cast's purses (audit). */
    spentSubunits: string;
}

/**
 * 餓到成了戲 — the belly is past the point where it can be an errand.
 *
 * NOT keyed on want pressure, deliberately. `heat`/`frust` never decay by design
 * ("a central want always reaches breaking after sustained pressure"), so by the
 * second or third day EVERY character has a want at 'breaking' — a pressure-based
 * exemption is universally true and therefore useless, and a probe over a real
 * 3-day run confirmed exactly that: 13 of 13 exempt, the demotion inert, the 糖粥
 * attractor untouched.
 *
 * Hunger this deep is its own drama, independent of what else is burning: a body
 * at this point changes how a person behaves in every scene, which is the one
 * honest reason to leave it in the frame.
 */
export const HUNGER_STARVING = 0.9;

function starving(hunger: number): boolean {
    return hunger >= HUNGER_STARVING;
}

/**
 * 還能佔戲的餓 — how many characters may keep hunger as a LIVE dramatic stake on
 * one tick. This is the whole fix, expressed as one number.
 *
 * Hunger pulling one or two people to 趙阿福's stall is good drama (the 賒帳 scene
 * lives there). Hunger pulling EIGHT is an attractor. So the mechanism is not
 * removed, it is CAPPED: the hungriest few keep the stake, everyone else settles
 * offstage. Two, because a食擔 with two customers is a scene and a食擔 with eight
 * is a queue.
 */
export const HUNGER_ONSTAGE_CAP = 2;

/** The cheapest LOCATION-ANCHORED meal — the same food map the stakes brief and
 *  順路而食 read. A world whose meals are all unanchored (no `sceneName`) has no
 *  food venue at all, so this pass stays completely inert there, exactly like the
 *  rest of the hunger machinery. */
export function cheapestMeal(world: WorldState): SeasonCatalogItem | undefined {
    let best: SeasonCatalogItem | undefined;
    for (const item of foodScenesOf(world).values()) {
        if (!best || BigInt(item.priceSubunits) < BigInt(best.priceSubunits)) best = item;
    }
    return best;
}

/**
 * Settle hunger offstage for everyone it is not dramatically relevant for.
 *
 * Who KEEPS their hunger onstage, in priority order:
 *   1. anyone standing at a food venue — 順路而食 handles them at the real stall,
 *      through the real purchase path, and costs no scene either;
 *   2. anyone who cannot pay — scarcity is producing the best material in this
 *      world (「現結不記帳」, 江聞鶴 holding his dignity on 0 圓) and is never
 *      smoothed away;
 *   3. anyone who is STARVING — a belly that far gone is its own drama;
 *   4. the hungriest of whoever is left, up to `HUNGER_ONSTAGE_CAP`.
 * Everyone else pays for the cheapest meal from their own purse without moving,
 * and the world gets one clause about it.
 *
 * Runs at most once per character per day (`backgroundFedDay`), so it cannot
 * become a money leak. Deterministic throughout: a fixed sort (hunger desc, then
 * id) and a ledger txn id keyed to the day and character.
 */
export function settleBackgroundNeeds(
    world: WorldState,
    req: { day: number; nowTick: number; skipIds?: ReadonlyArray<string>; onstageCap?: number },
): BackgroundNeedsReport {
    const report: BackgroundNeedsReport = { settledIds: [], lines: [], keptOnstageIds: [], spentSubunits: '0' };
    const data = world.data.economy;
    const meal = cheapestMeal(world);
    if (!data || !meal) return report; // no anchored food venue ⇒ wholly inert
    const foodScenes = foodScenesOf(world);
    const skip = new Set(req.skipIds ?? []);
    const departed = new Set(world.data.departedIds ?? []);
    const fed = (world.data.backgroundFedDay ??= {});
    const price = BigInt(meal.priceSubunits);
    const vendorId = meal.vendorAccountId ?? data.marketAccountId;

    // ── who is even in scope, and who is exempt ──
    const candidates: Array<{ id: string; hunger: number }> = [];
    for (const member of world.data.cast) {
        if (departed.has(member.id) || skip.has(member.id)) continue;
        if (member.state.hunger <= HUNGER_SEEK) continue;
        if (fed[member.id] === req.day) continue;
        // (1) already at a stall — 順路而食 will feed them where they stand.
        if (foodScenes.has(world.data.roster[member.id])) {
            report.keptOnstageIds.push(member.id);
            continue;
        }
        // (2) cannot pay — the hunger stays, and so does the stake.
        const purse = accountFace(world, member.id);
        if (!purse || purse.available < price) {
            report.keptOnstageIds.push(member.id);
            continue;
        }
        // (3) starving — the belly is past being an errand.
        if (starving(member.state.hunger)) {
            report.keptOnstageIds.push(member.id);
            continue;
        }
        candidates.push({ id: member.id, hunger: member.state.hunger });
    }

    // (4) the hungriest few keep the stake; the rest settle offstage.
    candidates.sort((a, b) => b.hunger - a.hunger || a.id.localeCompare(b.id));
    const cap = Math.max(0, Math.floor(req.onstageCap ?? HUNGER_ONSTAGE_CAP));
    let spent = 0n;
    for (let i = 0; i < candidates.length; i++) {
        const { id } = candidates[i];
        if (i < cap) {
            report.keptOnstageIds.push(id);
            continue;
        }
        const member = world.castById(id)!;
        const moved = moveBetweenAccounts(world, {
            txnId: `bgmeal:d${req.day}:${id}`,
            fromAccountId: id,
            toAccountId: vendorId,
            amountSubunits: price,
            memo: `${meal.label}·順手墊了一口`,
            causeEventId: `${world.data.sagaId}:background-need:d${req.day}:${id}`,
        });
        if (!moved.ok || moved.paidSubunits <= 0n) {
            report.keptOnstageIds.push(id);
            continue;
        }
        spent += moved.paidSubunits;
        fed[id] = req.day;
        member.state.hunger = Math.max(0, member.state.hunger - BACKGROUND_MEAL_RELIEF);
        report.settledIds.push(id);
        report.lines.push(`${member.name}隨手墊了一口${meal.label}（${formatMoney(data, moved.paidSubunits)}），沒當一回事。`);
    }
    report.spentSubunits = spent.toString();
    return report;
}
