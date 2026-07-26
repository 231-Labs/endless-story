/**
 * Season economy — the money physics of a season world, persisted inside
 * WorldStateData so snapshot/restore/rollback carry the ledger with the world.
 *
 * All arithmetic lives in @endless-story/economy (production.ts + contract.ts):
 * this module only parses the persisted state, routes structured beat commands
 * through those transitions, applies the bought affordance to the world
 * (objects / hunger / housing / production), and projects a knowledge-scoped
 * percept per character. It NEVER reimplements balance, runway or settlement
 * math (ECONOMY_ENGINE_HANDOFF invariant), and the LLM never touches a number:
 * prose narrates, `BeatEconomyCommand`s move money, the engine validates.
 *
 * Money unit: whole 圓 face value over `subunitsPerUnit` minimum units (分).
 */

import {
    accountRunwayDays,
    collectDue,
    conservesProduction,
    counterAskGate,
    depositExternal,
    emptyEconomy,
    expireContracts,
    fileCounter,
    fillPartnerSlot,
    maySpend,
    offerContract,
    openAccounts,
    PARTNER_SLOT,
    pendingSigners,
    persistContracts,
    persistEconomy,
    purchase,
    readyToSettle,
    rejectContract,
    resolveCounter,
    restoreContracts,
    restoreEconomy,
    settleContract,
    settleEconomyDay,
    signContract,
    transferMoney,
    type AccountSeed,
    type ContractState,
    type EconomicContract,
    type EconomyAccount,
    type EconomyTransaction,
    type PersistedEconomicContract,
    type PersistedEconomyState,
} from '@endless-story/economy';
import { PARTS_OF_DAY } from '../ports.ts';
import { STAGE_KINDS } from './skills.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';
import type { WorldState } from '../world-state.ts';

export type BeatEconomyCommand = CharacterAgentNs.BeatEconomyCommand;

// ── persisted shape (rides WorldStateData.economy; JSON-safe strings only) ──

export type SeasonCatalogEffect =
    | { kind: 'relieve-hunger' }
    | {
        kind: 'object-state';
        objectId: string;
        state: string;
        /** Authoritative replacement tags when STRICT is active. */
        stateTags?: string[];
    }
    /** instant rehousing — for abstractions that need no move-in arc. Prefer
     *  'tenancy' for characters: real moves are lived, not teleported. */
    | { kind: 'move-home'; sceneName: string; characterName?: string }
    /** a LEASE, not a move: the beneficiary receives a lease object (carried),
     *  and the home only changes when they physically arrive at the granted
     *  scene carrying it. When/whether to move — and what to pack — is their
     *  own in-world choice (the packing arc). `characterName` omitted = buyer. */
    | { kind: 'tenancy'; sceneName: string; characterName?: string; keyObjectId: string; keyLabel: string }
    | {
        kind: 'spawn-object';
        objectId: string;
        label: string;
        sceneName: string;
        state: string;
        stateTags?: string[];
        aliases?: string[];
    };

export interface SeasonCatalogItem {
    id: string;
    label: string;
    /** price in minimum units, decimal string. */
    priceSubunits: string;
    kind: 'meal' | 'medical' | 'transport' | 'repair' | 'costume' | 'housing' | 'venue' | 'production';
    /** what the money objectively changes in the world — never just narration. */
    effect: SeasonCatalogEffect;
    /** venue restriction (scene name); omit = purchasable anywhere. */
    sceneName?: string;
    /** account receiving the payment; omit = the market account. */
    vendorAccountId?: string;
    /** at most one purchase per buyer per day (meals). */
    oncePerDay?: boolean;
    /** at most one purchase ever (repairs, housing, production investment). */
    unique?: boolean;
}

export interface SeasonEconomyData {
    unitLabel: string;
    subunitsPerUnit: number;
    marketAccountId: string;
    troupeAccountId: string;
    /** what the troupe's daily fixed cost actually IS in this world (e.g.
     *  錢莊月息、屋租與電燈捐稅) — shown in percepts and shortfall notices. */
    troupeCostNote?: string;
    /** who turns cold when the troupe cannot pay (e.g. 錢莊先生與房東). */
    shortfallCreditor?: string;
    /** scene NAME where public settlement notices post next morning. */
    noticeSceneName: string;
    /** daily wage schedule: accountId → subunits, paid by `fromAccountId` (the
     *  establishment that employs them — defaults to the troupe when absent, so
     *  older snapshots keep paying everyone from 班庫). Multi-establishment: a
     *  歌女 draws from 長三堂子, a 記者 from 申報館 — each pot pays its own people. */
    wages: Array<{ accountId: string; amountSubunits: string; fromAccountId?: string }>;
    /** periodic lump-sum obligations (錢莊月息、屋租按期付，不是每日勻繳)。
     *  due at the END of dueDay; short payment rolls forward as a standing
     *  debt chased at every later settle until cleared. `fromAccountId`/`toAccountId`
     *  route the collection: 默認 班庫→市面; a 租金 bill sets 租客→屋主 (a tenant pays
     *  his landlord). Absent ⇒ the troupe/market default, so existing bills stay
     *  byte-identical. */
    bills?: Array<{
        id: string;
        label: string;
        amountSubunits: string;
        dueDay: number;
        creditor?: string;
        paidSubunits: string;
        /** payer account — 默認 班庫 (troupeAccountId); a 租金 bill sets the 租客. */
        fromAccountId?: string;
        /** payee account — 默認 市面 (marketAccountId); a 租金 bill sets the 屋主. */
        toAccountId?: string;
    }>;
    catalog: SeasonCatalogItem[];
    /** contractId → linked WorldObject id whose state mirrors contract status. */
    contractObjectIds: Record<string, string>;
    /** consent-gated purchases in flight/settled: sponsorship contractId →
     *  which catalog item it buys, who pays, who must agree. Receiving is a
     *  choice (the aid.ts rule): a benefit aimed at another person only lands
     *  when THEY sign — 金鳳 may take 柳安春's money and refuse 白韻秋's. */
    sponsorships?: Record<string, { itemId: string; buyerAccountId: string; beneficiaryId: string }>;
    /** granted-but-not-yet-lived leases: lease objectId → who may move where.
     *  Cleared when the move-in actually happens. */
    tenancies?: Record<string, { characterId: string; sceneName: string }>;
    /** the nightly show: banked rehearsal presence + box-office config. */
    performance?: {
        venueSceneName: string;
        leadIds: string[];
        minCast: number;
        fullHouseSubunits: string;
        boosts?: Array<{
            objectId: string;
            /** Legacy human-readable state predicate. STRICT shadows only. */
            stateIncludes?: string;
            /** Authoritative finite object-state predicate in STRICT. */
            requiredStateTag?: string;
            pct: number;
        }>;
        /** cast seen at the venue during 日午/晡時 — quality is earned in daylight. */
        rehearsedToday: string[];
        /** basis points (of the night's takings) shared out among the performers
         *  actually on the boards, credited to their OWN accounts; the remainder
         *  goes to 班庫. 0/absent ⇒ all to the troupe (today's behaviour). */
        castShareBps?: number;
        /** 名角滿座 — when true, the STAGE CRAFT (唱/身) of the performers on the
         *  boards lifts the house (`performerSkillBoostPct`, capped at
         *  SKILL_HOUSE_CAP). Absent/false ⇒ the house ignores talent, byte-
         *  identical to before this hang point existed (backward-compat). */
        performerBoost?: boolean;
        /** 看客成群 — when true, the settle reports a REAL audience figure
         *  (看客約 N 人 = houseSeats × pct/100, distinct from the cast on the
         *  boards) and the PRESENT leads' public 名頭 draws extra house
         *  (`renownDrawPct`, capped at RENOWN_HOUSE_CAP). Absent/false ⇒ the
         *  settle line and pct stay byte-identical to before (backward-compat). */
        audienceHouse?: boolean;
        /** full-house seat count behind the 看客 figure. Default 120 when
         *  `audienceHouse` is on; meaningless when it is off. */
        houseSeats?: number;
    };
    /** contractId → the proposer's authored answer policy for counter-demands.
     *  The replaceable seam: swap for a live counterparty agent later. */
    negotiations?: Record<string, {
        acceptDemandsMatching: string[];
        graceDaysOnAccept?: number;
        acceptNote?: string;
        refusalNote?: string;
    }>;
    /** accountId → authored 立場 for that establishment's counterparty agent seat
     *  (what the house cares about, its concession logic, its 口風). AGENT-ONLY:
     *  the mechanical counterAskGate never reads it — it only decides 值不值得讓. */
    stances?: Record<string, string>;
    /** 賒帳 terms: vendor accountId → tab dueDays, for businesses whose frame set
     *  `allowsTab` (趙阿福's 紅字帳 made mechanical). Read ONLY when the world's
     *  creditVerbs flag is on — a broke buyer's purchase at such a vendor then
     *  becomes a real bill (buyer→vendor) instead of a refusal. */
    vendorTabs?: Record<string, { dueDays: number }>;
    /** 欠條生怨 dedup: `${billId}:debtor` / `${billId}:creditor` markers whose
     *  overdue-debt want ALREADY spawned at a settle — each overdue 欠條 stirs
     *  each heart exactly once. */
    debtWantsSpawned?: string[];
    /** floor days of runway a money-counter 加碼 must leave the proposer above
     *  (counterAskGate's dailyFixedCost × N). Default 3 at use sites. */
    counterFloorDays?: number;
    state: PersistedEconomyState;
    contracts: Record<string, PersistedEconomicContract>;
}

export interface EconomyCommandOutcome {
    ok: boolean;
    reason?: string;
    /** objective, already-happened facts for the day log / notices. */
    publicLines: string[];
}

export interface SeasonDaySettleReport {
    settled: boolean;
    publicNotices: string[];
    privateNotices: Array<{ characterId: string; text: string }>;
    /** Contracts that hit their 限期 unsigned this settle. The tick turns each
     *  into a next-morning PERCEPT for the parties (so a signer who never signed
     *  actually LEARNS it's over) and forecloses the wants it kills. */
    foreclosures?: Array<{
        contractId: string;
        label: string;
        /** Required signers + any filled partner — the people whose 心事 hung on it. */
        partyIds: string[];
        /** The 聯名搭檔 欄 lapsed empty — the specific matter 柳安春 kept carrying. */
        slotUnfilled: boolean;
        /** Where the contract paper sits — the locus of the announcement. */
        sceneId: string;
    }>;
}

// ── parse / persist ──

function live(world: WorldState): { data: SeasonEconomyData; contract: ContractState } | null {
    const data = world.data.economy;
    if (!data) return null;
    return {
        data,
        contract: { economy: restoreEconomy(data.state), contracts: restoreContracts(data.contracts) },
    };
}

function persist(world: WorldState, contract: ContractState): void {
    const data = world.data.economy!;
    data.state = persistEconomy(contract.economy);
    data.contracts = persistContracts(contract.contracts);
}

function subunits(data: SeasonEconomyData, yuanAmount: number): bigint {
    return BigInt(Math.floor(yuanAmount)) * BigInt(data.subunitsPerUnit);
}

/** 1234 分 → 「12 圓 34 分」;整數圓省略分。 */
export function formatMoney(data: SeasonEconomyData, amount: bigint): string {
    const per = BigInt(data.subunitsPerUnit);
    const whole = amount / per;
    const rest = amount % per;
    return rest === 0n ? `${whole} ${data.unitLabel}` : `${whole} ${data.unitLabel}${rest} 分`;
}

function accountLabel(contract: ContractState, id: string): string {
    return contract.economy.accounts[id]?.label ?? id;
}

/** Resolve a beneficiary written for humans (formal name / 班庫 / account id). */
function resolveAccountId(world: WorldState, data: SeasonEconomyData, name: string): string | undefined {
    if (name === '班庫' || name === data.troupeAccountId) return data.troupeAccountId;
    const castId = world.idByName(name);
    if (castId) return castId;
    return world.data.economy?.state.accounts[name] ? name : undefined;
}

// ── beat command commit ──

function touchObject(
    world: WorldState,
    objectId: string,
    state: string,
    witnessIds: string[],
    stateTags?: string[],
): void {
    const object = world.objectById(objectId);
    if (!object) return;
    object.state = state;
    if (world.data.strictStructured) {
        object.stateTags = stateTags?.length
            ? [...new Set(stateTags)]
            : undefined;
    }
    object.version += 1;
    object.knownBy = [...new Set([...object.knownBy, ...witnessIds])];
}

/** Authoritative contract-object state text, derived from the ledger. */
function contractObjectState(data: SeasonEconomyData, contract: ContractState, contractId: string): string {
    const c = contract.contracts[contractId];
    if (!c) return '';
    const label = (id: string): string => accountLabel(contract, id);
    if (c.status === 'settled') {
        const splits = c.splits
            .map((split) => {
                const target = split.beneficiary === PARTNER_SLOT ? label(c.partnerSlot.filledBy ?? PARTNER_SLOT) : label(split.beneficiary);
                return `${target}得${formatMoney(data, split.amount)}`;
            })
            .join('、');
        return `已簽署生效；預付款已按約分訖（${splits}）`;
    }
    if (c.status === 'rejected') return '已當面拒簽；預付款原封退回提約方';
    if (c.status === 'expired') return '已逾期失效；預付款由提約方收回';
    const partner = c.partnerSlot.required
        ? `聯名搭檔欄：${c.partnerSlot.filledBy ? label(c.partnerSlot.filledBy) : '空白'}`
        : '';
    const signed = c.signedBy.length ? `已署名：${c.signedBy.map(label).join('、')}` : '尚無署名';
    return `尚未生效；${partner}${partner ? '；' : ''}${signed}`;
}

function syncContractObject(world: WorldState, data: SeasonEconomyData, contract: ContractState, contractId: string, witnessIds: string[]): void {
    const objectId = data.contractObjectIds[contractId];
    if (!objectId || !contract.contracts[contractId]) return;
    touchObject(world, objectId, contractObjectState(data, contract, contractId), witnessIds);
}

export interface CommitEconomyCommandRequest {
    actorId: string;
    sceneId: string;
    witnessIds: string[];
    command: BeatEconomyCommand;
    /** canonical cause (scene event id + beat index); txn ids derive from it. */
    causeEventId: string;
    /** disambiguates multiple commands within one beat. */
    seq: number;
    day: number;
    /** 借錢兩造 (borrow only): the LENDER's consent verdict, computed by the
     *  dispatcher through the optional decideLend seat BEFORE this pure commit.
     *  undefined / null / lend:false ⇒ REFUSE — a real social event (ok:true
     *  with a 婉拒 public line, NEVER a replan); lend:true ⇒ the money moves
     *  now and a dated 欠條 bill records the debt. */
    lendVerdict?: { lend: boolean; line?: string } | null;
}

