/**
 * 觀眾注資 — the audience's money channel (pure world mechanism, no LLM, no I/O).
 *
 * The diagnosed failure: the world's money was a ONE-WAY SINK. Fixed costs were
 * mechanism (deducted every day, mechanically), while every income was a
 * NARRATIVE PROMISE (「工錢」「分紅」「月半結帳」 spoken in beats, absent from the
 * ledger). A world whose only real flow is outward bankrupts everyone.
 *
 * This module opens the outside-in half of the loop. An operator fires a channel
 * — 買票 / 買花 / 打賞 — and three things happen, in this order:
 *
 *   1. money ENTERS through `injectExternalFunds` (a real ledger row, so
 *      conservation still holds and an auditor can point at it);
 *   2. a WORLD EVENT is scheduled, so the cast PERCEIVES it — a flower reaching
 *      one actress and not another is drama material, not a silent balance edit;
 *   3. the tally is written to world state (`flowersByChar`), because 誰的花多
 *      誰的花少 is exactly the jealousy fuel the deck later spends.
 *
 * Every step is deterministic and seeded off a persisted counter, so a replayed
 * run reproduces the same gift ids and the same ledger txn ids.
 */

import { formatMoney, injectExternalFunds, yuanToSubunits } from './season-economy.ts';
import { newWant, type Want } from './want-core.ts';
import type { WorldState } from '../world-state.ts';

/** How the outside money reaches the world.
 *  · `ticket`  買票 — the house pays at the door; the takings fund 班庫.
 *  · `flower`  買花 — bought AT THE STALL (殷阿婆's 花攤): the stall takes the cash,
 *                     the flower reaches a named performer. Two people gain
 *                     different things from one coin, which is why this is the
 *                     richest channel.
 *  · `tip`     打賞 — pressed directly into one performer's own hand. */
export type PatronageChannel = 'ticket' | 'flower' | 'tip';

/** One fired gift, kept forever: the audit trail behind a balance change. */
export interface PatronageGift {
    id: string;
    channel: PatronageChannel;
    day: number;
    tick: number;
    /** decimal string of minimum units (JSON-safe, like the rest of the ledger). */
    amountSubunits: string;
    /** the performer a 花/賞 was aimed at; absent for 買票. */
    targetId?: string;
    /** the account that actually TOOK the cash (花攤 for a flower). */
    toAccountId: string;
    /** who the world says gave it — a 看客 has a face, even a generic one. */
    patronName: string;
    /** the objective line the world saw. */
    line: string;
    note?: string;
}

/** 注資帳 — persisted on the world so snapshot/restore/fork carry it. */
export interface PatronageState {
    gifts: PatronageGift[];
    /** characterId → how many separate 花 reached them this season. */
    flowersByChar: Record<string, number>;
    /** characterId → total 打賞 in minimum units (decimal string). */
    tipsByChar: Record<string, string>;
    /** total 票錢 that entered 班庫 through this channel (decimal string). */
    ticketsSubunits: string;
    /** deterministic id counter (gift ids + ledger txn ids derive from it). */
    seq: number;
}

export interface PatronageRequest {
    channel: PatronageChannel;
    /** whole 圓 — an operator authors face value, never minimum units. */
    amountYuan: number;
    /** performer NAME or id for 花/賞 (required for those two channels). */
    target?: string;
    /** who the world names as the giver. Defaults per channel. */
    patronName?: string;
    /** an extra clause folded into the public line (「連翹那籃比誰都高」). */
    note?: string;
    /** override the receiving account (default: per-channel routing below). */
    toAccountId?: string;
}

export interface PatronageOutcome {
    ok: boolean;
    reason?: string;
    gift?: PatronageGift;
    /** the objective line, scheduled as a world event by the caller/this module. */
    line?: string;
    /** 妒火素材: wants this gift genuinely stirred (already spawned into the world). */
    spawnedWants: Want[];
}

