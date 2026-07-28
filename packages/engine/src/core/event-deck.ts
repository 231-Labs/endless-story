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
import { chillBond } from './bond-graph.ts';
import { HEARSAY_MARK } from './standing.ts';
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
/** The mirror sentinel, meaningful only for a 世情動作: 「做這件事的那個人」.
 *  A card has no actor, so it resolves to nothing there. */
export const ACTOR_SENTINEL = '@actor';

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
    /** 名頭／自視。`on` 預設 'targets'；'actor' 只在世情動作裡有意義。 */
    | { kind: 'renown'; delta: number; on?: 'targets' | 'actor' | 'both' }
    | { kind: 'self-regard'; delta: number; on?: 'targets' | 'actor' | 'both' }
    /**
     * 人心轉向 — the one effect that writes RELATIONSHIPS, and the reason a
     * 世情動作 costs anything at all.
     *
     * There is no reputation ledger in this engine (see `core/standing.ts`): what
     * the street thinks of somebody lives in the tonal `edges` graph, the numeric
     * `bonds` graph, and 名頭. So an act whose consequence is social writes exactly
     * there, through the same two calls a reckoning uses — no new machine.
     *
     * `hearsay: true` marks the edge as second-hand, which is what makes it FADE
     * for people who keep having to share a room with the person (`fadeHearsay`).
     * First-hand grievances — the person actually wronged — do not fade on their
     * own; something has to happen. That asymmetry is the whole difference between
     * 「街上傳了幾天」 and 「他從此不理你了」.
     */
    | {
          kind: 'standing';
          /** the tone written onto the edge — the words the holder would use. */
          tone: string;
          disposition?: 'warm' | 'cold' | 'neutral';
          /** whose opinion moves. 'witnesses' = everybody else on the board. */
          from: 'targets' | 'witnesses' | 'actor';
          /** whose standing it moves about. */
          toward: 'actor' | 'targets';
          /** how hard the numeric bond is cut, if at all. */
          grievance?: 'slighted' | 'dunned' | 'shamed' | 'betrayed';
          /** second-hand ⇒ softens with contact. Forced on for 'witnesses' unless
           *  the author explicitly says otherwise. */
          hearsay?: boolean;
      }
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

/**
 * 世情動作 — an event a CHARACTER makes happen, not the director.
 *
 * The deck as first built had one hole with a shape: everything that pushed on
 * the world came from outside it. A character could want, move, speak, spend and
 * borrow, but the class of thing that actually turns a life over — 報官, 退婚,
 * 當眾揭穿, 罷演 — belonged to nobody. The director could not do it (those are
 * not a director's decisions, they are a person's), and the cast had no channel
 * for it, so it simply never happened.
 *
 * An act closes that hole without reopening the one the deck exists to close.
 * It is a CARD in every respect that matters — authored data, declared gates,
 * deterministic effects drawn from the same finite set — and the only difference
 * is who is allowed to play it. The engine computes which acts are available to
 * whom (`availableActsFor`), the beat prompt 亮牌s exactly those, and the
 * character names one. They choose WHETHER and AT WHOM; they never choose what
 * it costs.
 *
 * Doing it this way means a character's most drastic choices are as auditable
 * and as replayable as the director's: every invocation lands in the same
 * `directorLog`, marked `chosenBy: 'character'` with the actor's id.
 */
export interface CharacterAct {
    id: string;
    /** 卡面 — the act in world words: 「報官」. Shown to the character verbatim. */
    label: string;
    /** one line on what doing this actually means — the character's 選牌依據. */
    note?: string;
    /** who may reach for it. Absent ⇒ anybody on the board. */
    invokableBy?: {
        /** substring match against 行當／role. */
        roles?: string[];
        names?: string[];
    };
    /** 本季第幾日起才做得出來。Some things nobody does to a person they met
     *  yesterday; without this the stub expelled a man from the troupe on day 1. */
    minDay?: number;
    /** state gates, the same primitives a card's trigger uses. */
    requires?: CardCondition[];
    /** 對誰做 — the act must name a co-present cast member. Acts without this are
     *  aimed at nobody in particular (罷演 is done, not done TO someone). */
    needsTarget?: boolean;
    /** the target must be someone the actor is in the room with. Default true —
     *  這些事多半是當面做的。 */
    targetMustBeCoPresent?: boolean;
    /** 一卷至多幾次（全班合計） */
    maxPlays?: number;
    /** 同一個人一卷至多幾次 */
    maxPlaysPerCharacter?: number;
    /** 做過之後幾日內，同一個人不再做 */
    cooldownDays?: number;
    effects: ConditionalEffect[];
}