/** 告借還期: default / cap on a personal loan's dueDays（借錢憑欠條，期不可無限）. */
export const LOAN_DUE_DAYS_DEFAULT = 15;
export const LOAN_DUE_DAYS_CAP = 60;

function clampLoanDueDays(dueDays: number | undefined): number {
    if (dueDays === undefined || !Number.isInteger(dueDays) || dueDays <= 0) return LOAN_DUE_DAYS_DEFAULT;
    return Math.min(dueDays, LOAN_DUE_DAYS_CAP);
}

/**
 * Validate one structured command against the season ledger and commit it.
 * Returns ok:false WITHOUT mutating the world when the command is illegal —
 * the caller throws so the scene loop replans the beat (physical-canon rule).
 */
export function commitEconomyCommand(world: WorldState, req: CommitEconomyCommandRequest): EconomyCommandOutcome {
    const parsed = live(world);
    if (!parsed) return { ok: false, reason: '本季世界沒有銀錢帳', publicLines: [] };
    const { data } = parsed;
    let contract = parsed.contract;
    const cmd = req.command;
    const txnId = `${req.causeEventId}:c${req.seq}`;
    const actorName = world.nameById(req.actorId);
    const fail = (reason: string): EconomyCommandOutcome => ({ ok: false, reason, publicLines: [] });

    if (cmd.action === 'purchase') {
        const item = data.catalog.find((candidate) => candidate.id === cmd.itemId);
        if (!item) return fail(`沒有這項買賣：${cmd.itemId ?? '（未填 itemId）'}`);
        if (item.sceneName && world.sceneNameById(req.sceneId) !== item.sceneName) {
            return fail(`「${item.label}」只在【${item.sceneName}】辦得到，此處是【${world.sceneNameById(req.sceneId)}】`);
        }
        const payerId = cmd.fromAccount === 'troupe' ? data.troupeAccountId : req.actorId;
        const price = BigInt(item.priceSubunits);
        const bought = contract.economy.ledger.filter(
            (t) => t.kind === 'purchase' && t.memo.startsWith(`${item.id}|`),
        );
        // 賒帳 bills count toward the SAME once-per-day / unique guards as cash
        // purchases (a meal tabbed at noon is the day's meal). Their ids carry
        // item + day + payer, so both checks read off the id alone. With the
        // creditVerbs flag off no tab bill exists, so the guards are unchanged.
        const tabStamp = `tab:${item.id}:d${req.day}:${payerId}:`;
        const tabbedToday = (data.bills ?? []).some((bill) => bill.id.startsWith(tabStamp));
        const tabbedEver = (data.bills ?? []).some((bill) => bill.id.startsWith(`tab:${item.id}:`));
        // a settled sponsorship IS the item being done; a pending one holds the slot
        const sponsorStates = Object.entries(data.sponsorships ?? {})
            .filter(([, s]) => s.itemId === item.id)
            .map(([cid]) => contract.contracts[cid]?.status);
        if (item.unique && (bought.length > 0 || tabbedEver || sponsorStates.some((s) => s === 'settled'))) {
            return fail(`「${item.label}」已經辦過了，不能重複`);
        }
        if (item.unique && sponsorStates.some((s) => s === 'offered')) {
            return fail(`「${item.label}」已有人出資、正等當事人答覆，不能搶辦`);
        }
        if (item.oncePerDay && (bought.some((t) => t.day === req.day && t.from === payerId) || tabbedToday)) {
            return fail(`「${item.label}」今日已經用過一次`);
        }

        // CONSENT GATE — a benefit aimed at another person never lands unilaterally:
        // the buyer's money goes into escrow as a sponsorship offer, and only the
        // beneficiary's own signature (their in-scene choice) settles it.
        const beneficiaryId = sponsorshipBeneficiary(world, item);
        if (beneficiaryId && beneficiaryId !== req.actorId) {
            const beneficiaryName = world.nameById(beneficiaryId);
            const sponsorId = `sponsor:${item.id}:d${req.day}:${payerId}`;
            const offered = offerContract(contract, {
                id: sponsorId,
                label: `${actorName}出資：${item.label}`,
                proposerAccountId: payerId,
                total: price,
                splits: [{ beneficiary: item.vendorAccountId ?? data.marketAccountId, amount: price, memo: item.label }],
                requiredSignerIds: [beneficiaryId],
                partnerRequired: false,
                deadlineDay: req.day + 1,
                causeEventId: req.causeEventId,
            });
            if (offered.rejection) return fail(offered.rejection.message);
            if (offered.duplicate) return fail(`你今日已為「${item.label}」出過一次資，等${beneficiaryName}答覆`);
            contract = offered.state;
            (data.sponsorships ??= {})[sponsorId] = { itemId: item.id, buyerAccountId: payerId, beneficiaryId };
            persist(world, contract);
            return {
                ok: true,
                publicLines: [
                    `${actorName}願出${formatMoney(data, price)}辦「${item.label}」（${payerId === data.troupeAccountId ? '班庫出帳' : '自掏腰包'}）——` +
                    `錢已入押，允不允由${beneficiaryName}自己；限明日夜裡答覆，逾期原封退回`,
                ],
            };
        }

        // 賒帳 — 趙阿福的紅字帳 made mechanical: when the buyer's purse cannot
        // cover the price at a vendor whose frame extends tab (`allowsTab`), the
        // purchase still happens and a REAL bill (buyer→vendor, chased by the
        // daily settle exactly like every other 帳期) records the debt. A bill is
        // a promise, not money: NO transfer, so conservation is untouched and
        // `auditSeasonEconomy` stays []. Flag off / no allowsTab / troupe payer
        // without authority ⇒ the exact old insufficient-funds refusal below.
        const tab = item.vendorAccountId ? data.vendorTabs?.[item.vendorAccountId] : undefined;
        const payerAccount = contract.economy.accounts[payerId];
        if (
            tab && item.vendorAccountId && payerAccount &&
            maySpend(payerAccount, req.actorId) && payerAccount.available < price
        ) {
            const vendorLabel = accountLabel(contract, item.vendorAccountId);
            (data.bills ??= []).push({
                id: `${tabStamp}${txnId}`,
                label: `賒${item.label}`,
                amountSubunits: price.toString(),
                dueDay: req.day + tab.dueDays,
                creditor: vendorLabel,
                paidSubunits: '0',
                fromAccountId: payerId,
                toAccountId: item.vendorAccountId,
            });
            applyCatalogEffect(world, item, req);
            return {
                ok: true,
                publicLines: [`${actorName}在${vendorLabel}賒下一份${item.label}，記在帳上。`],
            };
        }

        const paid = purchase(contract.economy, {
            txnId,
            actorId: req.actorId,
            from: payerId,
            to: item.vendorAccountId ?? data.marketAccountId,
            amount: price,
            memo: `${item.id}|${item.label}`,
            causeEventId: req.causeEventId,
        });
        if (paid.rejection) return fail(paid.rejection.message);
        contract = { economy: paid.state, contracts: contract.contracts };
        persist(world, contract);
        applyCatalogEffect(world, item, req);
        return {
            ok: true,
            publicLines: [`${actorName}以${formatMoney(data, price)}買下「${item.label}」（${payerId === data.troupeAccountId ? '班庫出帳' : '自掏腰包'}）`],
        };
    }

    if (cmd.action === 'pay') {
        if (!cmd.toName || !cmd.amountYuan || cmd.amountYuan <= 0) return fail('付錢要填 toName 與正整數 amountYuan');
        const toId = resolveAccountId(world, data, cmd.toName);
        if (!toId) return fail(`不認得收款人：${cmd.toName}`);
        const fromId = cmd.fromAccount === 'troupe' ? data.troupeAccountId : req.actorId;
        const moved = transferMoney(contract.economy, {
            txnId,
            actorId: req.actorId,
            from: fromId,
            to: toId,
            amount: subunits(data, cmd.amountYuan),
            memo: cmd.memo ?? '當面交割',
            causeEventId: req.causeEventId,
        });
        if (moved.rejection) return fail(moved.rejection.message);
        contract = { economy: moved.state, contracts: contract.contracts };
        persist(world, contract);
        return {
            ok: true,
            publicLines: [`${actorName}將${formatMoney(data, subunits(data, cmd.amountYuan))}交到${accountLabel(contract, toId)}名下${cmd.memo ? `（${cmd.memo}）` : ''}`],
        };
    }

    if (cmd.action === 'borrow') {
        // 借錢是兩造的事：錢動之前，出借的人先點頭（req.lendVerdict, computed by
        // the dispatcher through the decideLend seat）。A REFUSED loan is a real
        // social event — ok:true with a 婉拒 line, never a replan; only malformed
        // commands (flag off / bad name / not co-present / non-positive) fail.
        if (!cmd.toName || !cmd.amountYuan || cmd.amountYuan <= 0 || !Number.isInteger(cmd.amountYuan)) {
            return fail('告借要填 toName（同場出借人正式姓名）與正整數 amountYuan');
        }
        const lenderId = world.idByName(cmd.toName);
        if (!lenderId || !world.castById(lenderId)) return fail(`不認得這位出借人：${cmd.toName}`);
        if (lenderId === req.actorId) return fail('不能向自己告借');
        if (world.data.roster[lenderId] !== req.sceneId) {
            return fail(`${cmd.toName}不在此處——告借是當面開口的事`);
        }
        const dueDays = clampLoanDueDays(cmd.dueDays);
        const dueDay = req.day + dueDays;
        const lenderName = world.nameById(lenderId);
        const line = req.lendVerdict?.line?.trim() || undefined;
        if (!req.lendVerdict?.lend) {
            // 婉拒也是一句回答 — no money moves, and the beat still lands.
            return {
                ok: true,
                publicLines: [`${actorName}向${lenderName}開口告借${cmd.amountYuan}圓，${lenderName}婉拒了${line ? `：「${line}」` : ''}。`],
            };
        }
        const amount = subunits(data, cmd.amountYuan);
        // The lender consented — THEY move their own money (actorId: lenderId),
        // through the same conserving transfer as any hand-to-hand payment.
        const lent = transferMoney(contract.economy, {
            txnId,
            actorId: lenderId,
            from: lenderId,
            to: req.actorId,
            amount,
            memo: `告借${cmd.memo ? `（${cmd.memo}）` : ''}`,
            causeEventId: req.causeEventId,
        });
        if (lent.rejection) return fail(lent.rejection.message);
        contract = { economy: lent.state, contracts: contract.contracts };
        persist(world, contract);
        // The bill IS the debt instrument — the exact shape the daily settle
        // chases (due at END of dueDay, short payment rolls forward).
        (data.bills ??= []).push({
            id: `loan:${txnId}`,
            label: `欠${lenderName}${cmd.amountYuan}圓${cmd.memo ? `（${cmd.memo}）` : ''}`,
            amountSubunits: amount.toString(),
            dueDay,
            creditor: lenderName,
            paidSubunits: '0',
            fromAccountId: req.actorId,
            toAccountId: lenderId,
        });
        return {
            ok: true,
            publicLines: [`${actorName}向${lenderName}告借${cmd.amountYuan}圓，${lenderName}應了${line ? `：「${line}」` : ''}——這筆欠著，第${dueDay}日為期。`],
        };
    }

    if (cmd.action === 'repay') {
        // 還帳 sugar: one conserving transfer + the OLDEST open 欠條(s) toward
        // this creditor shrink by the same amount — the SAME paidSubunits
        // representation the daily settle chases, so a partial repay simply
        // leaves less to chase.
        if (!cmd.toName || !cmd.amountYuan || cmd.amountYuan <= 0 || !Number.isInteger(cmd.amountYuan)) {
            return fail('還帳要填 toName（債主）與正整數 amountYuan');
        }
        const creditorId = resolveAccountId(world, data, cmd.toName);
        if (!creditorId) return fail(`不認得這位債主：${cmd.toName}`);
        const open = (data.bills ?? []).filter((bill) =>
            bill.fromAccountId === req.actorId &&
            bill.toAccountId === creditorId &&
            BigInt(bill.amountSubunits) > BigInt(bill.paidSubunits));
        if (!open.length) return fail('你不欠此人錢——白給請用 pay');
        let owed = 0n;
        for (const bill of open) owed += BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        // 還帳只還欠著的數 — the transfer is capped at what is owed, so an
        // overshoot never becomes a hidden gift riding a repay (白給 belongs to pay).
        const asked = subunits(data, cmd.amountYuan);
        const amount = asked < owed ? asked : owed;
        const repaid = transferMoney(contract.economy, {
            txnId,
            actorId: req.actorId,
            from: req.actorId,
            to: creditorId,
            amount,
            memo: `還帳${cmd.memo ? `（${cmd.memo}）` : ''}`,
            causeEventId: req.causeEventId,
        });
        if (repaid.rejection) return fail(repaid.rejection.message);
        contract = { economy: repaid.state, contracts: contract.contracts };
        persist(world, contract);
        // oldest first: data.bills is append-ordered, and `open` preserves it.
        let left = amount;
        for (const bill of open) {
            if (left <= 0n) break;
            const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
            const put = left < remaining ? left : remaining;
            bill.paidSubunits = (BigInt(bill.paidSubunits) + put).toString();
            left -= put;
        }
        const rest = owed - amount;
        return {
            ok: true,
            publicLines: [`${actorName}還了${accountLabel(contract, creditorId)}${formatMoney(data, amount)}${rest === 0n ? '，這筆欠條兩清' : `，欠條上還記著${formatMoney(data, rest)}`}。`],
        };
    }

    // contract commands share resolution. Models routinely hand back the
    // PAPER's object id instead of the ledger id (they read it off the scene's
    // object list) — accept the obvious alias instead of dying on it.
    let contractId = cmd.contractId ?? '';
    if (!contract.contracts[contractId]) {
        const byObject = Object.entries(data.contractObjectIds).find(([, objectId]) => objectId === contractId);
        if (byObject) contractId = byObject[0];
    }
    const c = contract.contracts[contractId];
    if (!c) {
        return fail(`不認得這份契約：${cmd.contractId || '（未填 contractId）'}；現有契約：${Object.keys(contract.contracts).join('、') || '（無）'}`);
    }
    // Contract acts are physical acts: the paper must be before the actor.
    const linkedObjectId = data.contractObjectIds[contractId];
    const paper = linkedObjectId ? world.objectById(linkedObjectId) : undefined;
    if (paper && !world.objectAccessibleTo(paper, req.actorId, req.sceneId)) {
        return fail(`「${c.label}」的契約書不在此處（在【${world.sceneNameById(paper.sceneId)}】）；要簽、拒或填欄，須到紙面前`);
    }

    if (cmd.action === 'contract_fill_partner') {
        if (!cmd.partnerName) return fail('要填 partnerName（聯名搭檔的正式姓名）');
        const partnerId = world.idByName(cmd.partnerName);
        if (!partnerId) return fail(`不認得這位搭檔：${cmd.partnerName}`);
        const filled = fillPartnerSlot(contract, { contractId, actorId: req.actorId, partnerId, causeEventId: req.causeEventId });
        if (filled.rejection) return fail(filled.rejection.message);
        contract = filled.state;
        persist(world, contract);
        syncContractObject(world, data, contract, contractId, req.witnessIds);
        return { ok: true, publicLines: [`${actorName}在「${c.label}」唯一聯名搭檔欄親筆填上${cmd.partnerName}`] };
    }

    const contractParties = new Set([...c.requiredSignerIds, ...(c.partnerSlot.filledBy ? [c.partnerSlot.filledBy] : [])]);
    const contractVoices = new Set([...contractParties, ...c.negotiatorIds]);
    const partyNames = [...contractParties].map((id) => accountLabel(contract, id)).join('、');

    if (cmd.action === 'contract_counter') {
        if (!contractVoices.has(req.actorId)) {
            return fail(`「${c.label}」的還價資格在當事人（${partyNames}）與受益方當家手裡，${actorName}插不上手——要影響此約，去勸得動的人`);
        }
        if (!cmd.demand?.trim()) return fail('要還價就得寫明 demand（你要的條款，一句）');
        // A money counter carries a self-tagged askYuan: the demander wants the
        // deal's total bumped by this many 圓 (LLM tags the intent; the engine —
        // never regex on prose — turns it into subunits). Absent → a条件-only
        // counter, today's behaviour bit-for-bit.
        const ask = cmd.askYuan !== undefined ? subunits(data, cmd.askYuan) : undefined;
        const countered = fileCounter(contract, {
            contractId, actorId: req.actorId, demand: cmd.demand, day: req.day,
            ...(ask !== undefined ? { ask } : {}),
            causeEventId: req.causeEventId,
        });
        if (countered.rejection) return fail(countered.rejection.message);
        contract = countered.state;
        persist(world, contract);
        const askClause = ask !== undefined ? `，並要在總價外加碼 ${formatMoney(data, ask)}` : '';
        return {
            ok: true,
            publicLines: [`${actorName}就「${c.label}」當面還價：『${cmd.demand.trim()}』${askClause}——${accountLabel(contract, c.proposerAccountId)}的回話要等明晨`],
        };
    }

    if (cmd.action === 'contract_reject') {
        if (!contractParties.has(req.actorId)) {
            return fail(`「${c.label}」只有當事人（${partyNames}）能拒簽；${actorName}若有意見，該做的是還價或勸人`);
        }
        const rejected = rejectContract(contract, { contractId, actorId: req.actorId, causeEventId: req.causeEventId });
        if (rejected.rejection) return fail(rejected.rejection.message);
        contract = rejected.state;
        persist(world, contract);
        syncContractObject(world, data, contract, contractId, req.witnessIds);
        return {
            ok: true,
            publicLines: [`${actorName}當面拒簽「${c.label}」；${formatMoney(data, c.total)}預付款原封退回${accountLabel(contract, c.proposerAccountId)}`],
        };
    }

    if (cmd.action === 'contract_sign') {
        if (!contractParties.has(req.actorId)) {
            return fail(`「${c.label}」的筆只在當事人（${partyNames}）手裡；${actorName}簽不了別人的約`);
        }
        // a redundant signature on a done deal is confirmation, not a crime —
        // killing the beat over it rolled back a settled contract in v16 live
        if (c.status === 'settled' && c.signedBy.includes(req.actorId)) {
            return { ok: true, publicLines: [`${actorName}又按了按「${c.label}」——墨跡已乾，約早生效無誤`] };
        }
        const signed = signContract(contract, { contractId, signerId: req.actorId, causeEventId: req.causeEventId });
        if (signed.rejection) return fail(signed.rejection.message);
        contract = signed.state;
        const lines = [`${actorName}在「${c.label}」上署名`];
        // the FINAL required signature settles the splits atomically, then and there
        if (readyToSettle(contract.contracts[contractId])) {
            const settled = settleContract(contract, { contractId, causeEventId: req.causeEventId });
            if (settled.rejection) return fail(settled.rejection.message);
            contract = settled.state;
            lines.push(
                `「${c.label}」即時生效，預付款分訖：` +
                settled.applied.map((t: EconomyTransaction) => `${accountLabel(contract, t.to)}得${formatMoney(data, t.amount)}`).join('、'),
            );
        }
        persist(world, contract);
        syncContractObject(world, data, contract, contractId, req.witnessIds);
        // a settled SPONSORSHIP now lands its world effect — consent made it real
        const sponsorship = (data.sponsorships ?? {})[contractId];
        if (sponsorship && contract.contracts[contractId].status === 'settled') {
            const item = data.catalog.find((candidate) => candidate.id === sponsorship.itemId);
            if (!item) throw new Error(`[economy] sponsorship ${contractId} names unknown catalog item ${sponsorship.itemId}`);
            applyCatalogEffect(world, item, req);
            lines.push(`${actorName}點了頭，「${item.label}」落定成真`);
        }
        return { ok: true, publicLines: lines };
    }

    return fail(`不認得這種銀錢動作：${(cmd as { action?: string }).action ?? '?'}`);
}

