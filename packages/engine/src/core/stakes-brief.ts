/**
 * 利害簡報 (stakes brief) — the movement-phase soft hint, rebuilt as a NEUTRAL
 * BRIEFING instead of a single-winner priority cascade.
 *
 * The old `rhythmHint` was a hard cascade: it `return`ed the FIRST matching pull
 * (HUNGER first — 空著肚子做不了活，旁的事等吃過再說 — then confide, then 廟, then
 * duty), so a mechanical hunger yank could pull a lead off the 戲台 at 開鑼 and the
 * livelihood/口碑 stakes were never surfaced at all. This collects EVERY applicable
 * stake into a short multi-line brief — livelihood/reputation FIRST, appetite
 * demoted to one line among others, the optional pulls (夜訪/廟) last — and lets
 * `decideMove` weigh them like a sensible person (營生/口碑 outrank a passing
 * hunger). It is still only a SOFT hint: the single movement authority (decideMove)
 * is untouched, and the deterministic FakeSceneAgent ignores it entirely, so the
 * mechanical movement/economy path is byte-identical.
 *
 * The CONSEQUENCES stay mechanical elsewhere (hunger still rises + degrades
 * mood/fatigue if ignored, 停鑼 still dents 口碑); this only reframes the HINT.
 *
 * Pure: reads the world + precomputed maps, mutates nothing.
 */

import { formatMoney, type SeasonCatalogItem } from './season-economy.ts';
import { dutyRhythm } from './livelihood-rhythm.ts';
import { confideWorry, hasHostileWantToward, type Want } from './want-core.ts';
import { BOND, bondOf, type BondGraph } from './bond-graph.ts';
import { isStuckWant } from './temple-prayer.ts';
import { renownLabel, type CastMember, type WorldState } from '../world-state.ts';

/** Pressing hunger — the belly is worth surfacing as ONE stake (demoted from the
 *  old forced-first rank). Below this, hunger is a mere undertone (stateLine). */
export const HUNGER_SEEK = 0.55;

/** The parts of day where tonight's show is imminent enough to brief the leads /
 *  troupe on it (排練收工、開鑼、燈已上): 晡時 (afternoon wind-down) → 入夜. */
const SHOW_PARTS = new Set(['晡時', '黃昏', '入夜']);

export interface StakesBriefInput {
    world: WorldState;
    member: CastMember;
    /** Where the mover stands right now. */
    currentSceneId: string;
    /** Part-of-day label (清晨/日午/…). */
    clockLabel: string;
    /** Monotonic tick — the temple 'stuck want' recency test reads it. */
    nowTick: number;
    /** This mover's hottest live wants (the temple 求願 check scans these). */
    liveWants: Want[];
    /** All live wants (confideWorry + the hostility guard scan these). */
    wants: Want[];
    /** Legal destinations this tick — reachability for the 夜訪/廟 pulls. */
    options: Array<{ sceneId: string; name: string }>;
    /** Numeric bond graph as persisted at movement start (the 夜訪 trust gate). */
    bonds: BondGraph;
    /** sceneId → cheapest anchored meal (empty ⇒ the hunger line stays inert). */
    foodScenes: Map<string, SeasonCatalogItem>;
    /** Temple scene ids (empty ⇒ the 廟 line stays inert). */
    templeScenes: Set<string>;
    /** Today's 班主-called rehearsal, if live this day (the show/生計 gate). */
    rehearsalToday?: { day: number; title: string; venueSceneId: string };
    /** The troupe players the rehearsal can draw (= the 當班 membership signal). */
    rehearsalTroupe: Set<string>;
    /** The resolved rehearsal venue name (the afternoon duty line). */
    rehearsalVenueName: string;
}

/**
 * Assemble the 利害簡報 — the applicable stakes, ordered livelihood/reputation-first,
 * joined by newline. Empty ⇒ undefined (the runner's `decideMove` treats an absent
 * hint the same as before). NEVER『旁的事等吃過再說』— the demotion is the point.
 */
