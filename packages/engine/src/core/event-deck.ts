/**
 * 事件牌組 — the external push layer, and the strict division of authority
 * between an LLM director and the engine.
 *
 * Diagnosed failure: the world had no external pressure at all. Everything that
 * happened came from twelve hearts pushing on each other, so the season drifted
 * into an attractor (eight of twelve characters going to buy 糖粥 on the same
 * night tick) and the three loaded guns never fired. Meanwhile 「月半結帳」 was
 * spoken about constantly and never arrived — a deadline that only ever
 * approaches teaches the cast that nothing lands.
 *
 * The deck fixes both by being FINITE and DECLARATIVE. Cards are authored data
 * (JSON/YAML), each carrying its own trigger conditions, its targeting rule, and
 * its DETERMINISTIC consequences. The engine owns resolution end to end.
 *
 * The director's authority is exactly three decisions, and nothing else:
 *   1. WHICH card, from the eligible set the engine computed;
 *   2. WHEN — by declining on a tick where cards are eligible;
 *   3. WHOM — chosen from the candidate ids the engine offered;
 *   plus 穿戲服: rewriting the card's face text in world language.
 *
 * The director may NOT invent a card, invent a target, change a consequence, or
 * touch a number. Everything they decide is written to `world.data.directorLog`,
 * so a run is auditable and replayable: replaying the same log against the same
 * seed produces the same world, with no model in the loop.
 *
 * DEADLINE cards (`mustLand`) are the one place the director has no veto. Once
 * the due day arrives the engine plays the card whether or not a director was
 * consulted; the director may only dress it. That is what 「deadline 語意」 means
 * here — arrival is not a choice, and arrival costs something.
 */

import { PARTS_OF_DAY } from '../ports.ts';
import { announceReckoning, payDividend, payWagePacket, plantWant, runReckoning, type DebtStance, type IncomeOutcome, type ReckoningOutcome } from './income-events.ts';
import { injectPatronage, type PatronageChannel } from './patronage.ts';
import { admitNewcomer, dismissFromCast, type NewcomerSeed } from './roster-change.ts';
import { evaluateSecretLeaks, publishSecret } from './secret-ledger.ts';
import { accountFace, formatMoney, yuanToSubunits } from './season-economy.ts';
import { tension, type Want, type WantSemanticTag } from './want-core.ts';
import type { WorldState } from '../world-state.ts';

// ── 1. card schema (authored data; see README 事件卡 schema) ──────────────────

/** Sentinel an authored card may use where an account id is expected, meaning
 *  「這張卡對準的那個人」. Resolved at play time against the validated targets. */
export const TARGET_SENTINEL = '@target';

/** 觸發條件 — finite and state-only, so eligibility is computable without a model. */
export type CardCondition =
    /** 班庫撐不了幾日了 */
    | { kind: 'account-runway-below'; accountId?: string; days: number }
    /** 帳上現銀低於 N 圓 */
    | { kind: 'account-below-yuan'; accountId?: string; yuan: number }
    /** 街上還欠著至少 N 圓 */
    | { kind: 'outstanding-debt-atleast-yuan'; yuan: number }
    /** 有人的心事燒到這個程度 */
    | { kind: 'tension-peak-atleast'; value: number }
    /** 活著的心事多過 N 件（願榜塞住了） */
    | { kind: 'live-wants-atleast'; count: number }
    /** 班中還有 N 人以上（離班卡不該把班演成獨角戲） */
    | { kind: 'cast-atleast'; count: number }
    /** 某樁秘密已漏／未漏 */
    | { kind: 'secret-leaked'; secretId: string; leaked: boolean }
    /** 新戲上沒上台 —— the 排戲季's own pass/fail fact. */
    | { kind: 'production-premiered'; premiered: boolean };

/** 確定性後果 — every consequence the engine knows how to settle. A card may
 *  only compose these; it can never carry free-form instructions. */