export interface EventDeck {
    id: string;
    title?: string;
    cards: EventCard[];
    /** 世情動作池 — what the cast itself may set in motion. */
    acts?: CharacterAct[];
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
    /**
     * 一日至多幾件世情動作。預設 2。
     *
     * A pacing bound, not a permission: any ONE person can still do the drastic
     * thing on any day they qualify for it, but a street cannot absorb five
     * public ruptures between breakfast and the evening show without every one of
     * them ceasing to mean anything. Same reasoning as `maxCardsPerDay`, applied
     * to the channel the cast owns.
     */
    maxActsPerDay?: number;
    /** 一卷至多打幾張季級大牌。預設 2。 */
    maxSeasonalPlays?: number;
}

// ── 1.5. 導演提案新卡 (a card the deck never contained) ───────────────────────
//
// The deck's ceiling is that nothing can happen that its author did not write.
// This is the one door through it — and it has to be a narrow one, because a
// director who can mint arbitrary consequences has silently regained write
// access to world state, which is the exact thing the deck exists to prevent.
//
// So a proposal is not "the model describes an event". It is: assemble a card
// from the SAME finite effect primitives every authored card uses, within
// magnitude caps the engine enforces, aimed at real people, rate-limited to a
// handful per season. Everything a proposal can do, an authored card could
// already have done — the only new thing is that nobody had to think of it in
// advance.
//
// Whole categories stay closed, on purpose:
//   · `cast-enter` / `cast-exit` — inventing or removing a person is the biggest
//     card in the deck; it goes through the authored `newcomers` pool.
//   · `wage-packet` / `dividend` / `patronage` — payroll and outside money are
//     scheduled or operator-fired. A director who could mint income could
//     dissolve every scarcity the season is built on.
//   · `reckoning` / `reckoning-notice` — a ritual with a calendar, not a whim.
//   · `publish-secret` — 見報 belongs to the character who holds the story.

/** Effect kinds a PROPOSAL may use. Everything else is authored-only. */
export const PROPOSABLE_EFFECTS = [
    'percept',
    'want',
    'renown',
    'self-regard',
    'object-state',
    'weather',
    'bill',
    'leak-secret',
] as const;

/** Magnitude ceilings. A proposal is a nudge with teeth, never a hammer — an
 *  authored card may hit harder because a human weighed it. */
export const PROPOSAL_LIMITS = {
    maxEffects: 4,
    perceptChars: 200,
    renownDelta: 0.08,
    selfRegardDelta: 0.08,
    billYuan: 5,
    billDueDays: 7,
    wantWeight: 0.8,
    wantDueDays: 7,
    weatherHousePct: { min: 60, max: 120 },
    /** per season, and per day. */
    seasonCap: 3,
    perDay: 1,
} as const;

/** Is the self-authored-card quota still open today? A cheap pre-check so the
 *  tick only pays for a proposal seat when one could actually be accepted. */
export function canPropose(world: WorldState, day: number): boolean {
    const proposed = (world.data.directorLog ?? []).filter((entry) => entry.chosenBy === 'director-proposed');
    return (
        proposed.length < PROPOSAL_LIMITS.seasonCap &&
        proposed.filter((entry) => entry.day === day).length < PROPOSAL_LIMITS.perDay
    );
}

export interface CardProposal {
    label: string;
    note?: string;
    targetIds?: string[];
    effects: CardEffect[];
}

