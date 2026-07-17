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
    type EconomyTransaction,
    type PersistedEconomicContract,
    type PersistedEconomyState,
} from '@endless-story/economy';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';
import type { WorldState } from '../world-state.ts';

export type BeatEconomyCommand = CharacterAgentNs.BeatEconomyCommand;

// ── persisted shape (rides WorldStateData.economy; JSON-safe strings only) ──

export type SeasonCatalogEffect =
    | { kind: 'relieve-hunger' }
    | { kind: 'object-state'; objectId: string; state: string }
    /** instant rehousing — for abstractions that need no move-in arc. Prefer
     *  'tenancy' for characters: real moves are lived, not teleported. */
    | { kind: 'move-home'; sceneName: string; characterName?: string }
    /** a LEASE, not a move: the beneficiary receives a lease object (carried),
     *  and the home only changes when they physically arrive at the granted
     *  scene carrying it. When/whether to move — and what to pack — is their
     *  own in-world choice (the packing arc). `characterName` omitted = buyer. */
    | { kind: 'tenancy'; sceneName: string; characterName?: string; keyObjectId: string; keyLabel: string }
    | { kind: 'spawn-object'; objectId: string; label: string; sceneName: string; state: string; aliases?: string[] };

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
    /** daily wage schedule out of the troupe treasury: accountId → subunits. */
    wages: Array<{ accountId: string; amountSubunits: string }>;
    /** periodic lump-sum obligations (錢莊月息、屋租按期付，不是每日勻繳)。
     *  due at the END of dueDay; short payment rolls forward as a standing
     *  debt chased at every later settle until cleared. */
    bills?: Array<{
        id: string;
        label: string;
        amountSubunits: string;
        dueDay: number;
        creditor?: string;
        paidSubunits: string;
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
    /** contractId → the proposer's authored answer policy for counter-demands.
     *  The replaceable seam: swap for a live counterparty agent later. */
    negotiations?: Record<string, {
        acceptDemandsMatching: string[];
        graceDaysOnAccept?: number;
        acceptNote?: string;
        refusalNote?: string;
    }>;
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

function touchObject(world: WorldState, objectId: string, state: string, witnessIds: string[]): void {
    const object = world.objectById(objectId);
    if (!object) return;
    object.state = state;
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
        // a settled sponsorship IS the item being done; a pending one holds the slot
        const sponsorStates = Object.entries(data.sponsorships ?? {})
            .filter(([, s]) => s.itemId === item.id)
            .map(([cid]) => contract.contracts[cid]?.status);
        if (item.unique && (bought.length > 0 || sponsorStates.some((s) => s === 'settled'))) {
            return fail(`「${item.label}」已經辦過了，不能重複`);
        }
        if (item.unique && sponsorStates.some((s) => s === 'offered')) {
            return fail(`「${item.label}」已有人出資、正等當事人答覆，不能搶辦`);
        }
        if (item.oncePerDay && bought.some((t) => t.day === req.day && t.from === payerId)) {
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
        const countered = fileCounter(contract, {
            contractId, actorId: req.actorId, demand: cmd.demand, day: req.day, causeEventId: req.causeEventId,
        });
        if (countered.rejection) return fail(countered.rejection.message);
        contract = countered.state;
        persist(world, contract);
        return {
            ok: true,
            publicLines: [`${actorName}就「${c.label}」當面還價：『${cmd.demand.trim()}』——${accountLabel(contract, c.proposerAccountId)}的回話要等明晨`],
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
        touchObject(world, effect.objectId, effect.state, req.witnessIds);
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

// ── percept projection (knowledge- and authority-scoped) ──

/** runway in days for an account given its balance and daily burn (mirrors
 *  the economy core's balance/net-burn division; null = indefinitely). */
function runwayLine(data: SeasonEconomyData, available: bigint, dailyCost: bigint): string {
    if (dailyCost <= 0n) return '';
    const days = available / dailyCost;
    return `，照此可撐約 ${days} 日`;
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
                lines.push(wageCameShort
                    ? '昨日班中俸已經發不足——這班眼看撐不了幾日；真散了班，你的工錢、鋪位與營生一併沒了，得各自另尋出路。'
                    : `你的工錢喫住都繫在${troupe.label.replace('班庫', '')}這一班：班若散了，戲散人散，各自另尋營生。`);
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
            if (c.pendingCounter) {
                lines.push(`還價待覆：${accountLabel(contract, c.pendingCounter.byId)}所提『${c.pendingCounter.demand}』，${accountLabel(contract, c.proposerAccountId)}明晨回話。`);
            }
            const isParty = c.requiredSignerIds.includes(characterId) || c.partnerSlot.filledBy === characterId;
            if (isParty) {
                const counterHint = c.pendingCounter ? '' : '、contract_counter 還價（demand 寫你要的條款，對方明晨回話）';
                lines.push(`你是這份契約的當事人：可 contract_sign 簽署、contract_reject 拒簽${c.requiredSignerIds.includes(characterId) && c.partnerSlot.required && !c.partnerSlot.filledBy ? '、contract_fill_partner 填上唯一聯名搭檔' : ''}${counterHint}。`);
            } else if (c.negotiatorIds.includes(characterId)) {
                lines.push(c.pendingCounter
                    ? `你是受益方當家，可就此約還價——但眼下已有一則還價待覆，等回話再說。`
                    : `你雖非簽署人，但受益方的家當繫在此約上：可 contract_counter 還價（demand 寫你要的條款）；簽與拒只在${[...new Set(c.requiredSignerIds.map((id) => accountLabel(contract, id)))].join('、')}手裡。`);
            }
        } else {
            const outcome = c.status === 'settled' ? `已簽署生效，款項分訖（${splits}）` : c.status === 'rejected' ? '已拒簽，預付款退回' : '已逾期失效，預付款收回';
            lines.push(`「${c.label}」${outcome}。`);
        }
    }
    for (const [keyObjectId, tenancy] of Object.entries(data.tenancies ?? {})) {
        if (tenancy.characterId !== characterId) continue;
        const key = world.objectById(keyObjectId);
        if (!key || key.visibility === 'destroyed') continue;
        lines.push(`你已賃定【${tenancy.sceneName}】的屋子（${key.label}${key.carriedBy === characterId ? '在你身上' : `在${world.sceneNameById(key.sceneId)}`}）；何時遷入、帶什麼走，由你——人帶著契到了那裡，家才算搬。`);
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
                return `${item.id}＝${item.label}（${formatMoney(data, BigInt(item.priceSubunits))}${consent}）`;
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

// ── daily settlement + deadline resolution ──

export interface SettleSeasonDayRequest {
    day: number;
    nowTick: number;
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

    // 0.5 counter-demands are answered overnight — BEFORE the deadline sweep,
    //     so an accepted amendment (with its grace day) can outlive the clock.
    //     Today the answer comes from the authored policy; this call is the
    //     seam where a live counterparty agent plugs in later.
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
        const policy = (data.negotiations ?? {})[id];
        const accept = !!policy && policy.acceptDemandsMatching.some((needle) => c.pendingCounter!.demand.includes(needle));
        const answered = resolveCounter(contract, {
            contractId: id, accept, day: req.day, graceDays: policy?.graceDaysOnAccept ?? 1, causeEventId,
        });
        if (answered.rejection) throw new Error(`economy: counter on ${id} failed to resolve: ${answered.rejection.message}`);
        contract = answered.state;
        const proposer = accountLabel(contract, c.proposerAccountId);
        publicNotices.push(accept
            ? (policy?.acceptNote ?? `${proposer}回話：條款照辦——『${c.pendingCounter.demand}』白紙黑字補進「${c.label}」，簽期順延至第 ${contract.contracts[id].deadlineDay} 日夜裡。`)
            : (policy?.refusalNote ?? `${proposer}回話：不讓步。「${c.label}」原約原期，第 ${c.deadlineDay} 日夜裡為限。`));
        syncContractObject(world, data, contract, id, world.data.cast.map((member) => member.id));
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
        } else if (c.status === 'settled') {
            publicNotices.push(`「${c.label}」在期限最後一刻生效，款項按約分訖。`);
        }
    }

    // 2. periodic bills FIRST — the 錢莊 knocks before lamp oil is bought; — 錢莊月息、屋租按期收，不是每日勻繳。Due at the end
    //     due at the end of dueDay, short payment stands as chased debt.
    for (const bill of data.bills ?? []) {
        const remaining = BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits);
        if (remaining <= 0n || req.day < bill.dueDay) continue;
        const troupe = contract.economy.accounts[data.troupeAccountId];
        const pay = troupe.available < remaining ? troupe.available : remaining;
        if (pay > 0n) {
            const moved = collectDue(contract.economy, {
                txnId: `day${req.day}:bill:${bill.id}`,
                from: data.troupeAccountId,
                to: data.marketAccountId,
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

    // 2b. wages + fixed costs through the ONE settlement transition.
    const settle = settleEconomyDay(contract.economy, {
        day: req.day,
        causeEventId,
        wages: data.wages.length
            ? { payerAccountId: data.troupeAccountId, orders: data.wages.map((wage) => ({ memberAccountId: wage.accountId, amount: BigInt(wage.amountSubunits) })) }
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

    // 3. shortfalls become objective world state, not adjectives.
    let wagesShort = false;
    for (const wage of data.wages) {
        const paid = settle.perAccount[wage.accountId]?.wage ?? 0n;
        if (paid < BigInt(wage.amountSubunits)) wagesShort = true;
    }
    if (wagesShort) publicNotices.push('班庫見底，今日班中俸未能發足——欠薪記在眾人眼裡的那本帳上。');
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

    return { settled: true, publicNotices, privateNotices };
}

// ── season-frame seeding (authored JSON → live ledger) ──

/** The `economy` block a season frame JSON may author. Amounts in whole 圓. */
export interface SeasonEconomyFrame {
    unitLabel?: string;
    subunitsPerUnit?: number;
    /** scene NAME where public settlement notices post. */
    noticeScene: string;
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
    businesses?: Array<{ id: string; label: string; openingYuan: number }>;
    /** per-character overrides; unlisted cast get characterDefaults. */
    characters?: Array<{ name: string; openingYuan?: number; dailyFixedCostYuan?: number }>;
    characterDefaults?: { openingYuan: number; dailyFixedCostYuan: number };
    /** daily wage out of the troupe treasury; unlisted cast draw no wage. */
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
        wages: (frame.wages ?? []).map((wage) => ({ accountId: idFor(wage.name), amountSubunits: asSubunits(wage.amountYuan).toString() })),
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