/** The character a purchase's effect lands on, when that is not the buyer. */
function sponsorshipBeneficiary(world: WorldState, item: SeasonCatalogItem): string | undefined {
    if ((item.effect.kind !== 'move-home' && item.effect.kind !== 'tenancy') || !item.effect.characterName) return undefined;
    return world.idByName(item.effect.characterName);
}

function applyCatalogEffect(world: WorldState, item: SeasonCatalogItem, req: CommitEconomyCommandRequest): void {
    const effect = item.effect;
    if (effect.kind === 'relieve-hunger') {
        const member = world.castById(req.actorId);
        if (member) member.state.hunger = Math.max(0, member.state.hunger - 0.6);
        return;
    }
    if (effect.kind === 'object-state') {
        touchObject(
            world,
            effect.objectId,
            effect.state,
            req.witnessIds,
            effect.stateTags,
        );
        return;
    }
    if (effect.kind === 'move-home') {
        const scene = world.data.scenes.find((candidate) => candidate.name === effect.sceneName);
        if (!scene) throw new Error(`[economy] catalog item ${item.id} moves home to unknown scene ${effect.sceneName}`);
        const targetId = effect.characterName ? world.idByName(effect.characterName) : req.actorId;
        if (!targetId) throw new Error(`[economy] catalog item ${item.id} rehouses unknown character ${effect.characterName}`);
        world.data.homeByChar[targetId] = scene.id;
        return;
    }
    if (effect.kind === 'tenancy') {
        const scene = world.data.scenes.find((candidate) => candidate.name === effect.sceneName);
        if (!scene) throw new Error(`[economy] catalog item ${item.id} leases an unknown scene ${effect.sceneName}`);
        const targetId = effect.characterName ? world.idByName(effect.characterName) : req.actorId;
        if (!targetId) throw new Error(`[economy] catalog item ${item.id} leases to unknown character ${effect.characterName}`);
        if (world.objectById(effect.keyObjectId)) throw new Error(`[economy] lease object ${effect.keyObjectId} already exists`);
        // the lease is handed to the tenant as a real carried object; the home
        // itself does not change until they arrive at the room carrying it.
        (world.data.objects ??= []).push({
            id: effect.keyObjectId,
            label: effect.keyLabel,
            aliases: [effect.keyLabel, '租契', '鑰匙'],
            sceneId: world.data.roster[targetId],
            portable: true,
            visibility: 'visible',
            carriedBy: targetId,
            state: `已賃定【${effect.sceneName}】；帶著它遷入之日起，那裡才是家`,
            version: 0,
            knownBy: [...req.witnessIds, targetId],
        });
        const data = world.data.economy!;
        (data.tenancies ??= {})[effect.keyObjectId] = { characterId: targetId, sceneName: effect.sceneName };
        return;
    }
    const scene = world.data.scenes.find((candidate) => candidate.name === effect.sceneName);
    if (!scene) throw new Error(`[economy] catalog item ${item.id} spawns object in unknown scene ${effect.sceneName}`);
    (world.data.objects ??= []).push({
        id: effect.objectId,
        label: effect.label,
        aliases: [...new Set([effect.label, ...(effect.aliases ?? [])])],
        sceneId: scene.id,
        portable: false,
        visibility: 'visible',
        state: effect.state,
        ...(world.data.strictStructured && effect.stateTags?.length
            ? { stateTags: [...new Set(effect.stateTags)] }
            : {}),
        version: 0,
        knownBy: [...req.witnessIds],
    });
}

/**
 * A beat that rewrites a contract-linked object's STATE must carry the
 * matching contract command — otherwise prose could "sign" the paper while
 * the ledger still says offered (the exact v14 failure). Ordinary physical
 * handling (pick up, hand over, put away, even destroy) stays free: moving
 * the paper is world physics; only its signature state belongs to the ledger.
 * Throws to trigger a replan.
 */
export function enforceContractCommandPairing(
    world: WorldState,
    effects: Array<{ objectId: string; state?: string }> | undefined,
    commands: BeatEconomyCommand[] | undefined,
): void {
    const data = world.data.economy;
    if (!data || !effects?.length) return;
    for (const [contractId, objectId] of Object.entries(data.contractObjectIds)) {
        const stateBearing = effects.some((effect) => effect.objectId === objectId && effect.state !== undefined);
        if (!stateBearing) continue;
        const paired = (commands ?? []).some((command) => command.contractId === contractId);
        if (!paired) {
            const label = data.contracts[contractId]?.label ?? contractId;
            throw new Error(
                `[economy] 「${label}」的簽署狀態由帳本決定：要簽、拒、填搭檔，用 economyCommands` +
                `（contract_sign／contract_reject／contract_fill_partner，contractId=${contractId}）。` +
                '拿起、遞交、收放這張紙不必帶帳務命令，但也不可自行改寫它的 state 欄——把 state 留空即可',
            );
        }
    }
}

// ── 借賒有據 (creditVerbs): consent seat input + 亮牌 gate + 欠條生怨 ──

/**
 * Assemble the LENDER's consent-seat input for a beat's `borrow` command —
 * called by the dispatcher (tick onBeat) BEFORE the pure commit, so the async
 * decideLend seat stays outside commitEconomyCommand. Returns null when the
 * command would not validate anyway (flag off / bad name / not co-present /
 * non-positive) — the commit then fails with its own precise reason and no
 * seat call is wasted. The seat READS numbers (balance / debt in whole 圓),
 * never computes one (LLM 永不碰數字).
 */
export function buildLendSeatInput(
    world: WorldState,
    req: { actorId: string; sceneId: string; command: BeatEconomyCommand },
): CharacterAgentNs.LendDecideInput | null {
    const data = world.data.economy;
    const cmd = req.command;
    if (!data || cmd.action !== 'borrow') return null;
    if (!cmd.toName || !cmd.amountYuan || cmd.amountYuan <= 0 || !Number.isInteger(cmd.amountYuan)) return null;
    const lenderId = world.idByName(cmd.toName);
    const lender = lenderId ? world.castById(lenderId) : undefined;
    if (!lenderId || !lender || lenderId === req.actorId) return null;
    if (world.data.roster[lenderId] !== req.sceneId) return null;
    const borrower = world.castById(req.actorId);
    const per = BigInt(data.subunitsPerUnit);
    const account = data.state.accounts[lenderId];
    let existingDebt = 0n;
    for (const bill of data.bills ?? []) {
        if (bill.fromAccountId !== req.actorId || bill.toAccountId !== lenderId) continue;
        const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        if (remaining > 0n) existingDebt += remaining;
    }
    const tie = lender.relationshipView[req.actorId] ?? world.data.edges[lenderId]?.[req.actorId]?.tone;
    return {
        lenderName: lender.name,
        lenderRole: lender.role ?? '—',
        lenderBalanceYuan: account ? Number(BigInt(account.available) / per) : 0,
        // 相識分寸: the lender hears the asker AS THEY know them.
        borrowerName: world.perceivedName(lenderId, req.actorId),
        borrowerRole: borrower?.role ?? '—',
        amountYuan: cmd.amountYuan,
        dueDays: clampLoanDueDays(cmd.dueDays),
        ...(cmd.memo ? { memo: cmd.memo } : {}),
        ...(tie ? { tieTowardBorrower: tie } : {}),
        existingDebtYuan: Number(existingDebt / per),
    };
}

/**
 * 亮牌 gate for the credit verbs: which of borrow/repay the beat prompt should
 * advertise to THIS actor in THIS scene. `borrow` needs a co-present cast
 * member to ask; `repay` needs an open 欠條 whose creditor is co-present.
 * undefined when the flag is off / no economy / nobody to deal with — the
 * beat prompt then stays byte-identical to before.
 */
export function creditAdvertFor(
    world: WorldState,
    characterId: string,
    copresentIds: readonly string[],
): { borrow?: boolean; repay?: boolean } | undefined {
    const data = world.data.economy;
    if (!data) return undefined;
    const others = copresentIds.filter((id) => id !== characterId && !!world.castById(id));
    if (!others.length) return undefined;
    const repay = (data.bills ?? []).some((bill) =>
        bill.fromAccountId === characterId &&
        !!bill.toAccountId && others.includes(bill.toAccountId) &&
        BigInt(bill.amountSubunits) > BigInt(bill.paidSubunits));
    return { borrow: true, ...(repay ? { repay: true } : {}) };
}

/** One overdue-debt want the settle should try to spawn (dedup by `marker`). */
export interface OverdueDebtWantSeed {
    characterId: string;
    /** Structured counterparty; avoids recovering the target from prose. */
    targetId?: string;
    layer: string;
    desc: string;
    /** Stable dedup marker (`${billId}:debtor` / `${billId}:creditor`); pushed
     *  into `data.debtWantsSpawned` by the caller ONLY when the want actually
     *  spawned, so a budget-rejected spawn retries at the next settle. */
    marker: string;
}

/**
 * 欠條生怨 — after the settle's bill chase, every OVERDUE 欠條 (day ≥ dueDay,
 * still owing) between two CAST characters stirs both hearts: the debtor a
 * 虧欠-layer want toward the creditor, the creditor a 催討-layer want toward
 * the debtor — once per bill per side (markers). Vendor (business) bills spawn
 * the debtor side ONLY when the business maps cleanly to a single cast owner
 * (its sole authorized spender); 前街食肆 declares none, so its 賒帳 stays on
 * the books without a want. Pure read aside from nothing — the caller spawns
 * and marks. Flag off ⇒ [] (byte-compat: an overdue 租金 bill between cast
 * spawns nothing, exactly as before).
 */