/** 花攤 — the catalog's flower vendor is the stall that takes 買花 money. Falls
 *  back to the market account so a world with no flower trade still accepts the
 *  channel rather than refusing it. */
export function flowerStallAccountOf(world: WorldState): string | undefined {
    const data = world.data.economy;
    if (!data) return undefined;
    const flower = data.catalog.find((item) => item.label.includes('花') && item.vendorAccountId);
    return flower?.vendorAccountId ?? data.marketAccountId;
}

const DEFAULT_PATRON: Record<PatronageChannel, string> = {
    ticket: '門口的看客',
    flower: '池座裡一位常來的看客',
    tip: '包廂裡一位闊客',
};

/** 妒火門檻 — a flower tally this far ABOVE a fellow performer's is what the
 *  dressing room actually notices. Below it, a difference is just a difference. */
export const FLOWER_ENVY_GAP = 2;

function patronageState(world: WorldState): PatronageState {
    return (world.data.patronage ??= {
        gifts: [],
        flowersByChar: {},
        tipsByChar: {},
        ticketsSubunits: '0',
        seq: 0,
    });
}

/**
 * Fire one audience-money channel. Deterministic, idempotent at the ledger level
 * (a repeated txnId is swallowed by the economy domain), and always paired with a
 * perceivable world event — an operator cannot move money invisibly.
 *
 * The caller supplies `day`/`tick` so the same call replays identically; nothing
 * here reads a clock of its own.
 */
export function injectPatronage(
    world: WorldState,
    req: PatronageRequest & { day: number; tick: number },
): PatronageOutcome {
    const data = world.data.economy;
    if (!data) return { ok: false, reason: '此卷沒有銀錢物理，注資無處可落', spawnedWants: [] };
    if (!Number.isFinite(req.amountYuan) || req.amountYuan <= 0) {
        return { ok: false, reason: '注資金額須為正數', spawnedWants: [] };
    }

    let targetId: string | undefined;
    if (req.channel === 'flower' || req.channel === 'tip') {
        if (!req.target) return { ok: false, reason: `${req.channel === 'flower' ? '買花' : '打賞'}須指名角色`, spawnedWants: [] };
        targetId = world.castById(req.target) ? req.target : world.idByName(req.target);
        if (!targetId) return { ok: false, reason: `班中無此人：${req.target}`, spawnedWants: [] };
    }

    const toAccountId =
        req.toAccountId ??
        (req.channel === 'ticket'
            ? data.troupeAccountId
            : req.channel === 'flower'
              ? flowerStallAccountOf(world) ?? data.marketAccountId
              : targetId!);

    const state = patronageState(world);
    const seq = ++state.seq;
    const amount = yuanToSubunits(world, req.amountYuan);
    const money = formatMoney(data, amount);
    const patronName = req.patronName?.trim() || DEFAULT_PATRON[req.channel];
    const causeEventId = `${world.data.sagaId}:patronage:${seq}`;

    const deposited = injectExternalFunds(world, {
        txnId: `patronage:${seq}`,
        toAccountId,
        amountSubunits: amount,
        memo:
            req.channel === 'ticket'
                ? '看客買票'
                : req.channel === 'flower'
                  ? `買花贈${world.nameById(targetId!)}`
                  : `打賞${world.nameById(targetId!)}`,
        causeEventId,
    });
    if (!deposited.ok) {
        state.seq -= 1; // the gift never happened; keep the counter replay-stable
        return { ok: false, reason: deposited.reason, spawnedWants: [] };
    }

    // ── the visible event: money that moves in silence teaches nobody anything ──
    const noteClause = req.note?.trim() ? `——${req.note.trim()}` : '';
    let line: string;
    if (req.channel === 'ticket') {
        line = `${patronName}在雲錦台門口買了${money}的票進場，班庫的錢匣今夜添了響聲${noteClause}。`;
        state.ticketsSubunits = (BigInt(state.ticketsSubunits) + amount).toString();
    } else if (req.channel === 'flower') {
        const count = (state.flowersByChar[targetId!] ?? 0) + 1;
        state.flowersByChar[targetId!] = count;
        line =
            `${patronName}在殷阿婆的花攤上花了${money}，挑了一串花，指名送給${world.nameById(targetId!)}` +
            `——這已是她今季收的第 ${count} 串${noteClause ? noteClause.slice(2) : ''}。`;
    } else {
        const prior = BigInt(state.tipsByChar[targetId!] ?? '0');
        state.tipsByChar[targetId!] = (prior + amount).toString();
        line = `${patronName}當眾把${money}塞到${world.nameById(targetId!)}手裡作賞${noteClause}。`;
    }

    const gift: PatronageGift = {
        id: `gift-${seq}`,
        channel: req.channel,
        day: req.day,
        tick: req.tick,
        amountSubunits: amount.toString(),
        ...(targetId ? { targetId } : {}),
        toAccountId,
        patronName,
        line,
        ...(req.note?.trim() ? { note: req.note.trim() } : {}),
    };
    state.gifts.push(gift);

    // The percept lands NEXT tick, the same contract every other objective
    // settlement uses: the cast learns it before they choose anything.
    const venue = data.performance?.venueSceneName;
    const scene =
        (venue ? world.data.scenes.find((s) => s.name === venue) : undefined) ??
        world.data.scenes.find((s) => s.name === data.noticeSceneName) ??
        world.data.scenes[0];
    if (scene) {
        (world.data.scheduledEvents ??= []).push({
            id: `patronage-${seq}`,
            atTick: req.tick + 1,
            sceneId: scene.id,
            text: line,
            visibility: 'public',
            witnessIds: world.data.cast.map((member) => member.id),
        });
    }

    return { ok: true, gift, line, spawnedWants: stirEnvy(world, req.tick, targetId) };
}