export interface ProposalVerdict {
    ok: boolean;
    card?: EventCard;
    targetIds: string[];
    /** every reason it was refused — logged, so a bad proposer is diagnosable. */
    problems: string[];
}

/**
 * Validate a director's draft into a playable one-shot card, or refuse it with
 * reasons. Pure: decides nothing about the world, only about the draft.
 */
export function validateProposal(
    world: WorldState,
    draft: CardProposal,
    req: { day: number; seq: number },
): ProposalVerdict {
    const problems: string[] = [];
    const label = draft.label?.trim();
    if (!label) problems.push('提案沒有卡面（label）');
    if (label && label.length > 40) problems.push('卡面太長（限 40 字）');

    const played = world.data.directorLog ?? [];
    const proposedThisSeason = played.filter((entry) => entry.chosenBy === 'director-proposed');
    if (proposedThisSeason.length >= PROPOSAL_LIMITS.seasonCap) {
        problems.push(`本季自撰的牌已用滿 ${PROPOSAL_LIMITS.seasonCap} 張`);
    }
    if (proposedThisSeason.filter((entry) => entry.day === req.day).length >= PROPOSAL_LIMITS.perDay) {
        problems.push('今日已經自撰過一張牌');
    }

    const onBoard = new Set(onBoardIds(world));
    const targetIds = (draft.targetIds ?? [])
        .map((raw) => (world.castById(raw) ? raw : world.idByName(raw) ?? raw))
        .filter((id) => onBoard.has(id));
    if ((draft.targetIds ?? []).length && !targetIds.length) problems.push('點名的人不在班中');

    const effects: CardEffect[] = [];
    const drafted = Array.isArray(draft.effects) ? draft.effects : [];
    if (!drafted.length) problems.push('提案沒有任何後果（effects）');
    if (drafted.length > PROPOSAL_LIMITS.maxEffects) {
        problems.push(`一張自撰的牌至多 ${PROPOSAL_LIMITS.maxEffects} 條後果`);
    }
    for (const effect of drafted.slice(0, PROPOSAL_LIMITS.maxEffects)) {
        if (!effect || !(PROPOSABLE_EFFECTS as readonly string[]).includes(effect.kind)) {
            problems.push(`自撰的牌不得使用這種後果：${(effect as { kind?: string })?.kind ?? '(無)'}`);
            continue;
        }
        const capped = capEffect(world, effect);
        if (typeof capped === 'string') problems.push(capped);
        else effects.push(capped);
    }
    if (!effects.length && !problems.length) problems.push('提案的後果全數不合格');
    if (problems.length) return { ok: false, targetIds, problems };

    return {
        ok: true,
        targetIds,
        problems: [],
        card: {
            id: `proposed-${req.seq}`,
            label: label!,
            ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
            trigger: { onDays: [req.day], maxPlays: 1 },
            targeting: targetIds.length ? { mode: 'named', names: targetIds } : { mode: 'none' },
            effects,
        },
    };
}