export function collectOverdueDebtWants(world: WorldState, day: number): OverdueDebtWantSeed[] {
    const data = world.data.economy;
    if (!data?.bills?.length) return [];
    const spawned = new Set(data.debtWantsSpawned ?? []);
    const per = BigInt(data.subunitsPerUnit);
    const yuanText = (amount: bigint): string => {
        const whole = amount / per;
        const rest = amount % per;
        return rest === 0n ? `${whole}圓` : `${whole}圓${rest}分`;
    };
    const out: OverdueDebtWantSeed[] = [];
    for (const bill of data.bills) {
        const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        if (remaining <= 0n || day < bill.dueDay) continue;
        const debtor = bill.fromAccountId ? world.castById(bill.fromAccountId) : undefined;
        if (!debtor) continue; // only a CAST debtor carries 虧欠; establishment debts stay on the books
        const creditor = bill.toAccountId ? world.castById(bill.toAccountId) : undefined;
        if (creditor) {
            if (!spawned.has(`${bill.id}:debtor`)) {
                out.push({
                    characterId: debtor.id,
                    targetId: creditor.id,
                    layer: '虧欠',
                    desc: `欠著${creditor.name}的${yuanText(remaining)}過了期，見面都矮半截`,
                    marker: `${bill.id}:debtor`,
                });
            }
            if (!spawned.has(`${bill.id}:creditor`)) {
                out.push({
                    characterId: creditor.id,
                    targetId: debtor.id,
                    layer: '催討',
                    desc: `${debtor.name}欠的${yuanText(remaining)}到期未還，這口氣咽不平`,
                    marker: `${bill.id}:creditor`,
                });
            }
            continue;
        }
        // vendor bill: debtor side only, and only via a clean single-owner mapping.
        const account = bill.toAccountId ? data.state.accounts[bill.toAccountId] : undefined;
        if (!account || account.ownerType !== 'business') continue;
        const owners = account.authorizedSpenderIds.filter((id) => !!world.castById(id));
        if (owners.length !== 1) continue;
        if (!spawned.has(`${bill.id}:debtor`)) {
            out.push({
                characterId: debtor.id,
                layer: '虧欠',
                desc: `欠著${world.nameById(owners[0])}的${yuanText(remaining)}過了期，見面都矮半截`,
                marker: `${bill.id}:debtor`,
            });
        }
    }
    return out;
}

// ── percept projection (knowledge- and authority-scoped) ──

/** runway in days for an account given its balance and daily burn (mirrors
 *  the economy core's balance/net-burn division; null = indefinitely). */
function runwayLine(data: SeasonEconomyData, available: bigint, dailyCost: bigint): string {
    if (dailyCost <= 0n) return '';
    const days = available / dailyCost;
    return `，照此可撐約 ${days} 日`;
}

/**
 * sceneId → the cheapest location-anchored meal sold there. A "food scene" is a
 * scene where a `kind:'meal'` catalog item carrying an explicit `sceneName` is
 * sold (餓了去食肆買東西吃) — the anchor a hungry character can be pulled to and
 * fed at. Meals with NO sceneName are buyable-anywhere and are NOT location food,
 * so a seed whose meals are all unanchored yields an EMPTY map and the hunger
 * driver stays completely inert for it. Pure read (no ledger restore).
 */
export function foodScenesOf(world: WorldState): Map<string, SeasonCatalogItem> {
    const out = new Map<string, SeasonCatalogItem>();
    const data = world.data.economy;
    if (!data) return out;
    for (const item of data.catalog) {
        if (item.kind !== 'meal' || !item.sceneName) continue;
        const scene = world.data.scenes.find((candidate) => candidate.name === item.sceneName);
        if (!scene) continue; // a sceneName that resolves to no real scene is inert
        const existing = out.get(scene.id);
        if (!existing || BigInt(item.priceSubunits) < BigInt(existing.priceSubunits)) {
            out.set(scene.id, item); // keep the cheapest when several are sold there
        }
    }
    return out;
}

export function economyPerceptFor(world: WorldState, characterId: string, sceneId?: string): string | undefined {
    const parsed = live(world);
    if (!parsed) return undefined;
    const { data, contract } = parsed;
    const me = contract.economy.accounts[characterId];
    const lines: string[] = ['【銀錢帳（唯一真相）】'];
    if (me) {
        lines.push(`你身上有 ${formatMoney(data, me.available)}；每日食宿約 ${formatMoney(data, me.dailyFixedCost)}${runwayLine(data, me.available, me.dailyFixedCost)}。`);
        // one's own same-day outgoing — the guard against re-paying a gap
        // already plugged (a donor once covered the same rent five times over)
        const today = world.data.clock.day;
        const outToday = contract.economy.ledger.filter((txn) =>
            txn.day === today && txn.from === characterId && (txn.kind === 'transfer' || txn.kind === 'purchase'));
        if (outToday.length) {
            let total = 0n;
            for (const txn of outToday) total += txn.amount;
            const detail = outToday.map((txn) => `${formatMoney(data, txn.amount)}（${txn.memo.includes('|') ? txn.memo.split('|')[1] : txn.memo}，給${accountLabel(contract, txn.to)}）`).join('、');
            lines.push(`你今日已出帳共 ${formatMoney(data, total)}：${detail}。同一筆缺口不必重複去填。`);
        }
        // 借賒有據 — one's own open 欠條 (both directions, with due days) ride
        // every money percept: a debtor should KNOW they owe. 借賒有據已常駐——
        // 欠條在利害簡報裡照例現身（不再由旗標控制）。
        {
            const today = world.data.clock.day;
            for (const bill of data.bills ?? []) {
                const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
                if (remaining <= 0n) continue;
                if (bill.fromAccountId === characterId && bill.toAccountId) {
                    const holder = accountLabel(contract, bill.toAccountId);
                    const due = today > bill.dueDay ? '已過了期，臉上須掛不住' : `第 ${bill.dueDay} 日為期`;
                    lines.push(`你欠著${holder} ${formatMoney(data, remaining)}（${bill.label}），${due}——到期會照例催討；手頭便時可當面還帳（repay）。`);
                } else if (bill.toAccountId === characterId && bill.fromAccountId) {
                    const debtor = accountLabel(contract, bill.fromAccountId);
                    const due = today > bill.dueDay ? '已到期未清' : `第 ${bill.dueDay} 日為期`;
                    lines.push(`${debtor}欠著你 ${formatMoney(data, remaining)}（${bill.label}），${due}。`);
                }
            }
        }
    }
    const troupe = contract.economy.accounts[data.troupeAccountId];
    if (troupe) {
        // did the LAST settled payday come up short? Everyone FEELS a light pay
        // packet — that experience, not the treasury figure, is what they know.
        const lastSettled = contract.economy.settledDays.length ? Math.max(...contract.economy.settledDays) : null;
        const myWage = data.wages.find((wage) => wage.accountId === characterId);
        const myLastWage = lastSettled !== null && myWage
            ? contract.economy.ledger
                .filter((txn) => txn.kind === 'wage' && txn.day === lastSettled && txn.to === characterId)
                .reduce((sum, txn) => sum + txn.amount, 0n)
            : null;
        const wageCameShort = myWage !== undefined && lastSettled !== null && (myLastWage ?? 0n) < BigInt(myWage.amountSubunits);
        if (maySpend(troupe, characterId)) {
            lines.push(`${troupe.label}現有 ${formatMoney(data, troupe.available)}；每日${data.troupeCostNote ?? '開銷'} ${formatMoney(data, troupe.dailyFixedCost)}${runwayLine(data, troupe.available, troupe.dailyFixedCost)}。你有權核准班庫用度（fromAccount:"troupe"）。`);
            lines.push('班庫若見底，這班就得散——全班的工錢、鋪位與營生，都懸在你手裡這本帳上。');
            for (const bill of data.bills ?? []) {
                const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
                if (remaining <= 0n) continue;
                const due = world.data.clock.day > bill.dueDay ? '已逾期，正被催討' : `第 ${bill.dueDay} 日夜裡到期`;
                lines.push(`帳期在身：${bill.label} ${formatMoney(data, remaining)}，${due}（${bill.creditor ?? data.shortfallCreditor ?? '債主'}）。`);
            }
        } else {
            const approvers = troupe.authorizedSpenderIds.map((id) => world.nameById(id)).join('、');
            lines.push(`你無權動用${troupe.label}；核准權在${approvers || '班主'}手上。`);
            if (myWage) {
                // Whose books does this person's keep actually hang on? A troupe
                // hand → the 班庫; a 歌女 of 長三堂子 / 記者 of 申報館 → their OWN house.
                const employerId = myWage.fromAccountId ?? data.troupeAccountId;
                const employer = contract.economy.accounts[employerId];
                if (employerId === data.troupeAccountId) {
                    lines.push(wageCameShort
                        ? '昨日班中俸已經發不足——這班眼看撐不了幾日；真散了班，你的工錢、鋪位與營生一併沒了，得各自另尋出路。'
                        : `你的工錢喫住都繫在${troupe.label.replace('班庫', '')}這一班：班若散了，戲散人散，各自另尋營生。`);
                } else if (employer) {
                    lines.push(wageCameShort
                        ? `${employer.label}上回的例錢已發不足，你這營生也不比從前穩了。`
                        : `你的工錢喫住繫在${employer.label}，與春雪社的班庫無干。`);
                }
            }
        }
    }
    for (const c of Object.values(contract.contracts)) {
        const splits = c.splits
            .map((split) => {
                const target = split.beneficiary === PARTNER_SLOT
                    ? (c.partnerSlot.filledBy ? accountLabel(contract, c.partnerSlot.filledBy) : '聯名搭檔')
                    : accountLabel(contract, split.beneficiary);
                return `${target}得 ${formatMoney(data, split.amount)}`;
            })
            .join('、');
        if (c.status === 'offered') {
            const partner = c.partnerSlot.required ? `；聯名搭檔欄：${c.partnerSlot.filledBy ? accountLabel(contract, c.partnerSlot.filledBy) : '空白'}` : '';
            const waiting = pendingSigners(c).map((id) => accountLabel(contract, id)).join('、');
            lines.push(`「${c.label}」（contractId=${c.id}，白紙黑字，人人可查）：若成立——${splits}；限第 ${c.deadlineDay} 日夜裡截止${partner}；尚欠署名：${waiting || '（只欠搭檔欄）'}。`);
            if (c.terms.length) lines.push(`約中條款：${c.terms.join('；')}。`);
            // deadline-day time arithmetic: the schedule is a WORLD FACT. Three
            // runs showed agents know the deadline but cannot sequence a night
            // (v17: both leads burned 黃昏..深宵 on the paper, lost the show AND
            // the signature). State the hours; the choice stays theirs.
            if (c.deadlineDay === world.data.clock.day) {
                const partIndex = PARTS_OF_DAY.indexOf(world.data.clock.partOfDay);
                const remaining = Math.max(0, (PARTS_OF_DAY.length - 1) - partIndex);
                lines.push(
                    `「${c.label}」限期就在今夜子夜（深宵之末）；此刻${world.data.clock.partOfDay}，今夜還餘 ${remaining} 個時辰` +
                    (data.performance && partIndex <= 3 ? '——開鑼在黃昏，戲散之後入夜、深宵仍來得及到紙前落筆。' : '。'),
                );
            }
            if (c.pendingCounter) {
                lines.push(`還價待覆：${accountLabel(contract, c.pendingCounter.byId)}所提『${c.pendingCounter.demand}』，${accountLabel(contract, c.proposerAccountId)}明晨回話。`);
            }
            const isParty = c.requiredSignerIds.includes(characterId) || c.partnerSlot.filledBy === characterId;
            if (isParty) {
                const counterHint = c.pendingCounter ? '' : '、contract_counter 還價（demand 寫你要的條款，對方明晨回話；還價若要對方加碼銀錢，demand 之外再標 askYuan＝整數圓）';
                lines.push(`你是這份契約的當事人：可 contract_sign 簽署、contract_reject 拒簽${c.requiredSignerIds.includes(characterId) && c.partnerSlot.required && !c.partnerSlot.filledBy ? '、contract_fill_partner 填上唯一聯名搭檔' : ''}${counterHint}。`);
            } else if (c.negotiatorIds.includes(characterId)) {
                lines.push(c.pendingCounter
                    ? `你是受益方當家，可就此約還價——但眼下已有一則還價待覆，等回話再說。`
                    : `你雖非簽署人，但受益方的家當繫在此約上：可 contract_counter 還價（demand 寫你要的條款；要對方加碼銀錢則另標 askYuan＝整數圓）；簽與拒只在${[...new Set(c.requiredSignerIds.map((id) => accountLabel(contract, id)))].join('、')}手裡。`);
            }
        } else {
            const outcome = c.status === 'settled' ? `已簽署生效，款項分訖（${splits}）` : c.status === 'rejected' ? '已拒簽，預付款退回' : '已逾期失效，預付款收回';
            lines.push(`「${c.label}」${outcome}。`);
        }
    }
    if (data.performance) {
        const part = world.data.clock.partOfDay;
        if (part === '清晨' || part === '日午' || part === '晡時' || part === '黃昏') {
            const perf = data.performance;
            const isLead = perf.leadIds.includes(characterId);
            // 戲佔定檔: 黃昏是開鑼此刻——present-tense「人正該在臺上」；白日則預告
            // 黃昏、入夜這兩格是釘死的戲檔，別把別的事壓上去。
            const head = part === '黃昏'
                ? `此刻正是【${perf.venueSceneName}】開鑼的時辰${isLead ? `——你是領銜，這一格是你的戲，人得在臺上、不是辦別的事的時候` : `（領銜：${perf.leadIds.map((id) => world.nameById(id)).join('、')}）`}；`
                : `今日黃昏【${perf.venueSceneName}】開鑼、演到入夜${isLead ? `——你是領銜，${SHOW_ONSTAGE_LABEL}這兩格是你的戲檔，你不上台這戲就塌` : `（領銜：${perf.leadIds.map((id) => world.nameById(id)).join('、')}）`}；`;
            lines.push(
                head +
                `到場不足 ${perf.minCast} 人停鑼、票房歸零，白日到台上排過戲今夜才叫得動座。票房是班庫唯一的活水。`,
            );
            // Box-office 利害: when the takings are shared, tell each troupe player
            // their PERSONAL stake in tonight's house — leads carry double weight.
            // Gated to troupe players (a lead, or someone on the 班庫 payroll): a
            // non-troupe house's people (金鳳 of 長三堂子, 方競西 of 申報館) get no cut,
            // so no cut-line. The full-house figures are illustrative estimates
            // over the troupe roster; the real split settles on who takes the stage.
            const bps = perf.castShareBps ?? 0;
            const drawsTroupeWage = data.wages.some((wage) =>
                wage.accountId === characterId && (wage.fromAccountId ?? data.troupeAccountId) === data.troupeAccountId);
            if (bps > 0 && (isLead || drawsTroupeWage)) {
                const fullCastShare = (BigInt(perf.fullHouseSubunits) * BigInt(bps)) / 10000n;
                const troupePlayerIds = new Set<string>(perf.leadIds);
                for (const wage of data.wages) {
                    if ((wage.fromAccountId ?? data.troupeAccountId) === data.troupeAccountId) troupePlayerIds.add(wage.accountId);
                }
                let estWeight = 0n;
                for (const id of troupePlayerIds) estWeight += perf.leadIds.includes(id) ? 2n : 1n;
                const perHead = estWeight > 0n ? fullCastShare / estWeight : 0n;
                lines.push(isLead
                    ? `你是今晚的台柱，滿座你這一路約可分得 ${formatMoney(data, perHead * 2n)}，缺你這台戲就塌、一文沒有。`
                    : `上台就有份：滿座票房登台眾人分 ${formatMoney(data, fullCastShare)}（你這一份約 ${formatMoney(data, perHead)}），你到場才分得到，停鑼則全泡湯。`);
            }
        }
    }
    for (const [keyObjectId, tenancy] of Object.entries(data.tenancies ?? {})) {
        if (tenancy.characterId !== characterId) continue;
        const key = world.objectById(keyObjectId);
        if (!key || key.visibility === 'destroyed') continue;
        lines.push(`你已賃定【${tenancy.sceneName}】的屋子（${key.label}${key.carriedBy === characterId ? '在你身上' : `在${world.sceneNameById(key.sceneId)}`}）；何時遷入、帶什麼走，由你——人帶著契到了那裡，家才算搬。`);
    }
    // hunger as a driver: when the belly presses and a meal can be had at a NAMED
    // spot, state WHERE and for HOW MUCH — a fact the character may act on (go
    // eat), never an order. Empty when no meal is location-anchored, so a seed
    // without a food spot shows nothing new here.
    const myHunger = world.castById(characterId)?.state.hunger ?? 0;
    if (myHunger > 0.5) {
        const spots = [...foodScenesOf(world)]
            .map(([foodSceneId, item]) => `【${world.sceneNameById(foodSceneId)}】一份${item.label} ${formatMoney(data, BigInt(item.priceSubunits))}`)
            .join('；');
        if (spots) lines.push(`腹中已餓，可就食之處：${spots}——去那兒便買著吃。`);
    }
    if (me) {
        const here = sceneId ? world.sceneNameById(sceneId) : undefined;
        const buyable = data.catalog.filter((item) => {
            if (item.sceneName && here && item.sceneName !== here) return false;
            if (item.unique && contract.economy.ledger.some((t) => t.kind === 'purchase' && t.memo.startsWith(`${item.id}|`))) return false;
            if (item.unique && Object.entries(data.sponsorships ?? {}).some(([cid, s]) =>
                s.itemId === item.id && (contract.contracts[cid]?.status === 'settled' || contract.contracts[cid]?.status === 'offered'))) return false;
            return true;
        });
        if (buyable.length) {
            lines.push(`本處現錢可辦（economyCommands 用 itemId）：${buyable.map((item) => {
                const beneficiaryId = sponsorshipBeneficiary(world, item);
                const consent = beneficiaryId && beneficiaryId !== characterId ? `；出資後須${world.nameById(beneficiaryId)}本人點頭才作數` : '';
                // 賒帳 note (creditVerbs): the vendor extends tab — flag off ⇒
                // the listing is byte-identical to before.
                const tabNote = item.vendorAccountId && data.vendorTabs?.[item.vendorAccountId]
                    ? '；銀錢不趁手也可賒，記帳'
                    : '';
                return `${item.id}＝${item.label}（${formatMoney(data, BigInt(item.priceSubunits))}${consent}${tabNote}）`;
            }).join('／')}。`);
        }
    }
    return lines.join('\n');
}