/**
 * 妒火 — a flower tally that pulls clear of a fellow performer's by
 * FLOWER_ENVY_GAP stirs exactly ONE jealousy want in the one who fell behind,
 * once per pair per gap crossing (deduped by want desc so a third flower does
 * not mint a third want). Deliberately narrow: the engine supplies the MATERIAL
 * and the pressure, never the plot. Returns the wants it actually spawned.
 */
function stirEnvy(world: WorldState, tick: number, targetId?: string): Want[] {
    if (!targetId) return [];
    const state = world.data.patronage;
    const leadIds = world.data.economy?.performance?.leadIds ?? [];
    if (!state || !leadIds.includes(targetId)) return [];
    const mine = state.flowersByChar[targetId] ?? 0;
    const spawned: Want[] = [];
    for (const rivalId of leadIds) {
        if (rivalId === targetId) continue;
        const theirs = state.flowersByChar[rivalId] ?? 0;
        if (mine - theirs < FLOWER_ENVY_GAP) continue;
        const desc = `${world.nameById(targetId)}的花一串串來，我的籃子空著——這口氣要爭回來`;
        if (world.data.wants.some((w) => w.characterId === rivalId && w.desc === desc)) continue;
        const want = newWant({
            id: world.data.wantSeq !== undefined ? world.nextWantId() : undefined,
            characterId: rivalId,
            layer: '妒',
            desc,
            weight: 0.6,
            sat: 0.15,
            resistance: 4,
            kind: 'narrative',
            source: 'owner',
            bornTick: tick,
            target: targetId,
            semanticTags: ['jealousy'],
        });
        world.data.wants.push(want);
        spawned.push(want);
    }
    return spawned;
}

/** 花帳 — the season's flower tally, richest first. Read-only projection for the
 *  diagnostics and for the deck's targeting (「花最少的那個」). */
export function flowerStandings(world: WorldState): Array<{ characterId: string; name: string; flowers: number }> {
    const table = world.data.patronage?.flowersByChar ?? {};
    return Object.entries(table)
        .map(([characterId, flowers]) => ({ characterId, name: world.nameById(characterId), flowers }))
        .sort((a, b) => b.flowers - a.flowers || a.characterId.localeCompare(b.characterId));
}