export type CardEffect =
    /** 世界事實 — a percept the cast perceives next tick. `costume` replaces `text`. */
    | { kind: 'percept'; text: string; visibility?: 'public' | 'private'; sceneName?: string; toTargetsOnly?: boolean }
    /** 工錢發放 */
    | { kind: 'wage-packet'; label: string; perHeadYuan: number; fromAccountId?: string; toTargets?: boolean }
    /** 分紅 */
    | { kind: 'dividend'; label: string; surplusShareBps: number; reserveDays: number; fromAccountId?: string }
    /** 月半結帳 — the CALLING of every outstanding obligation. Moves no money;
     *  settles the social consequence of what each debtor chose to do. */
    | { kind: 'reckoning'; label: string }
    /** 預告 — the broadcast days before the reckoning: everyone learns when it
     *  falls and who is on the 摺子, and every debtor gets a dated 心事 that
     *  RESOLVES if they settle it themselves. Without this window, refusing to
     *  pay would be indistinguishable from never having had the chance. */
    | { kind: 'reckoning-notice'; label: string; dueInDays: number }
    /** 觀眾注資（堂會邀約、包場） */
    | { kind: 'patronage'; channel: PatronageChannel; amountYuan: number; patronName?: string; toTargets?: boolean }
    /** 新開一筆按期債（巡捕的罰款、報館的訂金…）。`fromAccountId`/`toAccountId` accept
     *  the sentinel `'@target'`, resolved to the card's FIRST target at play time —
     *  that is how a fine follows the person the director aimed the card at without
     *  the card having to know who that will be. */
    | { kind: 'bill'; id: string; label: string; amountYuan: number; dueInDays: number; fromAccountId?: string; toAccountId?: string; creditor?: string }
    /** 種一樁帶死線的心事在對象身上 */
    | { kind: 'want'; layer: string; desc: string; weight?: number; resistance?: number; dueInDays?: number; semanticTags?: WantSemanticTag[] }
    /** 名頭／自視 */
    | { kind: 'renown'; delta: number }
    | { kind: 'self-regard'; delta: number }
    /** 天時 — a named weather/condition fact that shifts the night's house. */
    | { kind: 'weather'; label: string; housePct: number }
    /** 物件狀態 */
    | { kind: 'object-state'; objectId: string; state: string }
    /** 洩漏／見報 */
    | { kind: 'leak-secret'; secretId: string }
    | { kind: 'publish-secret'; secretId: string }
    /** 角色離班 —— 孤兒資產強制重分配 */
    | { kind: 'cast-exit'; reason: string }
    /** 名角過班／故人進城 —— 從牌組宣告的 newcomers 池取人 */
    | { kind: 'cast-enter'; newcomerId: string };

/**
 * 分支後果 — an effect that only applies when a condition holds.
 *
 * This is how a card can be BOTH a real deadline and a branch. 「首演之夜」 must
 * land on its day whatever happens (that is the whole point of a deadline), but
 * what it settles depends on whether the play actually went up. Gating the CARD
 * on a condition would make the deadline vetoable — the exact failure that let
 * 月半結帳 recede forever — so the branch lives one level down, on the effects.
 *
 * An author is responsible for making a card's branches exhaustive; the engine
 * simply skips effects whose condition does not hold.
 */
export type ConditionalEffect = CardEffect & { onlyIf?: CardCondition };

export type CardTargeting =
    /** 全班 */
    | { mode: 'all' }
    /** 班中人（領銜或吃班庫俸的） */
    | { mode: 'troupe' }
    /** 卡面點名 */
    | { mode: 'named'; names: string[] }
    /** 導演在引擎給的候選裡挑 —— 這是導演唯一的「對準誰」權柄 */
    | { mode: 'director-pick'; pickCount: number; from?: 'all' | 'troupe' | 'hottest' | 'poorest' | 'press' }
    /** 無對象（天時、報館截稿之類） */
    | { mode: 'none' };