// ── tenancy move-in physics ──

export interface TenancyMoveIn {
    characterId: string;
    fromSceneName: string;
    toSceneName: string;
    /** objective canon line for the day log / next-morning notice. */
    line: string;
}

/**
 * The move-in rule: a granted lease becomes a HOME the moment the tenant is
 * physically at the leased room carrying the lease. Getting there — and what
 * they packed along (carried objects travel with them) — was their own choice;
 * this only commits the objective consequence. Runs after the movement phase.
 */
export function settleTenancyMoveIns(world: WorldState): TenancyMoveIn[] {
    const data = world.data.economy;
    if (!data?.tenancies) return [];
    const moves: TenancyMoveIn[] = [];
    for (const [keyObjectId, tenancy] of Object.entries(data.tenancies)) {
        const scene = world.data.scenes.find((candidate) => candidate.name === tenancy.sceneName);
        const key = world.objectById(keyObjectId);
        if (!scene || !key || key.visibility === 'destroyed') continue;
        if (key.carriedBy !== tenancy.characterId) continue;
        if (world.data.roster[tenancy.characterId] !== scene.id) continue;
        if (world.data.homeByChar[tenancy.characterId] === scene.id) continue;
        const fromSceneName = world.sceneNameById(world.data.homeByChar[tenancy.characterId]);
        world.data.homeByChar[tenancy.characterId] = scene.id;
        key.state = `已憑契遷入【${tenancy.sceneName}】；舊居已退租`;
        key.version += 1;
        delete data.tenancies[keyObjectId];
        const carried = (world.data.objects ?? [])
            .filter((object) => object.carriedBy === tenancy.characterId && object.id !== keyObjectId && object.visibility !== 'destroyed')
            .map((object) => object.label);
        moves.push({
            characterId: tenancy.characterId,
            fromSceneName,
            toSceneName: tenancy.sceneName,
            line: `${world.nameById(tenancy.characterId)}憑租契遷入【${tenancy.sceneName}】，${fromSceneName}的舊屋退了租` +
                (carried.length ? `；隨身帶來的有：${carried.join('、')}` : '；隨身只有那紙租契'),
        });
    }
    return moves;
}

// ── the nightly show：排戲在白日，開鑼在黃昏，票房是收入面 ──

export interface PerformanceOutcome {
    performed: boolean;
    /** objective line for the day log / world event. */
    line: string;
    takingsSubunits?: bigint;
    /** what the troupe banked this night (takings minus the cast's cut). */
    troupeShareSubunits?: bigint;
    /** what the performers on the boards shared between them this night. */
    castShareSubunits?: bigint;
    /** 看客約 N 人 — the paying house as a real figure (houseSeats × pct/100).
     *  Only set when the frame opts into `audienceHouse`; absent otherwise. */
    audience?: number;
}

/** The troupe leader (班主): the first authorized spender on the 班庫 account —
 *  the same authority the box-office percept names as the treasury's approver.
 *  undefined when the world has no economy or no authorized spender is seeded.
 *  Reads the persisted state directly (no ledger restore). */
export function troupeLeaderId(world: WorldState): string | undefined {
    const data = world.data.economy;
    if (!data) return undefined;
    return data.state.accounts[data.troupeAccountId]?.authorizedSpenderIds[0];
}

/** The troupe players: a performance lead, or anyone drawing a wage out of the
 *  班庫 (fromAccountId defaults to the troupe). This is the SAME membership signal
 *  the box-office percept uses to decide who has a personal stake in the night's
 *  house — reused so the 班主's rehearsal pull lands on exactly the troupe. Empty
 *  set when the world has no economy. */
export function troupePlayerIds(world: WorldState): Set<string> {
    const data = world.data.economy;
    const ids = new Set<string>();
    if (!data) return ids;
    for (const id of data.performance?.leadIds ?? []) ids.add(id);
    for (const wage of data.wages) {
        if ((wage.fromAccountId ?? data.troupeAccountId) === data.troupeAccountId) ids.add(wage.accountId);
    }
    return ids;
}

// 戲佔定檔 —— 一場戲佔的「臺上時段」：黃昏開鑼、演到入夜。演員規劃當日時，這兩格
// 是釘死的檔期，別的事得排到別的時辰。這是一個定義好的 DURATION，不是一閃即過的
// 黃昏瞬間——票房仍在黃昏開鑼那一拍結算，但演員的檔期覆蓋整段戲。
export const SHOW_ONSTAGE_PARTS: readonly number[] = [3, 4]; // 黃昏、入夜
const SHOW_ONSTAGE_LABEL = SHOW_ONSTAGE_PARTS.map((i) => PARTS_OF_DAY[i]).join('、');

/** 規劃避讓 —— the PLAN-time duty line for a lead/troupe player when a performance
 *  stands: it names the committed on-stage 時段 (黃昏、入夜) as a fixed booking so the
 *  character reserves them and schedules everything else (personal wants, love, debts)
 *  AROUND the show — 清晨/日午/晡時 before, or 深宵 after. This is the answer to
 *  「角色規劃時要能判斷哪些時段不能安排」: the show is a known block, stated as a fact,
 *  the choice of how to fill the rest stays theirs. Undefined when no performance
 *  stands, or the member is not on tonight's bill. */
export function performanceDutyLine(world: WorldState, characterId: string): string | undefined {
    const perf = world.data.economy?.performance;
    if (!perf) return undefined;
    const isLead = perf.leadIds.includes(characterId);
    if (!isLead && !troupePlayerIds(world).has(characterId)) return undefined;
    return (
        `【定檔】明日【${perf.venueSceneName}】${SHOW_ONSTAGE_LABEL}是開鑼到散戲的檔期——` +
        `${isLead ? '你是領銜，' : '你當班，'}這兩個時段你人在臺上、挪不動；` +
        `要辦的別的事（心事、舊帳、私會），趁清晨、日午、晡時，或散戲後的深宵去安排，別壓著這兩格。`
    );
}

/** Bank who showed up to rehearse (日午/晡時 at the venue). Quality is earned
 *  in daylight; an unrehearsed evening plays to a thinner house. */
export function bankRehearsalAttendance(world: WorldState, partIndex: number): void {
    const perf = world.data.economy?.performance;
    if (!perf || (partIndex !== 1 && partIndex !== 2)) return;
    const venue = world.data.scenes.find((scene) => scene.name === perf.venueSceneName);
    if (!venue) return;
    for (const member of world.data.cast) {
        if (world.data.roster[member.id] === venue.id && !perf.rehearsedToday.includes(member.id)) {
            perf.rehearsedToday.push(member.id);
        }
    }
}

/** SKILL_HOUSE_CAP — the ceiling on how much fuller a night's house can play
 *  for on-stage talent (名角滿座). At most +40%, so a troupe of masters can't
 *  swell the house without bound: takings stay bounded and conservation holds
 *  by construction (the takings still enter as external-in, same as always). */
export const SKILL_HOUSE_CAP = 40;

/**
 * 名角滿座 — the third box-office hang point. How much fuller tonight's house
 * plays for the STAGE CRAFT (唱/身) of the performers actually on the boards,
 * as a conservation-safe pct the settle folds into the house draw exactly like
 * the object boosts. Each PRESENT performer contributes their BEST stage-skill
 * level (max over skills whose `kind ∈ STAGE_KINDS`; missing `level` = 0; a
 * performer with no stage skill contributes 0); the sum across performers is
 * capped at SKILL_HOUSE_CAP so a full troupe of 名角 lifts — but never mints —
 * the house. Pure + deterministic: skills are static authored data, so the
 * settle stays replayable. NUMBERS live only in the ledger math here — never a
 * prompt. Returns 0 when no present performer carries a stage skill, so a
 * skill-less cast settles byte-for-byte as before (full backward-compat).
 */
export function performerSkillBoostPct(world: WorldState, presentMemberIds: string[]): number {
    let total = 0;
    for (const id of presentMemberIds) {
        const skills = world.castById(id)?.skills;
        if (!skills?.length) continue;
        let best = 0;
        for (const skill of skills) {
            if (!(STAGE_KINDS as readonly string[]).includes(skill.kind)) continue;
            const level = skill.level ?? 0;
            if (level > best) best = level;
        }
        total += best;
    }
    return Math.min(total, SKILL_HOUSE_CAP);
}

/** RENOWN_HOUSE_CAP — the ceiling on how much fuller a night's house can play
 *  for the billed leads' public 名頭 (名頭引座). At most +30%, so even a bill of
 *  當紅名角 can't swell the house without bound: takings stay bounded and
 *  conservation holds by construction (the takings still enter as external-in,
 *  same as always). */
export const RENOWN_HOUSE_CAP = 30;

/**
 * 名頭引座 — how much fuller tonight's house plays for the public 名頭 of the
 * leads actually on the boards, as a conservation-safe pct the settle folds
 * into the house draw exactly like the object boosts. Each PRESENT lead
 * contributes `round(renownOf(lead) × 20)` (a 名頭 0.8 lead adds +16); the sum
 * across leads is capped at RENOWN_HOUSE_CAP so two hot bills lift — but never
 * mint — the house. Absent leads draw nothing (an absent 名角 draws no house —
 * the same principle as skills). Pure + deterministic: 名頭 is world state read
 * at settle time, so the settle stays replayable. NUMBERS live only in the
 * ledger math here — never a prompt. This closes the 口碑 loop mechanically:
 * the nightly ±0.05/0.06 renown bumps now feed back as 名頭→座→票房→名頭.
 */
export function renownDrawPct(world: WorldState, leadsPresent: string[]): number {
    let total = 0;
    for (const id of leadsPresent) {
        total += Math.round(world.renownOf(id) * 20);
    }
    return Math.min(total, RENOWN_HOUSE_CAP);
}

/**
 * 黃昏開鑼。Attendance decides the evening deterministically: no lead on the
 * boards or too few hands → 停鑼, zero income; otherwise the house pays by
 * what it sees (leads, rehearsal, mended instruments, the 名角 on the boards),
 * and the box office is REAL money entering the treasury. Idempotent per day
 * via the txn id.
 */