export function buildStakesBrief(input: StakesBriefInput): string | undefined {
    const {
        world, member, currentSceneId, clockLabel, nowTick,
        liveWants, wants, options, bonds, foodScenes, templeScenes,
        rehearsalToday, rehearsalTroupe, rehearsalVenueName,
    } = input;
    const w = world.data;
    const econ = w.economy;
    const perf = econ?.performance;
    const spendable = (id: string): bigint => BigInt(econ?.state.accounts[id]?.available ?? '0');
    const lines: string[] = [];

    // 今晚的戲・生計 (the missing piece) — when a show is staged today and this mover
    // is a lead or on the troupe, at 晡時/黃昏/入夜 name the LIVELIHOOD stake: 開鑼 needs
    // people on the boards, and a house is the whole troupe's keep (你也有分潤).
    const isLead = !!perf?.leadIds.includes(member.id);
    const isTroupe = rehearsalTroupe.has(member.id);
    const showApplies = !!rehearsalToday && !!perf && (isLead || isTroupe) && SHOW_PARTS.has(clockLabel);
    if (showApplies) {
        const standing = isLead ? '領銜' : '當班';
        lines.push(
            `今晚${perf!.venueSceneName}有《${rehearsalToday!.title}》，你（${standing}）——開鑼時人要在台上，戲才唱得成；一場票房是全班的生計，你也有分潤。`,
        );
        // 口碑 — the same show is a stake on this person's NAME (滿座長臉、停鑼折面子).
        lines.push(`今晚這場也關乎你的名頭（${renownLabel(world.renownOf(member.id))}）：滿座長臉，停鑼折面子。`);
    }

    // 行當本分 — the generic own-duty / work-by-day / home-by-night rhythm, and the
    // 班主's afternoon rehearsal pull. Kept, but now ONE line in the brief (not the
    // sole winner): livelihood, so it reads before appetite.
    const dutyLine = dutyRhythm(
        clockLabel,
        (() => {
            // A player's OWN 行當專屬 duty for this part takes precedence.
            const memberDuty = member.duties?.find((d) => d.part === clockLabel && d.duty);
            if (memberDuty) return { sceneName: world.sceneNameById(memberDuty.sceneId), note: memberDuty.note };
            // Else the 班主's called rehearsal is a TRANSIENT afternoon duty for troupe
            // players with no own duty this part.
            if (rehearsalToday && (clockLabel === '日午' || clockLabel === '晡時') && rehearsalTroupe.has(member.id)) {
                return { sceneName: rehearsalVenueName, note: `排《${rehearsalToday.title}》，班主叫的` };
            }
            return undefined;
        })(),
        w.workByChar[member.id] ? world.sceneNameById(w.workByChar[member.id]) : undefined,
        w.homeByChar[member.id] ? world.sceneNameById(w.homeByChar[member.id]) : undefined,
    );
    if (dutyLine) lines.push(dutyLine);

    // 欠條過期 (creditVerbs) — an OVERDUE personal debt to a cast member is a
    // stake the debtor carries into every encounter: one line, first such 欠條.
    // Flag-gated: personal 欠條 only exist with 借賒有據 on, and the gate keeps a
    // flag-off world byte-identical even where an overdue cast-to-cast 租金 bill
    // exists (lease worlds never saw this line before).
    if (w.creditVerbs && econ) {
        const overdue = (econ.bills ?? []).find((bill) =>
            bill.fromAccountId === member.id &&
            !!bill.toAccountId && !!world.castById(bill.toAccountId) &&
            w.clock.day > bill.dueDay &&
            BigInt(bill.amountSubunits) > BigInt(bill.paidSubunits));
        if (overdue) {
            const remaining = BigInt(overdue.amountSubunits) - BigInt(overdue.paidSubunits);
            lines.push(`你還欠著${world.nameById(overdue.toAccountId!)}的${formatMoney(econ, remaining)}，過了期——遇上了少不得要提。`);
        }
    }

    // 身子・餓 (DEMOTED) — a pressing belly is now ONE stake among others, framed
    // NEUTRALLY (no『空著肚子做不了活…旁的事等吃過再說』). Same trigger + food-scene pick
    // as before: hunger past HUNGER_SEEK, an affordable anchored meal exists, and the
    // mover is not already standing at a food scene. Inert for a seed with no anchored
    // meal (foodScenes empty).
    if (econ && foodScenes.size && member.state.hunger > HUNGER_SEEK && !foodScenes.has(currentSceneId)) {
        const affordable = [...foodScenes].filter(([, item]) => spendable(member.id) >= BigInt(item.priceSubunits));
        const sameDistrict = affordable.filter(([foodSceneId]) => world.sameDistrict(currentSceneId, foodSceneId));
        const pick = sameDistrict[0] ?? affordable[0];
        if (pick) {
            const [foodSceneId, meal] = pick;
            const foodSceneName = world.sceneNameById(foodSceneId);
            const priceText = formatMoney(econ, BigInt(meal.priceSubunits));
            lines.push(`你此刻腹中空，得空可往「${foodSceneName}」墊墊（一份${meal.label}${priceText}）。`);
        }
    }

    // 心事・夜訪 (kept, as OPTION) — at 黃昏/入夜/深宵 a pressing non-romantic worry may
    // be taken to the most-trusted, non-resented confidant at a reachable scene.
    if (clockLabel === '黃昏' || clockLabel === '入夜' || clockLabel === '深宵') {
        const worry = confideWorry(wants, member.id);
        if (worry) {
            let best: { id: string; near: boolean; bond: number } | null = null;
            for (const other of w.cast) {
                if (other.id === member.id) continue;
                const otherScene = w.roster[other.id];
                if (!otherScene || otherScene === currentSceneId) continue; // co-located ⇒ no pull
                if (!options.some((o) => o.sceneId === otherScene)) continue; // must be reachable
                const bond = bondOf(bonds, member.id, other.id);
                if (bond < BOND.seed.known) continue; // not trusted enough
                if (hasHostileWantToward(wants, member.id, other.id, other.name)) continue; // resented
                const near = world.sameDistrict(currentSceneId, otherScene);
                if (!best || (near && !best.near) || (near === best.near && bond > best.bond)) {
                    best = { id: other.id, near, bond };
                }
            }
            if (best) lines.push(`夜裡若得空，可去尋${world.nameById(best.id)}把這樁心事說道說道。`);
        }
    }

    // 求願・廟 (kept, as OPTION) — at 清晨/黃昏 a STUCK want (求人無門) may be said out
    // loud at a reachable temple. Inert for a world with no temple (templeScenes empty).
    if ((clockLabel === '清晨' || clockLabel === '黃昏') && templeScenes.size && !templeScenes.has(currentSceneId)) {
        const stuck = liveWants.find((wnt) => isStuckWant(wnt, nowTick));
        if (stuck) {
            const reachable = options.filter((o) => templeScenes.has(o.sceneId));
            const pick = reachable.find((o) => world.sameDistrict(currentSceneId, o.sceneId)) ?? reachable[0];
            if (pick) lines.push(`這樁事求人無門，可往${pick.name}許個願。`);
        }
    }

    return lines.length ? lines.join('\n') : undefined;
}