export interface EventCard {
    id: string;
    /** 卡面 — the card's own words. The director may re-dress this, never re-aim it. */
    label: string;
    /** 一句話說明這張卡在做什麼（導演的選牌依據）。 */
    note?: string;
    /** `seasonal` cards are the big ones (人物進出): rate-limited hard. */
    tier?: 'routine' | 'seasonal';
    trigger: {
        minDay?: number;
        maxDay?: number;
        /** 指定日 */
        onDays?: number[];
        /** 週期（配 anchorDay 起算） */
        everyDays?: number;
        anchorDay?: number;
        /** 限定時辰（PARTS_OF_DAY 索引）；不給＝任何時辰 */
        atParts?: number[];
        /** 一卷至多打幾次 */
        maxPlays?: number;
        /** 打過之後幾日內不再打 */
        cooldownDays?: number;
        requires?: CardCondition[];
    };
    targeting: CardTargeting;
    effects: ConditionalEffect[];
    /** 死線語意 — 到日必打，導演無權不打；只能穿戲服。 */
    mustLand?: boolean;
    /** 到日之依據：`onDays`/`everyDays` 算出的那一日即死線。 */
    deadlineNote?: string;
}

export interface EventDeck {
    id: string;
    title?: string;
    cards: EventCard[];
    /** 進場人選池 — `cast-enter` 只能從這裡取人，導演不能捏造新角色。 */
    newcomers?: Array<{ id: string; seed: NewcomerSeed }>;
    /** 秘密種子 — seeded into the ledger when the deck is attached. */
    secrets?: Array<{
        id: string;
        matter: string;
        holderNames: string[];
        aboutName?: string;
        coveterNames?: string[];
        leakWhen?: import('./secret-ledger.ts').SecretLeakCondition[];
    }>;
    /** 一日至多打幾張（含死線卡）。預設 2 —— 外力是推手，不是主角。 */
    maxCardsPerDay?: number;
    /** 一卷至多打幾張季級大牌。預設 2。 */
    maxSeasonalPlays?: number;
}

// ── 2. persisted play history ────────────────────────────────────────────────

/** One director decision, forever. Replay this log and the world reproduces. */
export interface DirectorLogEntry {
    day: number;
    tick: number;
    clock: string;
    cardId: string;
    /** 'director' = an agent chose it; 'deadline' = the engine forced it;
     *  'operator' = a human/CLI played it. */
    chosenBy: 'director' | 'deadline' | 'operator';
    targetIds: string[];
    /** the director's re-dressed card face, when they supplied one. */
    costume?: string;
    /** the director's own one-line reason (audit only — never a mechanism). */
    rationale?: string;
    /** what the engine actually settled. */
    outcomeLines: string[];
    /** how many irreversible facts this play produced. */
    irreversible: number;
    /** the eligible set the director was shown — proves they didn't invent a card. */
    offeredCardIds: string[];
}

/** 天時 — the deck's current weather fact, persisted so the box office can read it. */
export interface WeatherState {
    label: string;
    housePct: number;
    sinceDay: number;
}

// ── 3. eligibility (pure) ───────────────────────────────────────────────────

function playsOf(world: WorldState, cardId: string): DirectorLogEntry[] {
    return (world.data.directorLog ?? []).filter((entry) => entry.cardId === cardId);
}

function conditionHolds(world: WorldState, condition: CardCondition): boolean {
    const data = world.data.economy;
    switch (condition.kind) {
        case 'account-runway-below': {
            const face = accountFace(world, condition.accountId ?? data?.troupeAccountId ?? '');
            if (!face) return false;
            return face.runwayDays !== null && face.runwayDays < BigInt(Math.floor(condition.days));
        }
        case 'account-below-yuan': {
            const face = accountFace(world, condition.accountId ?? data?.troupeAccountId ?? '');
            if (!face || !data) return false;
            return face.available < yuanToSubunits(world, condition.yuan);
        }
        case 'outstanding-debt-atleast-yuan': {
            if (!data) return false;
            let owing = 0n;
            for (const bill of data.bills ?? []) owing += BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
            return owing >= yuanToSubunits(world, condition.yuan);
        }
        case 'tension-peak-atleast': {
            let peak = 0;
            for (const want of world.data.wants) {
                if (want.retired) continue;
                const t = tension(want);
                if (t > peak) peak = t;
            }
            return peak >= condition.value;
        }
        case 'live-wants-atleast':
            return world.data.wants.filter((want) => !want.retired).length >= condition.count;
        case 'cast-atleast':
            return onBoardIds(world).length >= condition.count;
        case 'secret-leaked': {
            const secret = world.data.secretLedger?.find((row) => row.id === condition.secretId);
            if (!secret) return false;
            return (secret.leakedDay !== undefined) === condition.leaked;
        }
        case 'production-premiered':
            return (world.data.production?.premieredDay !== undefined) === condition.premiered;
    }
}