export function settleEveningPerformance(
    world: WorldState,
    req: { day: number; partIndex: number },
): PerformanceOutcome | null {
    const parsed = live(world);
    const perf = world.data.economy?.performance;
    if (!parsed || !perf || req.partIndex !== 3) return null;
    let contract = parsed.contract;
    const data = parsed.data;
    const venue = world.data.scenes.find((scene) => scene.name === perf.venueSceneName);
    if (!venue) throw new Error(`[economy] performance venue is not a scene: ${perf.venueSceneName}`);
    const present = world.data.cast.filter((member) => world.data.roster[member.id] === venue.id);
    const leadsPresent = perf.leadIds.filter((id) => present.some((member) => member.id === id));
    const leadNames = (ids: string[]) => ids.map((id) => world.nameById(id)).join('、');
    if (leadsPresent.length === 0 || present.length < perf.minCast) {
        perf.rehearsedToday = [];
        // 口碑: 停鑼 dents the BILLED leads' 名頭 (a cancelled show折面子) and stings
        // the insecure (自視). renown is NOT money — no ledger touched here, so
        // conservation + `auditSeasonEconomy` are unaffected.
        for (const id of perf.leadIds) {
            world.bumpRenown(id, -0.06);
            world.bumpSelfRegard(id, -0.04);
        }
        return {
            performed: false,
            line: `【${perf.venueSceneName}】今夜停鑼：${leadsPresent.length === 0 ? `領銜（${leadNames(perf.leadIds)}）無一人上台` : `到場僅 ${present.length} 人，湊不成一台戲`}，看客退票散去，票房分文未進。`,
        };
    }
    let pct = 100n;
    if (leadsPresent.length < perf.leadIds.length) pct = (pct * 60n) / 100n;
    if (perf.rehearsedToday.length < perf.minCast) pct = (pct * 70n) / 100n;
    for (const boost of perf.boosts ?? []) {
        const object = world.objectById(boost.objectId);
        if (!object || object.visibility === 'destroyed') continue;
        const legacyEligible =
            !boost.stateIncludes || (object.state ?? '').includes(boost.stateIncludes);
        const structuredEligible =
            !boost.requiredStateTag || (object.stateTags ?? []).includes(boost.requiredStateTag);
        if (world.data.strictStructured) {
            world.recordStructuredComparison({
                domain: 'economy',
                kind: 'performance-object-state',
                subjectId: boost.objectId,
                legacy: legacyEligible,
                structured: structuredEligible,
                detail: boost.requiredStateTag ?? boost.stateIncludes,
            });
            if (boost.stateIncludes && !boost.requiredStateTag) {
                world.recordStructuredWarning({
                    domain: 'economy',
                    kind: 'missing-performance-state-tag',
                    subjectId: boost.objectId,
                    detail: boost.stateIncludes,
                });
            }
            if (!structuredEligible || (boost.stateIncludes && !boost.requiredStateTag)) continue;
        } else if (!legacyEligible) {
            continue;
        }
        pct += BigInt(boost.pct);
    }
    // 名角滿座 — the stage craft of the performers on the boards lifts the house,
    // a conservation-safe pct exactly like the object boosts above. Opt-in per
    // frame (like castShareBps): off ⇒ 0, so existing seasons settle byte-for-
    // byte as before; on ⇒ 0 anyway for a skill-less cast. Only the performers
    // actually on the boards tonight count — an absent 名角 draws no house.
    if (perf.performerBoost) {
        pct += BigInt(performerSkillBoostPct(world, present.map((member) => member.id)));
    }
    // 名頭引座 — the billed leads' public 名頭 fills seats, a conservation-safe pct
    // exactly like the terms above (`renownDrawPct`, capped at RENOWN_HOUSE_CAP).
    // Opt-in per frame via audienceHouse: off ⇒ 0, so existing seasons settle
    // byte-for-byte as before. Only the leads actually on the boards tonight
    // count — an absent 名角 draws no house.
    if (perf.audienceHouse) {
        pct += BigInt(renownDrawPct(world, leadsPresent));
    }
    // 看客 — the paying house as a REAL figure (約 N 人), derived from the SAME
    // final pct as the takings so the two never disagree. Off ⇒ undefined: the
    // house stays abstract and nothing downstream changes.
    const audience = perf.audienceHouse ? Number((BigInt(perf.houseSeats ?? 120) * pct) / 100n) : undefined;
    const takings = (BigInt(perf.fullHouseSubunits) * pct) / 100n;
    const causeEventId = `${world.data.sagaId}:boxoffice:d${req.day}`;
    // idempotent per day: any takings deposit already booked tonight → replay is a no-op.
    if (contract.economy.ledger.some((txn) => txn.causeEventId === causeEventId)) return null;

    // 口碑: the house moves standing. 叫座 (滿座 and above, pct ≥ 100) lifts the
    // performers actually on the boards (esp. the leads); a 冷場 (半座, pct < 70)
    // dents the leads who took the stage. Small steps that accrue over a season.
    // Placed AFTER the per-day idempotency guard above, so a replayed settle never
    // double-counts. renown is NOT money — no ledger touched, audit unaffected.
    if (pct >= 100n) {
        for (const member of present) {
            world.bumpRenown(member.id, 0.05);
            world.bumpSelfRegard(member.id, 0.03);
        }
    } else if (pct < 70n) {
        for (const id of leadsPresent) {
            world.bumpRenown(id, -0.06);
            world.bumpSelfRegard(id, -0.04);
        }
    }

    // ── the cast's cut ── a frame-configurable share of the takings is paid to
    // the people who actually made the show (roster === the venue tonight),
    // credited to their OWN accounts; a lead counts double. Falsy share, no
    // takings, or an empty house all fall back to today's all-to-troupe path,
    // so nothing is minted or lost — every 分 enters from the SAME external
    // source (depositExternal / kind 'external-in') the treasury always used.
    const castShareBps = perf.castShareBps ?? 0;
    const shares: Array<{ accountId: string; amount: bigint }> = [];
    let castShare = 0n;
    let troupeShare = takings;
    if (castShareBps > 0 && takings > 0n && present.length > 0) {
        castShare = (takings * BigInt(castShareBps)) / 10000n;
        troupeShare = takings - castShare;
        const weightOf = (id: string): bigint => (perf.leadIds.includes(id) ? 2n : 1n);
        let totalWeight = 0n;
        for (const member of present) totalWeight += weightOf(member.id);
        let paid = 0n;
        for (const member of present) {
            const cut = (castShare * weightOf(member.id)) / totalWeight;
            if (cut > 0n) shares.push({ accountId: member.id, amount: cut });
            paid += cut;
        }
        // integer-division remainder lands in the troupe — never minted or lost.
        troupeShare += castShare - paid;
    }

    const deposit = (to: string, amount: bigint, txnId: string, memo: string): void => {
        if (amount <= 0n) return;
        const done = depositExternal(contract.economy, { txnId, to, amount, memo, causeEventId });
        if (done.rejection) throw new Error(`[economy] box office failed: ${done.rejection.message}`);
        contract = { economy: done.state, contracts: contract.contracts };
    };
    deposit(data.troupeAccountId, troupeShare, `day${req.day}:boxoffice`, '今晚票房');
    for (const share of shares) {
        deposit(share.accountId, share.amount, `day${req.day}:boxoffice:${share.accountId}`, '今晚票房·登台分紅');
    }
    persist(world, contract);
    const rehearsed = perf.rehearsedToday.length;
    perf.rehearsedToday = [];
    const house = pct >= 110n ? '滿堂彩' : pct >= 100n ? '滿座' : pct >= 70n ? '七成座' : '半座';
    const rehearsedSuffix = rehearsed >= perf.minCast ? '' : '，白日未曾好好排過';
    // audienceHouse ON: the notice names 台上 (the cast on the boards) and 看客
    // (the paying house) as DISTINCT figures — no more 「到場 4 人、滿堂彩」reading
    // as four spectators. OFF: the EXACT legacy strings, byte-for-byte — the two
    // branches deliberately share no template so the off path can never drift.
    const line = perf.audienceHouse
        ? (castShare > 0n
            ? `【${perf.venueSceneName}】今夜上燈開鑼，台上 ${present.length} 人、領銜${leadNames(leadsPresent)}${rehearsedSuffix}，看客約 ${audience} 人：${house}，票房 ${formatMoney(data, takings)}——班庫得 ${formatMoney(data, troupeShare)}，登台的 ${shares.length} 人分了 ${formatMoney(data, castShare)}。`
            : `【${perf.venueSceneName}】今夜上燈開鑼，台上 ${present.length} 人、領銜${leadNames(leadsPresent)}${rehearsedSuffix}，看客約 ${audience} 人：${house}，票房 ${formatMoney(data, takings)} 入${accountLabel(contract, data.troupeAccountId)}。`)
        : (castShare > 0n
            ? `【${perf.venueSceneName}】今夜上燈開鑼，到場 ${present.length} 人、領銜${leadNames(leadsPresent)}${rehearsedSuffix}：${house}，票房 ${formatMoney(data, takings)}——班庫得 ${formatMoney(data, troupeShare)}，登台的 ${shares.length} 人分了 ${formatMoney(data, castShare)}。`
            : `【${perf.venueSceneName}】今夜上燈開鑼，到場 ${present.length} 人、領銜${leadNames(leadsPresent)}${rehearsedSuffix}：${house}，票房 ${formatMoney(data, takings)} 入${accountLabel(contract, data.troupeAccountId)}。`);
    return {
        performed: true,
        line,
        takingsSubunits: takings,
        troupeShareSubunits: troupeShare,
        castShareSubunits: castShare,
        ...(audience !== undefined ? { audience } : {}),
    };
}

// ── daily settlement + deadline resolution ──

export interface SettleSeasonDayRequest {
    day: number;
    nowTick: number;
    /** Per-contract agent 座席 verdicts computed in the tick's 7.45 phase (async,
     *  BEFORE this pure settle), keyed by contractId. A money-counter verdict only
     *  chooses within what counterAskGate already allows; a condition-counter
     *  verdict outranks the authored acceptDemandsMatching policy. Absent (rehearsal
     *  / no seat) → settle falls back deterministically. */
    counterVerdicts?: Record<string, { accept: boolean; note?: string }>;
}

/**
 * WHOSE split a money-counter's 加碼 lands on (§6-A CONTRACT_ESCROW). Resolution
 * order: the demander's own split if they already hold one; else the PARTNER_SLOT
 * split when the demander is the filled partner; else a beneficiary account the
 * demander stewards (their id in authorizedSpenderIds — the 班主 of a treasury);
 * else undefined — the 加碼 has no home, so the caller refuses rather than guess.
 */
function resolveBumpBeneficiary(contract: ContractState, c: EconomicContract, demanderId: string): string | undefined {
    if (c.splits.some((split) => split.beneficiary === demanderId)) return demanderId;
    if (c.partnerSlot.filledBy === demanderId && c.splits.some((split) => split.beneficiary === PARTNER_SLOT)) {
        return PARTNER_SLOT;
    }
    for (const split of c.splits) {
        if (split.beneficiary === PARTNER_SLOT) continue;
        if (contract.economy.accounts[split.beneficiary]?.authorizedSpenderIds.includes(demanderId)) {
            return split.beneficiary;
        }
    }
    return undefined;
}

/** The proposer's book facts as the 座席 reads them (現銀/押著/開銷/跑道) — plain
 *  facts, no advice, no number the seat could recompute (reuses formatMoney +
 *  the account runway helper the rest of the file uses). */
function booksViewFor(data: SeasonEconomyData, account: EconomyAccount): string {
    const runway = accountRunwayDays(account);
    return [
        `現銀 ${formatMoney(data, account.available)}`,
        `已按約押著 ${formatMoney(data, account.reserved)}`,
        `每日開銷 ${formatMoney(data, account.dailyFixedCost)}`,
        runway !== null ? `照此跑道約 ${runway} 日` : '每日開銷不成負擔',
    ].join('；') + '。';
}

/**
 * Deterministic end-of-day settlement: wages out of the troupe pot, fixed
 * living/operating costs, contract deadlines. Shortfalls become objective
 * consequences (hunger climbs, notices post) — never just narration. The
 * resulting notices are scheduled as next-morning world events so characters
 * PERCEIVE the settlement before they choose anything (the aftermath tick).
 */