/** Clamp one drafted effect, or return the reason it cannot be used at all. */
function capEffect(world: WorldState, effect: CardEffect): CardEffect | string {
    switch (effect.kind) {
        case 'percept': {
            const text = effect.text?.trim();
            if (!text) return '自撰的 percept 沒有文字';
            return { ...effect, text: text.slice(0, PROPOSAL_LIMITS.perceptChars) };
        }
        case 'renown':
            return { ...effect, delta: clampTo(effect.delta, PROPOSAL_LIMITS.renownDelta) };
        case 'self-regard':
            return { ...effect, delta: clampTo(effect.delta, PROPOSAL_LIMITS.selfRegardDelta) };
        case 'bill': {
            if (!effect.id?.trim() || !effect.label?.trim()) return '自撰的債沒有 id 或名目';
            if (effect.fromAccountId && effect.fromAccountId !== TARGET_SENTINEL) {
                return '自撰的債只能記在這張卡對準的人頭上（fromAccountId 用 "@target"）';
            }
            return {
                ...effect,
                fromAccountId: TARGET_SENTINEL,
                amountYuan: Math.max(1, Math.min(PROPOSAL_LIMITS.billYuan, Math.round(effect.amountYuan))),
                dueInDays: Math.max(1, Math.min(PROPOSAL_LIMITS.billDueDays, Math.round(effect.dueInDays))),
            };
        }
        case 'want': {
            if (!effect.desc?.trim()) return '自撰的心事沒有內容';
            return {
                ...effect,
                desc: effect.desc.trim().slice(0, 40),
                layer: effect.layer?.trim() || '事務',
                weight: Math.max(0.2, Math.min(PROPOSAL_LIMITS.wantWeight, effect.weight ?? 0.6)),
                resistance: Math.max(2, Math.min(6, Math.round(effect.resistance ?? 4))),
                ...(effect.dueInDays !== undefined
                    ? { dueInDays: Math.max(1, Math.min(PROPOSAL_LIMITS.wantDueDays, Math.round(effect.dueInDays))) }
                    : {}),
            };
        }
        case 'weather': {
            const pct = Math.round(effect.housePct);
            return {
                ...effect,
                label: effect.label?.trim()?.slice(0, 40) || '天時轉了',
                housePct: Math.max(PROPOSAL_LIMITS.weatherHousePct.min, Math.min(PROPOSAL_LIMITS.weatherHousePct.max, pct)),
            };
        }
        case 'object-state': {
            if (!world.objectById(effect.objectId)) return `世上沒有這件東西：${effect.objectId}`;
            return { ...effect, state: (effect.state ?? '').trim().slice(0, 120) };
        }
        case 'leak-secret': {
            const secret = world.data.secretLedger?.find((row) => row.id === effect.secretId);
            if (!secret) return `帳上沒有這樁秘密：${effect.secretId}`;
            return effect;
        }
        default:
            return `自撰的牌不得使用這種後果：${(effect as { kind: string }).kind}`;
    }
}

const clampTo = (value: number, cap: number): number =>
    Math.max(-cap, Math.min(cap, Number.isFinite(value) ? value : 0));

// ── 2. persisted play history ────────────────────────────────────────────────