/** Characters still on the board (a departed member is never a card's target). */
export function onBoardIds(world: WorldState): string[] {
    const departed = new Set(world.data.departedIds ?? []);
    return world.data.cast.filter((member) => !departed.has(member.id)).map((member) => member.id);
}

/** Is this card's clock ripe, ignoring its conditions? Split out because a
 *  deadline card's DUE DAY is a clock fact — conditions may gate a routine card,
 *  never a deadline. */
function clockRipe(card: EventCard, day: number, partIndex: number): boolean {
    const t = card.trigger;
    if (t.minDay !== undefined && day < t.minDay) return false;
    if (t.maxDay !== undefined && day > t.maxDay) return false;
    if (t.atParts?.length && !t.atParts.includes(partIndex)) return false;
    if (t.onDays?.length) return t.onDays.includes(day);
    if (t.everyDays !== undefined && t.everyDays > 0) {
        const anchor = t.anchorDay ?? 1;
        return day >= anchor && (day - anchor) % t.everyDays === 0;
    }
    return true; // no clock constraint ⇒ any day within the window
}

export interface CardEligibility {
    card: EventCard;
    /** the ids the card may be aimed at — the director picks WITHIN this. */
    candidateIds: string[];
    /** deadline cards the director cannot decline. */
    forced: boolean;
}

/**
 * The eligible set for this exact tick. PURE — no model, no I/O — so the director
 * seat can be replaced by an operator, a script, or nothing at all, and the world
 * still knows what could happen.
 */
export function eligibleCards(
    world: WorldState,
    deck: EventDeck,
    req: { day: number; partIndex: number },
): CardEligibility[] {
    const playedToday = (world.data.directorLog ?? []).filter((entry) => entry.day === req.day).length;
    const dayCap = deck.maxCardsPerDay ?? 2;
    const seasonalPlays = (world.data.directorLog ?? []).filter((entry) =>
        deck.cards.find((card) => card.id === entry.cardId)?.tier === 'seasonal',
    ).length;
    const seasonalCap = deck.maxSeasonalPlays ?? 2;

    const out: CardEligibility[] = [];
    for (const card of deck.cards) {
        const prior = playsOf(world, card.id);
        if (card.trigger.maxPlays !== undefined && prior.length >= card.trigger.maxPlays) continue;
        if (card.trigger.cooldownDays !== undefined && prior.length) {
            const lastDay = Math.max(...prior.map((entry) => entry.day));
            if (req.day - lastDay < card.trigger.cooldownDays) continue;
        }
        if (!clockRipe(card, req.day, req.partIndex)) continue;
        const forced = card.mustLand === true;
        // Conditions gate routine cards only. A deadline that a condition could
        // veto is not a deadline — that is exactly how 月半結帳 stayed imaginary.
        if (!forced && (card.trigger.requires ?? []).some((condition) => !conditionHolds(world, condition))) continue;
        if (!forced && playedToday >= dayCap) continue;
        if (card.tier === 'seasonal' && seasonalPlays >= seasonalCap) continue;
        out.push({ card, candidateIds: candidatesFor(world, card), forced });
    }
    // Deadlines first, then stable by card id — the offered order is deterministic.
    return out.sort((a, b) => Number(b.forced) - Number(a.forced) || a.card.id.localeCompare(b.card.id));
}

/** Who this card MAY be aimed at. A director choosing outside this set is
 *  rejected — targeting authority is bounded by the card, not by the model. */