export function settleSeasonDay(world: WorldState, req: SettleSeasonDayRequest): SeasonDaySettleReport {
    const parsed = live(world);
    if (!parsed) return { settled: false, publicNotices: [], privateNotices: [] };
    const { data } = parsed;
    let contract = parsed.contract;
    if (contract.economy.settledDays.includes(req.day)) {
        return { settled: false, publicNotices: [], privateNotices: [] };
    }
    const causeEventId = `${world.data.sagaId}:settle:d${req.day}`;
    const publicNotices: string[] = [];
    const privateNotices: Array<{ characterId: string; text: string }> = [];
    const foreclosures: NonNullable<SeasonDaySettleReport['foreclosures']> = [];

    // 0.5 counter-demands are answered overnight — BEFORE the deadline sweep,
    //     so an accepted amendment (with its grace day) can outlive the clock.
    //     A MONEY counter (pending.ask) is decided FIRST by the mechanical gate
    //     (does the proposer's real底 cover the 加碼? — LLM 永不碰數字); an agent
    //     座席 verdict (req.counterVerdicts, computed in the tick's 7.45 phase) only
    //     chooses WITHIN what the gate allows, and gate-pass with NO verdict
    //     auto-accepts (rehearsal, replayable). A CONDITION counter (no ask) is
    //     decided by the verdict when present, else the authored policy (byte-for-
    //     byte the old acceptDemandsMatching path — 排演 stays deterministic).
    const floorDays = data.counterFloorDays ?? 3;
    const allWitnesses = world.data.cast.map((member) => member.id);
    for (const [id, c] of Object.entries(contract.contracts)) {
        if (!c.pendingCounter) continue;
        if (c.status !== 'offered') {
            // the world moved first — a demand on a done deal dies unanswered
            const voided = resolveCounter(contract, { contractId: id, accept: false, day: req.day, causeEventId });
            if (voided.rejection) throw new Error(`economy: stale counter on ${id} failed to void: ${voided.rejection.message}`);
            contract = voided.state;
            publicNotices.push(`「${c.label}」已有定局，${accountLabel(contract, c.pendingCounter.byId)}那句還價不了了之。`);
            continue;
        }
        const pending = c.pendingCounter;
        const policy = (data.negotiations ?? {})[id];
        const proposer = accountLabel(contract, c.proposerAccountId);
        const verdict = req.counterVerdicts?.[id];

        // ── MONEY counter: the mechanical gate is the sole truth on the number ──
        if (pending.ask !== undefined) {
            const ask = pending.ask;
            const gate = counterAskGate(contract.economy, c.proposerAccountId, ask, floorDays);
            // gate FAIL → forced refuse; the money never moves, the clock stays.
            // gate PASS → the seat decides, or (no verdict) gate-pass auto-accepts.
            let accept = gate.ok && (verdict?.accept ?? true);
            let notice: string;
            let bumpBeneficiary: string | undefined;
            if (accept) {
                bumpBeneficiary = resolveBumpBeneficiary(contract, c, pending.byId);
                if (!bumpBeneficiary) {
                    // 加碼 with nowhere to land — refuse rather than guess a beneficiary
                    accept = false;
                    notice = `${proposer}回話：說不清這筆加碼該落誰帳上，這一筆不認，「${c.label}」原約原期。`;
                } else {
                    notice = ''; // set after the resolve, so the notice can quote the new deadline
                }
            } else if (!gate.ok) {
                notice = `${proposer}回話：${pending.demand}——${gate.reason}，這個數不讓。`;
            } else {
                notice = verdict?.note ?? policy?.refusalNote
                    ?? `${proposer}回話：不讓步。「${c.label}」原約原期，第 ${c.deadlineDay} 日夜裡為限。`;
            }
            const answered = resolveCounter(contract, {
                contractId: id, accept, day: req.day,
                graceDays: policy?.graceDaysOnAccept ?? 1,
                ...(accept && bumpBeneficiary ? { bumpBeneficiary } : {}),
                causeEventId,
            });
            if (answered.rejection) throw new Error(`economy: money counter on ${id} failed to resolve: ${answered.rejection.message}`);
            contract = answered.state;
            if (accept) {
                notice = verdict?.note
                    ?? `${proposer}回話：加碼 ${formatMoney(data, ask)}照辦——『${pending.demand}』白紙黑字補進「${c.label}」，簽期順延至第 ${contract.contracts[id].deadlineDay} 日夜裡。`;
            }
            publicNotices.push(notice);
            syncContractObject(world, data, contract, id, allWitnesses);
            continue;
        }

        // ── CONDITION counter: the verdict decides when present, else the policy ──
        const legacyPolicyAccept =
            !!policy &&
            policy.acceptDemandsMatching.some((needle) => pending.demand.includes(needle));
        const structuredPolicyAccept = false;
        if (world.data.strictStructured && verdict === undefined) {
            world.recordStructuredComparison({
                domain: 'economy',
                kind: 'condition-counter-policy',
                subjectId: id,
                legacy: legacyPolicyAccept,
                structured: structuredPolicyAccept,
                detail: pending.demand,
            });
            if (policy?.acceptDemandsMatching.length) {
                world.recordStructuredWarning({
                    domain: 'economy',
                    kind: 'missing-condition-code',
                    subjectId: id,
                    detail: pending.demand,
                });
            }
        }
        const accept = verdict !== undefined
            ? verdict.accept
            : world.data.strictStructured
              ? structuredPolicyAccept
              : legacyPolicyAccept;
        const answered = resolveCounter(contract, {
            contractId: id, accept, day: req.day, graceDays: policy?.graceDaysOnAccept ?? 1, causeEventId,
        });
        if (answered.rejection) throw new Error(`economy: counter on ${id} failed to resolve: ${answered.rejection.message}`);
        contract = answered.state;
        publicNotices.push(accept
            ? (verdict?.note ?? policy?.acceptNote ?? `${proposer}回話：條款照辦——『${pending.demand}』白紙黑字補進「${c.label}」，簽期順延至第 ${contract.contracts[id].deadlineDay} 日夜裡。`)
            : (verdict?.note ?? policy?.refusalNote ?? `${proposer}回話：不讓步。「${c.label}」原約原期，第 ${c.deadlineDay} 日夜裡為限。`));
        syncContractObject(world, data, contract, id, allWitnesses);
    }
    persist(world, contract);

    // 1. contract deadlines FIRST — a fully-signed offer settles, an unsigned
    //    one expires and its escrow releases (deadlineDay is the last valid day).
    const before = Object.fromEntries(Object.entries(contract.contracts).map(([id, c]) => [id, c.status]));
    const expired = expireContracts(contract, { day: req.day + 1, causeEventId });
    contract = expired.state;
    for (const [id, c] of Object.entries(contract.contracts)) {
        if (before[id] === c.status) continue;
        syncContractObject(world, data, contract, id, world.data.cast.map((member) => member.id));
        if (c.status === 'expired') {
            publicNotices.push(`「${c.label}」期限已過而未簽成：${formatMoney(data, c.total)}預付款由${accountLabel(contract, c.proposerAccountId)}原封收回。`);
            const paperId = data.contractObjectIds[id];
            const paperScene = paperId ? world.objectById(paperId)?.sceneId : undefined;
            foreclosures.push({
                contractId: id,
                label: c.label,
                partyIds: [...new Set([...c.requiredSignerIds, ...(c.partnerSlot.filledBy ? [c.partnerSlot.filledBy] : [])])],
                slotUnfilled: c.partnerSlot.required && !c.partnerSlot.filledBy,
                sceneId: paperScene ?? world.data.scenes[0]?.id ?? '',
            });
        } else if (c.status === 'settled') {
            publicNotices.push(`「${c.label}」在期限最後一刻生效，款項按約分訖。`);
        }
    }

    // 2. periodic bills FIRST — the 錢莊 knocks before lamp oil is bought; — 錢莊月息、屋租按期收，不是每日勻繳。Due at the end
    //     due at the end of dueDay, short payment stands as chased debt.
    for (const bill of data.bills ?? []) {
        const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        if (remaining <= 0n || req.day < bill.dueDay) continue;
        // 默認 班庫→市面; a 租金 bill routes 租客→屋主 (from/to on the bill). The
        // collection is a TRANSFER between two existing accounts either way, so
        // conservation is untouched — only WHOSE purse pays and WHO receives moves.
        const payerId = bill.fromAccountId ?? data.troupeAccountId;
        const payeeId = bill.toAccountId ?? data.marketAccountId;
        const payer = contract.economy.accounts[payerId];
        if (!payer) throw new Error(`[economy] bill ${bill.id} names unknown payer account: ${payerId}`);
        const pay = payer.available < remaining ? payer.available : remaining;
        if (pay > 0n) {
            const moved = collectDue(contract.economy, {
                txnId: `day${req.day}:bill:${bill.id}`,
                from: payerId,
                to: payeeId,
                amount: pay,
                memo: bill.label,
                causeEventId,
            });
            if (moved.rejection) throw new Error(`economy: bill ${bill.id} settlement failed: ${moved.rejection.message}`);
            contract = { economy: moved.state, contracts: contract.contracts };
            bill.paidSubunits = (BigInt(bill.paidSubunits) + pay).toString();
        }
        const owing = remaining - pay;
        const creditor = bill.creditor ?? data.shortfallCreditor ?? '債主';
        if (owing <= 0n) {
            publicNotices.push(req.day === bill.dueDay
                ? `${bill.label}（${formatMoney(data, BigInt(bill.amountSubunits))}）如期付訖，${creditor}那邊交代得過去了。`
                : `拖欠的${bill.label}總算清了，${creditor}的臉色緩了下來。`);
        } else {
            publicNotices.push(req.day === bill.dueDay
                ? `${bill.label}今日到期，${formatMoney(data, BigInt(bill.amountSubunits))}只湊出${formatMoney(data, pay)}，欠下的${formatMoney(data, owing)}記在${creditor}的摺子上。`
                : `${bill.label}仍欠${formatMoney(data, owing)}，${creditor}催討得一日緊過一日。`);
        }
    }

    // 2b. wages + fixed costs through the ONE settlement transition. Wages group
    //     by employer establishment (fromAccountId, default 班庫): each pot pays
    //     its own people, prorated against its own reserves independently.
    const payrollByPayer = new Map<string, Array<{ memberAccountId: string; amount: bigint }>>();
    for (const wage of data.wages) {
        const payer = wage.fromAccountId ?? data.troupeAccountId;
        (payrollByPayer.get(payer) ?? payrollByPayer.set(payer, []).get(payer)!).push({
            memberAccountId: wage.accountId,
            amount: BigInt(wage.amountSubunits),
        });
    }
    const settle = settleEconomyDay(contract.economy, {
        day: req.day,
        causeEventId,
        wages: payrollByPayer.size
            ? [...payrollByPayer].map(([payerAccountId, orders]) => ({ payerAccountId, orders }))
            : undefined,
        marketAccountId: data.marketAccountId,
    });
    contract = { economy: settle.state, contracts: contract.contracts };

    persist(world, contract);

    // 2c. aid received today becomes PUBLIC ledger truth — silence after a
    //     donation is what made a donor keep re-paying the same gap.
    const aidToday = contract.economy.ledger.filter((txn) =>
        txn.kind === 'transfer' && txn.to === data.troupeAccountId && txn.day === req.day && txn.from !== data.troupeAccountId);
    if (aidToday.length) {
        const byDonor = new Map<string, bigint>();
        for (const txn of aidToday) byDonor.set(txn.from, (byDonor.get(txn.from) ?? 0n) + txn.amount);
        const donors = [...byDonor.entries()]
            .map(([from, total]) => `${accountLabel(contract, from)}${formatMoney(data, total)}`)
            .join('、');
        const troupe = contract.economy.accounts[data.troupeAccountId];
        const troupeRunway = accountRunwayDays(troupe);
        publicNotices.push(
            `今日班庫得接濟：${donors}。連同今日開銷結清，${troupe.label}現餘${formatMoney(data, troupe.available)}` +
            (troupeRunway !== null ? `，照常例約可再撐 ${troupeRunway} 日。` : '。'),
        );
    }

    // 3. shortfalls become objective world state, not adjectives. The 班庫 notice
    //    speaks only for troupe-paid wages; another establishment's payroll
    //    shortfall shows up as its own people simply getting less (+ hunger).
    let troupeWagesShort = false;
    for (const wage of data.wages) {
        if ((wage.fromAccountId ?? data.troupeAccountId) !== data.troupeAccountId) continue;
        const paid = settle.perAccount[wage.accountId]?.wage ?? 0n;
        if (paid < BigInt(wage.amountSubunits)) troupeWagesShort = true;
    }
    if (troupeWagesShort) publicNotices.push('班庫見底，今日班中俸未能發足——欠薪記在眾人眼裡的那本帳上。');
    const troupeLedger = settle.perAccount[data.troupeAccountId];
    if (troupeLedger && troupeLedger.shortfall > 0n) {
        const troupeLabel = contract.economy.accounts[data.troupeAccountId]?.label ?? '班庫';
        publicNotices.push(
            `${troupeLabel}今日${formatMoney(data, troupeLedger.shortfall)}的${data.troupeCostNote ?? '固定開銷'}付不出來，` +
            `${data.shortfallCreditor ?? '帳房那本虧空簿'}的臉色一日冷過一日。`,
        );
    }
    for (const member of world.data.cast) {
        const ledger = settle.perAccount[member.id];
        if (!ledger || ledger.shortfall <= 0n) continue;
        member.state.hunger = Math.min(1, member.state.hunger + 0.35);
        privateNotices.push({
            characterId: member.id,
            text: `你昨日的食宿差了${formatMoney(data, ledger.shortfall)}，只能省著挨——腹中空得發慌。`,
        });
    }

    // 4. schedule the aftermath percepts for next morning (phase-0 delivery).
    const scheduled = (world.data.scheduledEvents ??= []);
    const noticeScene = world.data.scenes.find((scene) => scene.name === data.noticeSceneName) ?? world.data.scenes[0];
    if (publicNotices.length) {
        scheduled.push({
            id: `economy-day-${req.day}`,
            atTick: req.nowTick + 1,
            sceneId: noticeScene.id,
            text: publicNotices.join(' '),
            visibility: 'public',
            witnessIds: world.data.cast.map((member) => member.id),
        });
    }
    for (const notice of privateNotices) {
        scheduled.push({
            id: `economy-day-${req.day}-${notice.characterId}`,
            atTick: req.nowTick + 1,
            sceneId: world.data.homeByChar[notice.characterId] ?? noticeScene.id,
            text: notice.text,
            visibility: 'private',
            witnessIds: [notice.characterId],
        });
    }

    return { settled: true, publicNotices, privateNotices, foreclosures };
}

/**
 * Build the establishment counterparty seats for the tick's 7.45 phase: one per
 * `offered` contract carrying a pendingCounter that a seat may actually decide.
 * A money-counter whose 加碼 fails the mechanical gate is EXCLUDED — its refusal
 * is settled deterministically and needs no agent; a gate-passing one gets an
 * askLine stating the delta already cleared. Condition counters are included
 * without an askLine. The engine writes each seat's booksView (the house's facts)
 * and 立場; the seat reads them and never computes a number (LLM 永不碰數字).
 */
export function buildNegotiationSeats(
    world: WorldState,
): Array<{ contractId: string; input: CharacterAgentNs.NegotiateCounterInput }> {
    const parsed = live(world);
    if (!parsed) return [];
    const { data, contract } = parsed;
    const floorDays = data.counterFloorDays ?? 3;
    const seats: Array<{ contractId: string; input: CharacterAgentNs.NegotiateCounterInput }> = [];
    for (const c of Object.values(contract.contracts)) {
        if (c.status !== 'offered' || !c.pendingCounter) continue;
        const proposer = contract.economy.accounts[c.proposerAccountId];
        if (!proposer) continue;
        let askLine: string | undefined;
        if (c.pendingCounter.ask !== undefined) {
            const gate = counterAskGate(contract.economy, c.proposerAccountId, c.pendingCounter.ask, floorDays);
            if (!gate.ok) continue; // mechanical refusal needs no seat
            askLine = `這句還價要在總價外加碼 ${formatMoney(data, c.pendingCounter.ask)}；帳上撥得出、也不破底。`;
        }
        const stance = data.stances?.[c.proposerAccountId];
        seats.push({
            contractId: c.id,
            input: {
                establishmentLabel: proposer.label,
                ...(stance ? { stance } : {}),
                booksView: booksViewFor(data, proposer),
                contractLabel: c.label,
                terms: c.terms,
                demandBy: world.nameById(c.pendingCounter.byId),
                demand: c.pendingCounter.demand,
                ...(askLine ? { askLine } : {}),
                clock: `第${world.data.clock.day}日`,
            },
        });
    }
    return seats;
}

// ── season-frame seeding (authored JSON → live ledger) ──