/** One director decision, forever. Replay this log and the world reproduces. */
export interface DirectorLogEntry {
    day: number;
    tick: number;
    clock: string;
    cardId: string;
    /** 'director' = an agent chose it from the offered set; 'deadline' = the
     *  engine forced it; 'operator' = a human/CLI played it; 'director-proposed'
     *  = the director assembled a card the deck never contained (bounded by
     *  `validateProposal`); 'character' = somebody in the world DID something
     *  that the deck turns into an event. */
    chosenBy: 'director' | 'deadline' | 'operator' | 'director-proposed' | 'character';
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
    /** For a `director-proposed` play: the VALIDATED card, verbatim. Without it a
     *  replay could not reconstruct a card that exists in no deck file. */
    proposedCard?: EventCard;
    /** For a `character` play: who did it. */
    actorId?: string;
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

// ── 3.5. 世情動作 · 誰現在能做什麼 (pure) ─────────────────────────────────────

/** What a character is offered this beat. Deliberately the same shape the
 *  director's card offer has: a face, a note, and a bounded target list. */
export interface CharacterActOffer {
    actId: string;
    label: string;
    note?: string;
    needsTarget: boolean;
    /** the ONLY people this act may be aimed at, right here, right now. */
    candidates: Array<{ id: string; name: string }>;
}

function actPlays(world: WorldState, actId: string): DirectorLogEntry[] {
    return (world.data.directorLog ?? []).filter((entry) => entry.chosenBy === 'character' && entry.cardId === actId);
}

/**
 * 亮牌 — the acts this character may reach for, at this venue, on this day.
 *
 * PURE, like `eligibleCards`, and for the same reason: what a person is ABLE to
 * do is a fact about the world, not a model's opinion. The beat prompt only ever
 * advertises what comes back from here, and the tick refuses any invocation that
 * is not in this list — so a character can no more invent 報官 out of nothing
 * than a director can invent a card.
 */
export function availableActsFor(
    world: WorldState,
    deck: EventDeck,
    req: { characterId: string; day: number; coPresentIds: string[] },
): CharacterActOffer[] {
    const onBoard = new Set(onBoardIds(world));
    if (!onBoard.has(req.characterId)) return [];
    const actsToday = (world.data.directorLog ?? []).filter(
        (entry) => entry.day === req.day && entry.chosenBy === 'character',
    ).length;
    if (actsToday >= (deck.maxActsPerDay ?? 2)) return [];
    const member = world.castById(req.characterId);
    const out: CharacterActOffer[] = [];
    for (const act of deck.acts ?? []) {
        if (act.minDay !== undefined && req.day < act.minDay) continue;
        const prior = actPlays(world, act.id);
        if (act.maxPlays !== undefined && prior.length >= act.maxPlays) continue;
        const mine = prior.filter((entry) => entry.actorId === req.characterId);
        if (act.maxPlaysPerCharacter !== undefined && mine.length >= act.maxPlaysPerCharacter) continue;
        if (act.cooldownDays !== undefined && mine.length) {
            if (req.day - Math.max(...mine.map((entry) => entry.day)) < act.cooldownDays) continue;
        }
        // 行當 and 點名 are two ways of authoring the same permission, so EITHER
        // qualification opens the door; declaring neither leaves it open to all.
        const roles = act.invokableBy?.roles ?? [];
        const names = act.invokableBy?.names ?? [];
        if (roles.length || names.length) {
            const byRole = roles.some((needle) => (member?.role ?? '').includes(needle));
            const byName = names.some((name) => name === req.characterId || world.idByName(name) === req.characterId);
            if (!byRole && !byName) continue;
        }
        if ((act.requires ?? []).some((condition) => !conditionHolds(world, condition))) continue;
        const needsTarget = act.needsTarget === true;
        const candidates = needsTarget
            ? (act.targetMustBeCoPresent === false ? [...onBoard] : req.coPresentIds.filter((id) => onBoard.has(id)))
                  .filter((id) => id !== req.characterId)
                  .sort()
            : [];
        // 對人做的事沒有對象就不成立 —— 不亮這張牌，好過亮了做不成。
        if (needsTarget && !candidates.length) continue;
        out.push({
            actId: act.id,
            label: act.label,
            ...(act.note ? { note: act.note } : {}),
            needsTarget,
            candidates: candidates.map((id) => ({ id, name: world.nameById(id) })),
        });
    }
    return out.sort((a, b) => a.actId.localeCompare(b.actId));
}

/**
 * Settle one 世情動作. Thin on purpose: an act IS a card, so it goes through the
 * same `playCard` that every other consequence in this engine goes through —
 * one settlement path, one log, one replay.
 *
 * Re-checks availability rather than trusting the caller, because the world has
 * moved since the act was advertised (the beat that invoked it is several turns
 * later, and someone may have left the room).
 */
export function playAct(
    world: WorldState,
    deck: EventDeck,
    req: {
        actId: string;
        actorId: string;
        targetId?: string;
        /** who was in the room — the same list the offer was computed from. */
        coPresentIds: string[];
        day: number;
        nowTick: number;
        clock: string;
    },
): PlayCardResult & { refused?: string } {
    const empty = (reason: string): PlayCardResult & { refused: string } => ({
        played: false,
        refused: reason,
        reason,
        publicLines: [],
        privateNotices: [],
        percepts: [],
        spawnedWants: [],
        irreversible: 0,
    });
    const act = (deck.acts ?? []).find((row) => row.id === req.actId);
    if (!act) return empty(`牌組裡沒有這個動作：${req.actId}`);
    const offer = availableActsFor(world, deck, {
        characterId: req.actorId,
        day: req.day,
        coPresentIds: req.coPresentIds,
    }).find((row) => row.actId === req.actId);
    if (!offer) return empty(`${world.nameById(req.actorId)}此刻做不了「${act.label}」`);

    const targetId = req.targetId
        ? (world.castById(req.targetId) ? req.targetId : world.idByName(req.targetId))
        : undefined;
    if (offer.needsTarget && (!targetId || !offer.candidates.some((row) => row.id === targetId))) {
        return empty(`「${act.label}」要當著人做，這個對象不在跟前`);
    }

    return playCard(world, deck, {
        card: {
            id: act.id,
            label: act.label,
            ...(act.note ? { note: act.note } : {}),
            trigger: {},
            targeting: targetId ? { mode: 'named', names: [targetId] } : { mode: 'none' },
            effects: act.effects,
        },
        ...(targetId ? { targetIds: [targetId] } : {}),
        chosenBy: 'character',
        actorId: req.actorId,
        day: req.day,
        nowTick: req.nowTick,
        clock: req.clock,
    });
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
    /** 世情動作 only: who did it. Resolves `'@actor'` and every `standing`
     *  effect that moves opinion about, or held by, the person acting. */
    actorId?: string;
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
    // Loaded lazily-but-once: `setBonds` writes the whole graph back, so a second
    // load mid-play would silently drop the first effect's cuts.
    const bonds = world.bondGraph();
    let bondsTouched = false;
    const actorIds = req.actorId && world.castById(req.actorId) ? [req.actorId] : [];
    const standingSubjects = (on: 'targets' | 'actor' | 'both' | undefined): string[] =>
        on === 'actor' ? actorIds : on === 'both' ? [...new Set([...effectiveTargets, ...actorIds])] : effectiveTargets;

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
                    raw === TARGET_SENTINEL ? effectiveTargets[0] : raw === ACTOR_SENTINEL ? req.actorId : raw;
                const payerId = resolveAccount(effect.fromAccountId);
                const perPerson = effect.fromAccountId === TARGET_SENTINEL || effect.fromAccountId === ACTOR_SENTINEL;
                if (perPerson && !payerId) break; // aimed at nobody
                const billId = perPerson ? `${effect.id}:${payerId}` : effect.id;
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
                for (const characterId of standingSubjects(effect.on)) world.bumpRenown(characterId, effect.delta);
                break;
            case 'self-regard':
                for (const characterId of standingSubjects(effect.on)) world.bumpSelfRegard(characterId, effect.delta);
                break;
            case 'standing': {
                // 後果落在既有的關係圖上 —— 沒有第二本帳。
                const subjects = effect.toward === 'actor' ? actorIds : effectiveTargets;
                const hearsay = effect.hearsay ?? effect.from === 'witnesses';
                for (const aboutId of subjects) {
                    const holders =
                        effect.from === 'actor'
                            ? actorIds
                            : effect.from === 'targets'
                              ? effectiveTargets
                              // The person who DID it is never one of the people
                              // who merely heard about it — their own stance is a
                              // separate effect the author writes on purpose, and
                              // without this exclusion 報官 left the informer
                              // holding 「聽說他吃了官司」 about the person he
                              // himself walked to the police station.
                              : witnessAll.filter((id) => id !== aboutId && !actorIds.includes(id));
                    for (const holderId of holders) {
                        if (holderId === aboutId) continue;
                        const tone = hearsay && !effect.tone.startsWith(HEARSAY_MARK)
                            ? `${HEARSAY_MARK}${effect.tone}`
                            : effect.tone;
                        world.setEdge(holderId, aboutId, tone, effect.disposition ?? 'cold');
                        if (effect.grievance) chillBond(bonds, holderId, aboutId, effect.grievance);
                        bondsTouched = true;
                    }
                    // A street turning cold on somebody is ONE irreversible fact,
                    // not one per pair of eyes. Counting edges would let a single
                    // act out-weigh a reckoning in the vitals by an order of
                    // magnitude purely because the cast is large.
                    if (holders.length) result.irreversible += 1;
                }
                break;
            }
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

    if (bondsTouched) world.setBonds(bonds);

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
        // A proposed card exists in no deck file, so the log has to carry the card
        // itself or the run stops being replayable from the log alone.
        ...(req.chosenBy === 'director-proposed' ? { proposedCard: req.card } : {}),
        ...(actorIds.length ? { actorId: actorIds[0] } : {}),
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