export function candidatesFor(world: WorldState, card: EventCard): string[] {
    const onBoard = onBoardIds(world);
    const targeting = card.targeting;
    switch (targeting.mode) {
        case 'none':
            return [];
        case 'all':
            return onBoard;
        case 'troupe': {
            const data = world.data.economy;
            if (!data) return onBoard;
            const ids = new Set<string>(data.performance?.leadIds ?? []);
            for (const wage of data.wages) {
                if ((wage.fromAccountId ?? data.troupeAccountId) === data.troupeAccountId) ids.add(wage.accountId);
            }
            return onBoard.filter((id) => ids.has(id));
        }
        case 'named':
            return targeting.names
                .map((name) => (world.castById(name) ? name : world.idByName(name)))
                .filter((id): id is string => !!id && onBoard.includes(id));
        case 'director-pick': {
            const from = targeting.from ?? 'all';
            if (from === 'hottest') {
                return [...onBoard].sort((a, b) => peakTension(world, b) - peakTension(world, a) || a.localeCompare(b));
            }
            if (from === 'poorest') {
                return [...onBoard].sort((a, b) => {
                    const pa = accountFace(world, a)?.available ?? 0n;
                    const pb = accountFace(world, b)?.available ?? 0n;
                    return pa < pb ? -1 : pa > pb ? 1 : a.localeCompare(b);
                });
            }
            if (from === 'press') {
                return onBoard.filter((id) => {
                    const role = world.castById(id)?.role;
                    return !!role && ['記者', '主筆', '編輯', '報館'].some((needle) => role.includes(needle));
                });
            }
            if (from === 'troupe') return candidatesFor(world, { ...card, targeting: { mode: 'troupe' } });
            return onBoard;
        }
    }
}

function peakTension(world: WorldState, characterId: string): number {
    let peak = 0;
    for (const want of world.data.wants) {
        if (want.retired || want.characterId !== characterId) continue;
        const t = tension(want);
        if (t > peak) peak = t;
    }
    return peak;
}

// ── 4. resolution (deterministic; the engine's exclusive authority) ──────────

export interface PlayCardRequest {
    card: EventCard;
    /** who it lands on. Validated against `candidatesFor` — an invalid id is dropped. */
    targetIds?: string[];
    /** the director's re-dressed card face (replaces a `percept` effect's text). */
    costume?: string;
    rationale?: string;
    chosenBy: DirectorLogEntry['chosenBy'];
    day: number;
    nowTick: number;
    clock: string;
    /** billId → the creditor's stance, computed asynchronously by the caller from
     *  `reckoningSeats` before this pure settle runs. Absent entries fall back
     *  deterministically, so a rehearsal reckoning is still complete. */
    debtStances?: Record<string, DebtStance>;
}

export interface PlayCardResult {
    played: boolean;
    reason?: string;
    /** objective lines for the day log. */
    publicLines: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    /** percepts to schedule (the caller owns `scheduledEvents`). */
    percepts: Array<{ id: string; sceneId: string; text: string; visibility: 'public' | 'private'; witnessIds: string[] }>;
    spawnedWants: Want[];
    /** how many irreversible facts landed — the vitals' 不可逆事件數 for this play. */
    irreversible: number;
    income?: IncomeOutcome;
    reckoning?: ReckoningOutcome;
    logEntry?: DirectorLogEntry;
}

/**
 * Settle one card. Every branch is deterministic: the same card + targets + world
 * produce the same facts, so a run replays from the director log with no model.
 * Effects apply in authored order, and each one that changes the world
 * irreversibly increments `irreversible`.
 */