/** The `economy` block a season frame JSON may author. Amounts in whole 圓. */
export interface SeasonEconomyFrame {
    unitLabel?: string;
    subunitsPerUnit?: number;
    /** scene NAME where public settlement notices post. */
    noticeScene: string;
    /** floor days of runway a money-counter 加碼 must leave a proposer above
     *  (counterAskGate). Default 3 when omitted. */
    counterFloorDays?: number;
    market?: { id?: string; label?: string };
    troupe: {
        id?: string;
        label: string;
        openingYuan: number;
        dailyFixedCostYuan?: number;
        /** what the fixed cost IS (錢莊月息、屋租、電燈捐稅…) — canon-correct naming. */
        costNote?: string;
        /** who the troupe owes when short (錢莊先生與房東…). */
        shortfallCreditor?: string;
        authorizedSpenderNames: string[];
    };
    /** periodic lump-sum bills due on specific days (amounts in 圓). */
    bills?: Array<{ id: string; label: string; amountYuan: number; dueDay: number; creditor?: string }>;
    /** the troupe's own trade: 黃昏開鑼。Box office is the ledger's INCOME side,
     *  so a season is never reduced to "sign the contract or die". */
    performance?: {
        venueScene: string;
        /** at least one lead must be on stage or the evening折鑼; all present = full draw. */
        leadNames: string[];
        minCast: number;
        fullHouseYuan: number;
        /** objects whose state lifts the takings (a mended huqin, new robes…). */
        boosts?: Array<{
            objectId: string;
            stateIncludes?: string;
            requiredStateTag?: string;
            pct: number;
        }>;
        /** basis points of the takings shared among the performers on the boards
         *  (a lead counts double), credited to their own accounts. Absent/0 ⇒
         *  all takings to 班庫, the box office's original behaviour. */
        castShareBps?: number;
        /** 名角滿座 — when true, the on-stage performers' stage craft (唱/身) lifts
         *  the night's house (capped at SKILL_HOUSE_CAP). Absent/false ⇒ talent
         *  draws no extra house, byte-identical to the box office's original
         *  behaviour (a skill-less cast is unaffected either way). */
        performerBoost?: boolean;
        /** 看客成群 — when true, the settle names a real audience figure (看客約
         *  N 人) distinct from the cast on the boards, and the present leads'
         *  public 名頭 draws extra house (capped at RENOWN_HOUSE_CAP). Absent/
         *  false ⇒ the settle line and takings stay byte-identical to before. */
        audienceHouse?: boolean;
        /** full-house seat count for the 看客 figure (default 120). */
        houseSeats?: number;
    };
    /** other economic establishments — a film co, newspaper, record label, song
     *  house. Each is a first-class pot with its own reserves, fixed cost, and
     *  (optionally) its OWN payroll: a 歌女 draws from 長三堂子, a 記者 from 申報館. */
    businesses?: Array<{
        id: string;
        label: string;
        openingYuan: number;
        dailyFixedCostYuan?: number;
        costNote?: string;
        shortfallCreditor?: string;
        authorizedSpenderNames?: string[];
        /** who this establishment pays a daily wage (its own hands). */
        wages?: Array<{ name: string; amountYuan: number }>;
        /** authored 立場 for this house's counterparty agent seat (what it cares
         *  about, its concession logic, its 口風). Agent-only — never the gate. */
        stance?: string;
        /** 賒帳: this establishment extends tab — a broke buyer's purchase here
         *  still happens, recorded as a REAL bill (buyer→vendor) the daily
         *  settle chases. Live only when the world's creditVerbs flag is on;
         *  absent/false ⇒ cash only, byte-identical. */
        allowsTab?: boolean;
        /** days until a tab bill falls due (default 15). */
        tabDueDays?: number;
    }>;
    /** per-character overrides; unlisted cast get characterDefaults. */
    characters?: Array<{ name: string; openingYuan?: number; dailyFixedCostYuan?: number }>;
    characterDefaults?: { openingYuan: number; dailyFixedCostYuan: number };
    /** daily wage out of the troupe treasury; unlisted cast draw no wage.
     *  (An establishment's own payroll is declared on that business instead.) */
    wages?: Array<{ name: string; amountYuan: number }>;
    catalog?: Array<{
        id: string;
        label: string;
        priceYuan: number;
        kind: SeasonCatalogItem['kind'];
        effect: SeasonCatalogEffect;
        sceneName?: string;
        vendorAccountId?: string;
        oncePerDay?: boolean;
        unique?: boolean;
    }>;
    contracts?: Array<{
        id: string;
        label: string;
        /** WorldObject id whose state mirrors this contract's status. */
        objectId?: string;
        proposer: string;
        totalYuan: number;
        splits: Array<{ to: string; amountYuan: number; memo: string }>;
        requiredSignerNames: string[];
        partnerRequired?: boolean;
        /** last narrative day (1-indexed) a signature can complete it. */
        deadlineDay: number;
        /** the written conditions as first offered. */
        terms?: string[];
        /** how the proposer answers counter-demands. Today an authored policy;
         *  later a real counterparty agent (another saga's stakeholder) sits
         *  exactly at this seam. */
        negotiation?: {
            /** demands containing ANY of these substrings are accepted. */
            acceptDemandsMatching: string[];
            /** extra days to sign after an accepted amendment (default 1). */
            graceDaysOnAccept?: number;
            acceptNote?: string;
            refusalNote?: string;
        };
    }>;
}

/** Build the live season ledger from an authored frame block. Fresh worlds only. */
export function seedSeasonEconomy(world: WorldState, frame: SeasonEconomyFrame, seasonId: string): void {
    if (world.data.economy) throw new Error('season economy is already seeded');
    const subunitsPerUnit = frame.subunitsPerUnit ?? 100;
    const asSubunits = (yuanAmount: number): bigint => BigInt(Math.round(yuanAmount * subunitsPerUnit));
    const idFor = (name: string): string => {
        const id = world.idByName(name);
        if (!id) throw new Error(`season economy references unknown character: ${name}`);
        return id;
    };
    const marketId = frame.market?.id ?? 'market';
    const troupeId = frame.troupe.id ?? 'troupe';
    if (!world.data.scenes.some((scene) => scene.name === frame.noticeScene)) {
        throw new Error(`season economy noticeScene is not a scene: ${frame.noticeScene}`);
    }

    const seeds: AccountSeed[] = [
        { id: marketId, ownerType: 'business', label: frame.market?.label ?? '市面', opening: 0n },
        {
            id: troupeId,
            ownerType: 'troupe',
            label: frame.troupe.label,
            opening: asSubunits(frame.troupe.openingYuan),
            dailyFixedCost: asSubunits(frame.troupe.dailyFixedCostYuan ?? 0),
            authorizedSpenderIds: frame.troupe.authorizedSpenderNames.map(idFor),
        },
        ...(frame.businesses ?? []).map((business): AccountSeed => ({
            id: business.id,
            ownerType: 'business',
            label: business.label,
            opening: asSubunits(business.openingYuan),
            dailyFixedCost: asSubunits(business.dailyFixedCostYuan ?? 0),
            authorizedSpenderIds: (business.authorizedSpenderNames ?? []).map(idFor),
        })),
        ...world.data.cast.map((member): AccountSeed => {
            const authored = frame.characters?.find((entry) => entry.name === member.name);
            const defaults = frame.characterDefaults ?? { openingYuan: 0, dailyFixedCostYuan: 0 };
            return {
                id: member.id,
                ownerType: 'character',
                label: member.name,
                opening: asSubunits(authored?.openingYuan ?? defaults.openingYuan),
                dailyFixedCost: asSubunits(authored?.dailyFixedCostYuan ?? defaults.dailyFixedCostYuan),
            };
        }),
    ];
    let contract: ContractState = { economy: openAccounts(emptyEconomy(world.data.clock.day), seeds), contracts: {} };

    const contractObjectIds: Record<string, string> = {};
    const negotiations: NonNullable<SeasonEconomyData['negotiations']> = {};
    // authored 立場 per establishment (agent-only). Keep the persisted map clean:
    // only businesses that authored a stance get a key.
    const stances: Record<string, string> = {};
    for (const business of frame.businesses ?? []) {
        if (business.stance) stances[business.id] = business.stance;
    }
    // 賒帳 terms per vendor (accountId → dueDays) — only businesses that allow
    // it get a key, mirroring how stances parse. Inert unless creditVerbs is on.
    const vendorTabs: Record<string, { dueDays: number }> = {};
    for (const business of frame.businesses ?? []) {
        if (business.allowsTab) vendorTabs[business.id] = { dueDays: business.tabDueDays ?? LOAN_DUE_DAYS_DEFAULT };
    }
    for (const spec of frame.contracts ?? []) {
        const resolveBeneficiary = (to: string): string =>
            to === PARTNER_SLOT ? PARTNER_SLOT : to === '班庫' ? troupeId : (world.idByName(to) ?? to);
        // money interest buys a voice on conditions: whoever stewards a
        // beneficiary account (the 班主 of a treasury owed 140 圓) may counter,
        // though the pen stays with the named signers.
        const negotiatorIds = [...new Set(spec.splits.flatMap((split) => {
            const beneficiary = resolveBeneficiary(split.to);
            if (beneficiary === PARTNER_SLOT) return [];
            const account = contract.economy.accounts[beneficiary];
            return account ? account.authorizedSpenderIds : [];
        }))];
        const offered = offerContract(contract, {
            id: spec.id,
            label: spec.label,
            proposerAccountId: spec.proposer,
            total: asSubunits(spec.totalYuan),
            splits: spec.splits.map((split) => ({
                beneficiary: resolveBeneficiary(split.to),
                amount: asSubunits(split.amountYuan),
                memo: split.memo,
            })),
            requiredSignerIds: spec.requiredSignerNames.map(idFor),
            partnerRequired: spec.partnerRequired ?? false,
            deadlineDay: spec.deadlineDay,
            terms: spec.terms,
            negotiatorIds,
            causeEventId: `${seasonId}:offer:${spec.id}`,
        });
        if (offered.rejection) throw new Error(`season contract ${spec.id} failed to seed: ${offered.rejection.message}`);
        contract = offered.state;
        if (spec.objectId) contractObjectIds[spec.id] = spec.objectId;
        if (spec.negotiation) (negotiations[spec.id] = { ...spec.negotiation });
    }

    world.data.economy = {
        unitLabel: frame.unitLabel ?? '圓',
        subunitsPerUnit,
        marketAccountId: marketId,
        troupeAccountId: troupeId,
        ...(frame.troupe.costNote ? { troupeCostNote: frame.troupe.costNote } : {}),
        ...(frame.troupe.shortfallCreditor ? { shortfallCreditor: frame.troupe.shortfallCreditor } : {}),
        ...(Object.keys(negotiations).length ? { negotiations } : {}),
        ...(Object.keys(stances).length ? { stances } : {}),
        ...(Object.keys(vendorTabs).length ? { vendorTabs } : {}),
        ...(frame.counterFloorDays !== undefined ? { counterFloorDays: frame.counterFloorDays } : {}),
        ...(frame.performance
            ? {
                performance: {
                    venueSceneName: frame.performance.venueScene,
                    leadIds: frame.performance.leadNames.map(idFor),
                    minCast: frame.performance.minCast,
                    fullHouseSubunits: asSubunits(frame.performance.fullHouseYuan).toString(),
                    ...(frame.performance.boosts ? { boosts: frame.performance.boosts.map((boost) => ({ ...boost })) } : {}),
                    // only persist the key when a share is actually configured — keeps the JSON clean.
                    ...(frame.performance.castShareBps ? { castShareBps: frame.performance.castShareBps } : {}),
                    // 名角滿座 opt-in — persisted only when the frame turns it on.
                    ...(frame.performance.performerBoost ? { performerBoost: true } : {}),
                    // 看客成群 opt-in — persisted only when the frame turns it on.
                    ...(frame.performance.audienceHouse ? { audienceHouse: true } : {}),
                    ...(frame.performance.houseSeats !== undefined ? { houseSeats: frame.performance.houseSeats } : {}),
                    rehearsedToday: [],
                },
            }
            : {}),
        ...(frame.bills?.length
            ? {
                bills: frame.bills.map((bill) => ({
                    id: bill.id,
                    label: bill.label,
                    amountSubunits: asSubunits(bill.amountYuan).toString(),
                    dueDay: bill.dueDay,
                    ...(bill.creditor ? { creditor: bill.creditor } : {}),
                    paidSubunits: '0',
                })),
            }
            : {}),
        noticeSceneName: frame.noticeScene,
        // Multi-establishment payroll: top-level wages are troupe-paid; each
        // business may declare its own payroll (歌女 from 長三堂子, 記者 from 申報館),
        // tagged with fromAccountId so settle pays each out of its own pot.
        wages: [
            ...(frame.wages ?? []).map((wage) => ({ accountId: idFor(wage.name), amountSubunits: asSubunits(wage.amountYuan).toString(), fromAccountId: troupeId })),
            ...(frame.businesses ?? []).flatMap((business) =>
                (business.wages ?? []).map((wage) => ({ accountId: idFor(wage.name), amountSubunits: asSubunits(wage.amountYuan).toString(), fromAccountId: business.id })),
            ),
        ],
        catalog: (frame.catalog ?? []).map((item) => ({
            id: item.id,
            label: item.label,
            priceSubunits: asSubunits(item.priceYuan).toString(),
            kind: item.kind,
            effect: item.effect,
            // keep the persisted shape JSON-clean: no undefined-valued keys
            ...(item.sceneName ? { sceneName: item.sceneName } : {}),
            ...(item.vendorAccountId ? { vendorAccountId: item.vendorAccountId } : {}),
            ...(item.oncePerDay ? { oncePerDay: true } : {}),
            ...(item.unique ? { unique: true } : {}),
        })),
        contractObjectIds,
        sponsorships: {},
        state: persistEconomy(contract.economy),
        contracts: persistContracts(contract.contracts),
    };
    // seeded contract papers show their live状態 from day one
    for (const contractId of Object.keys(contractObjectIds)) {
        syncContractObject(world, world.data.economy, contract, contractId, world.data.cast.map((member) => member.id));
    }
}

// ── editor-facing audit (publish gate) ──

/** Objective-consistency audit: any returned line vetoes anthology prose. */
export function auditSeasonEconomy(world: WorldState): string[] {
    const parsed = live(world);
    if (!parsed) return [];
    const { data, contract } = parsed;
    const errors: string[] = [];
    if (!conservesProduction(contract.economy)) {
        errors.push('economy conservation violated: injected != Σ available + reserved');
    }
    const today = world.data.clock.day;
    for (const c of Object.values(contract.contracts)) {
        if (c.status === 'offered' && today > c.deadlineDay) {
            errors.push(`contract ${c.id} is past deadline day ${c.deadlineDay} but still offered (deadline never settled)`);
        }
        const objectId = data.contractObjectIds[c.id];
        const object = objectId ? world.objectById(objectId) : undefined;
        if (object) {
            const terminalMark = c.status === 'settled' ? '生效' : c.status === 'rejected' ? '拒簽' : c.status === 'expired' ? '逾期' : null;
            if (terminalMark && !(object.state ?? '').includes(terminalMark)) {
                errors.push(`contract ${c.id} is ${c.status} but object ${objectId} state does not record it: ${object.state ?? '(none)'}`);
            }
        }
    }
    return errors;
}

// ── the port (handoff API; local impl delegates to the pure functions) ──

export interface EconomyPort {
    /** Validate + commit one structured beat command. ok:false = world refuses. */
    commitCommand(world: WorldState, req: CommitEconomyCommandRequest): EconomyCommandOutcome;
    /** Deterministic end-of-day settlement + deadline resolution. Idempotent per day. */
    settleDay(world: WorldState, req: SettleSeasonDayRequest): SeasonDaySettleReport;
    /** Knowledge/authority-scoped money percept for one character. */
    projectFor(world: WorldState, characterId: string, sceneId?: string): string | undefined;
    /** Objective-consistency audit; non-empty vetoes editorial publishing. */
    audit(world: WorldState): string[];
}