export function playCard(world: WorldState, deck: EventDeck, req: PlayCardRequest): PlayCardResult {
    const result: PlayCardResult = {
        played: false,
        publicLines: [],
        privateNotices: [],
        percepts: [],
        spawnedWants: [],
        irreversible: 0,
    };
    const allowed = new Set(candidatesFor(world, req.card));
    const targetIds = (req.targetIds ?? [])
        .map((id) => (world.castById(id) ? id : world.idByName(id) ?? id))
        .filter((id) => allowed.has(id));
    // A card that NEEDS a target and got none falls back to the card's own
    // candidate list, capped by its pickCount — never to "everybody".
    const effectiveTargets =
        targetIds.length || req.card.targeting.mode === 'none'
            ? targetIds
            : req.card.targeting.mode === 'director-pick'
              ? [...allowed].slice(0, Math.max(1, req.card.targeting.pickCount))
              : [...allowed];

    const data = world.data.economy;
    const noticeScene =
        world.data.scenes.find((scene) => scene.name === data?.noticeSceneName) ?? world.data.scenes[0];
    const witnessAll = onBoardIds(world);
    let perceptSeq = 0;

    for (const effect of req.card.effects) {
        // 分支後果 — the card still landed; this particular consequence did not apply.
        if (effect.onlyIf && !conditionHolds(world, effect.onlyIf)) continue;
        switch (effect.kind) {
            case 'percept': {
                const scene =
                    (effect.sceneName ? world.data.scenes.find((s) => s.name === effect.sceneName) : undefined) ?? noticeScene;
                if (!scene) break;
                const text = req.costume?.trim() || effect.text;
                const witnessIds = effect.toTargetsOnly && effectiveTargets.length ? effectiveTargets : witnessAll;
                result.percepts.push({
                    id: `card-${req.card.id}-t${req.nowTick}-${perceptSeq++}`,
                    sceneId: scene.id,
                    text,
                    visibility: effect.visibility ?? 'public',
                    witnessIds,
                });
                result.publicLines.push(text);
                break;
            }
            case 'wage-packet': {
                const income = payWagePacket(world, {
                    day: req.day,
                    nowTick: req.nowTick,
                    id: `${req.card.id}:wage`,
                    label: effect.label,
                    ...(effect.fromAccountId ? { fromAccountId: effect.fromAccountId } : {}),
                    perHeadYuan: effect.perHeadYuan,
                    ...(effect.toTargets && effectiveTargets.length ? { targetIds: effectiveTargets } : {}),
                });
                result.income = income;
                result.publicLines.push(...income.publicLines);
                result.privateNotices.push(...income.privateNotices);
                if (income.landed) result.irreversible += 1;
                break;
            }
            case 'dividend': {
                const income = payDividend(world, {
                    day: req.day,
                    nowTick: req.nowTick,
                    rule: {
                        id: `${req.card.id}:dividend`,
                        label: effect.label,
                        ...(effect.fromAccountId ? { fromAccountId: effect.fromAccountId } : {}),
                        surplusShareBps: effect.surplusShareBps,
                        reserveDays: effect.reserveDays,
                        ...(effectiveTargets.length
                            ? { shares: effectiveTargets.map((characterId) => ({ characterId, weightBps: 1 })) }
                            : {}),
                    },
                });
                result.income = income;
                result.publicLines.push(...income.publicLines);
                result.privateNotices.push(...income.privateNotices);
                if (income.landed) result.irreversible += 1;
                break;
            }
            case 'reckoning-notice': {
                const announced = announceReckoning(world, {
                    day: req.day,
                    nowTick: req.nowTick,
                    dueDay: req.day + Math.max(1, Math.floor(effect.dueInDays)),
                    label: req.costume?.trim() || effect.label,
                });
                if (announced.publicLine) {
                    result.percepts.push({
                        id: `card-${req.card.id}-notice-t${req.nowTick}`,
                        sceneId: (noticeScene ?? world.data.scenes[0]).id,
                        text: announced.publicLine,
                        visibility: 'public',
                        witnessIds: witnessAll,
                    });
                    result.publicLines.push(announced.publicLine);
                }
                result.privateNotices.push(...announced.privateNotices);
                result.spawnedWants.push(...announced.spawnedWants);
                break;
            }
            case 'reckoning': {
                const reckoning = runReckoning(world, {
                    day: req.day,
                    nowTick: req.nowTick,
                    label: req.costume?.trim() || effect.label,
                    ...(req.debtStances ? { stances: req.debtStances } : {}),
                });
                result.reckoning = reckoning;
                result.publicLines.push(...reckoning.publicLines);
                result.privateNotices.push(...reckoning.privateNotices);
                result.spawnedWants.push(...reckoning.spawnedWants);
                result.irreversible += reckoning.facts.length;
                break;
            }
            case 'patronage': {
                const targets = effect.toTargets && effectiveTargets.length ? effectiveTargets : [undefined];
                for (const target of targets) {
                    const gift = injectPatronage(world, {
                        channel: effect.channel,
                        amountYuan: effect.amountYuan,
                        ...(target ? { target } : {}),
                        ...(effect.patronName ? { patronName: effect.patronName } : {}),
                        day: req.day,
                        tick: req.nowTick,
                    });
                    if (gift.ok && gift.line) {
                        result.publicLines.push(gift.line);
                        result.irreversible += 1;
                        result.spawnedWants.push(...gift.spawnedWants);
                    } else if (!gift.ok) {
                        result.publicLines.push(`（注資未成：${gift.reason}）`);
                    }
                }
                break;
            }
            case 'bill': {
                if (!data) break;
                const bills = (data.bills ??= []);
                // A per-target fine needs a per-target id, or the second person the
                // card touches would silently inherit the first one's bill.
                const resolveAccount = (raw?: string): string | undefined =>
                    raw === TARGET_SENTINEL ? effectiveTargets[0] : raw;
                const payerId = resolveAccount(effect.fromAccountId);
                if (effect.fromAccountId === TARGET_SENTINEL && !payerId) break; // aimed at nobody
                const billId = effect.fromAccountId === TARGET_SENTINEL ? `${effect.id}:${payerId}` : effect.id;
                if (bills.some((bill) => bill.id === billId)) break; // 同一張罰單不開兩次
                bills.push({
                    id: billId,
                    label: effect.label,
                    amountSubunits: yuanToSubunits(world, effect.amountYuan).toString(),
                    dueDay: req.day + Math.max(0, Math.floor(effect.dueInDays)),
                    paidSubunits: '0',
                    ...(effect.creditor ? { creditor: effect.creditor } : {}),
                    ...(payerId ? { fromAccountId: payerId } : {}),
                    ...(resolveAccount(effect.toAccountId) ? { toAccountId: resolveAccount(effect.toAccountId)! } : {}),
                });
                const who = payerId && world.castById(payerId) ? `${world.nameById(payerId)}的` : '';
                result.publicLines.push(
                    `${who}${effect.label}：${formatMoney(data, yuanToSubunits(world, effect.amountYuan))}，第 ${req.day + effect.dueInDays} 日之前要有個交代。`,
                );
                result.irreversible += 1;
                break;
            }
            case 'want': {
                for (const characterId of effectiveTargets) {
                    result.spawnedWants.push(
                        ...plantWant(world, {
                            characterId,
                            layer: effect.layer,
                            desc: effect.desc,
                            weight: effect.weight ?? 0.6,
                            resistance: effect.resistance ?? 4,
                            tick: req.nowTick,
                            ...(effect.dueInDays !== undefined ? { dueDay: req.day + effect.dueInDays } : {}),
                            ...(effect.semanticTags?.length ? { semanticTags: effect.semanticTags } : {}),
                        }),
                    );
                }
                break;
            }
            case 'renown':
                for (const characterId of effectiveTargets) world.bumpRenown(characterId, effect.delta);
                break;
            case 'self-regard':
                for (const characterId of effectiveTargets) world.bumpSelfRegard(characterId, effect.delta);
                break;
            case 'weather': {
                world.data.weather = { label: effect.label, housePct: effect.housePct, sinceDay: req.day };
                result.publicLines.push(`天時轉了：${effect.label}。`);
                break;
            }
            case 'object-state': {
                const object = world.objectById(effect.objectId);
                if (!object) break;
                object.state = effect.state;
                result.irreversible += 1;
                break;
            }
            case 'leak-secret': {
                const secret = world.data.secretLedger?.find((row) => row.id === effect.secretId);
                if (!secret || secret.leakedDay !== undefined) break;
                // Force the fuse by giving the card's own day as a met condition,
                // then run the normal evaluator — one leak path, never two.
                secret.leakWhen = [...secret.leakWhen, { kind: 'day-atleast', day: req.day }];
                const leaks = evaluateSecretLeaks(world, { day: req.day, nowTick: req.nowTick });
                for (const leak of leaks.leaked) result.publicLines.push(leak.line);
                result.privateNotices.push(...leaks.notices);
                result.spawnedWants.push(...leaks.pressDilemmas);
                result.irreversible += leaks.leaked.length;
                break;
            }
            case 'publish-secret': {
                const published = publishSecret(world, {
                    secretId: effect.secretId,
                    byId: effectiveTargets[0],
                    day: req.day,
                    nowTick: req.nowTick,
                });
                if (published.ok && published.line) {
                    result.publicLines.push(published.line);
                    result.privateNotices.push(...published.notices);
                    result.irreversible += 1;
                }
                break;
            }
            case 'cast-exit': {
                for (const characterId of effectiveTargets) {
                    const departure = dismissFromCast(world, {
                        characterId,
                        reason: req.costume?.trim() || effect.reason,
                        day: req.day,
                        nowTick: req.nowTick,
                    });
                    if (!departure.ok) {
                        result.publicLines.push(`（離班未成：${departure.reason}）`);
                        continue;
                    }
                    result.publicLines.push(...departure.publicLines);
                    result.privateNotices.push(...departure.privateNotices);
                    result.spawnedWants.push(...departure.spawnedWants);
                    result.irreversible += departure.settlements.length;
                }
                break;
            }
            case 'cast-enter': {
                const entry = deck.newcomers?.find((row) => row.id === effect.newcomerId);
                if (!entry) {
                    result.publicLines.push(`（進場未成：牌組沒有這個人選 ${effect.newcomerId}）`);
                    break;
                }
                const arrival = admitNewcomer(world, { seed: entry.seed, day: req.day, nowTick: req.nowTick });
                if (!arrival.ok) {
                    result.publicLines.push(`（進場未成：${arrival.reason}）`);
                    break;
                }
                result.publicLines.push(...arrival.publicLines);
                result.privateNotices.push(...arrival.privateNotices);
                result.irreversible += 1;
                break;
            }
        }
    }

    // Every play is logged, including who chose it and what they were offered.
    const logEntry: DirectorLogEntry = {
        day: req.day,
        tick: req.nowTick,
        clock: req.clock,
        cardId: req.card.id,
        chosenBy: req.chosenBy,
        targetIds: effectiveTargets,
        ...(req.costume?.trim() ? { costume: req.costume.trim() } : {}),
        ...(req.rationale?.trim() ? { rationale: req.rationale.trim() } : {}),
        outcomeLines: result.publicLines,
        irreversible: result.irreversible,
        offeredCardIds: [],
    };
    (world.data.directorLog ??= []).push(logEntry);
    result.logEntry = logEntry;
    result.played = true;
    return result;
}

/** 天時折座 — the deck's weather as a box-office multiplier the settle can read.
 *  100 ⇒ no effect. Kept here so the deck owns its own consequence. */
export function weatherHousePct(world: WorldState): number {
    return world.data.weather?.housePct ?? 100;
}

/** Human-readable list of a tick's eligible cards, for the director prompt and
 *  the diagnostics. Never includes a number the director could act on. */
export function describeEligible(world: WorldState, eligible: ReadonlyArray<CardEligibility>): string[] {
    return eligible.map((row) => {
        const who = row.candidateIds.length
            ? row.candidateIds.slice(0, 8).map((id) => world.nameById(id)).join('、')
            : '（無對象）';
        return `${row.card.id}｜${row.card.label}${row.forced ? '【到日必打】' : ''}｜可對準：${who}${row.card.note ? `｜${row.card.note}` : ''}`;
    });
}

/** The part-of-day index for a clock label — deck triggers are authored as
 *  indices so a renamed label can never silently change a card's timing. */
export function partIndexOf(clockLabel: string): number {
    const index = (PARTS_OF_DAY as readonly string[]).indexOf(clockLabel);
    return index >= 0 ? index : 0;
}
