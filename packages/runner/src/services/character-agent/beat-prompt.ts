/**
 * Character Agent — BEAT PROMPT (pure leaf, node-clean).
 * ============================================================================
 * Everything here is a pure string builder / derivation with ZERO imports — no
 * `@endless-story/llm`, no `.js` specifiers — so it loads under plain
 * `node --test` type-stripping. The engine package's mechanical tests import
 * this file directly (exports entry `./services/character-agent/beat-prompt`)
 * to assert prompt content (pronoun guard, gender note) without dragging the
 * tsx-only runner barrel into the module graph. `beat.ts` re-exports the whole
 * surface, so package consumers are unaffected.
 */

import { toTraditional } from '@endless-story/shared/to-traditional';

export type BeatForcing = 'idle' | 'pressing' | 'edge' | 'breaking';

export interface ActBeatInput {
    /** Provenance for a durable character session. Omit for stateless probes. */
    sagaId?: string;
    characterId?: string;
    perceptId?: string;
    name: string;
    persona: string;
    /** Memory snippets — surface only when the moment calls (§2.45 暗號 echoes). */
    memories?: string[];
    /** Saga tone line (profile-sourced; e.g. warm base). */
    tone?: string;
    /** Clock label, e.g. 黃昏. */
    clock: string;
    sceneName: string;
    /** What this place physically is/looks like (the venue's world hint). Grounds the
     *  beat in THIS room — the anti-teleport rule rides on it (a remembered object that
     *  lives elsewhere must not materialize here). */
    sceneHint?: string;
    /** Objective object affordances at this venue for this actor. Knowledge of an
     * off-scene object never places it here. */
    objects?: Array<{
        id: string;
        label: string;
        state?: string;
        container?: string;
    }>;
    isPrivate: boolean;
    /** Co-present characters (empty = alone). `role` = 行當; `tie` = the actor's
     *  OWN canon feeling toward them (e.g. 你對TA：師承) so address forms come
     *  from the graph, not guesswork. Never carries the reverse edge — the
     *  other's inner state reaches an actor only through enacted behavior.
     *  `bodyFact` = a short in-world phrase for that co-present person's 身/sex,
     *  used ONLY to make the intimacy register gender-correct (data-driven). */
    others: Array<{ name: string; role?: string; tie?: string; bodyFact?: string; knownAs?: string }>;
    /** This character's OWN 身/sex phrase — half of the gender-aware intimacy note
     *  (the other half is each co-present other's bodyFact). Never a name special-case. */
    bodyFact?: string;
    /** This beat CONTINUES a still-warm encounter (same pair, same private venue, the
     *  immediately preceding tick): pick up mid-moment, no fresh entrance / re-locking.
     *  Only ever set on a scene's first beat. */
    continuation?: boolean;
    /** The tail of the prior scene, as opening context for a continuation. */
    priorTail?: string;
    /** External pressure line (風聲), first beat only. */
    stake?: string;
    want: { desc: string; target?: string };
    /** 執念自揀 (beatPicksWant): the FULL menu of this actor's live wants, hottest-first,
     *  each with qualitative ripeness — NO numbers. When present the beat is invited to
     *  choose which one it pushes THIS beat (or none) via `pushWant` (1-based index into
     *  this list; item 1 == `want`, the hottest). Absent ⇒ the single-want handoff
     *  (prompt byte-identical). */
    wantMenu?: Array<{ desc: string; target?: string; ripe: BeatForcing }>;
    forcing: BeatForcing;
    /** Private scene, exactly two present, and the want's target is the other one. */
    privateAlone: boolean;
    /** Last few beats of this scene's exchange. */
    sceneLog: string;
    /** 文筆二階: this actor's OWN prior beat prose in this scene (prefix stripped),
     *  used to build the dynamic imagery avoid-list (`recurringImagery`). Absent /
     *  empty ⇒ no avoid-list ⇒ prompt byte-identical (fresh scene, or fake agent). */
    selfSceneBeats?: string[];
    /** A previous proposal for this same turn was rejected by objective world
     *  validation. That proposal never happened; preserve the intent but choose
     *  an action that fits the refreshed physical affordances. */
    physicalRejection?: string;
    /** Daily-life undertone line (state block), optional. */
    stateLine?: string;
    /** This character's own private inner-life secret; never another actor's.
     *  Colours the beat's subtext; hidden by default, but whether it ever
     *  surfaces is the character's own in-scene choice (§2.43: never script it). */
    innerSecret?: string;
    /** This character's standing daily plan (N6: 長期目標／眼下打算／未竟之事).
     *  Injected so the beat can act toward the plan, not just react to the hottest
     *  want — a compass, never a script; acting on景 or setting it aside is the
     *  character's own choice. Undefined = no plan (reactive as before). */
    standingPlan?: string;
    /** SKILL style hint (character-SKILL framework): a compact prose descriptor
     *  of this character's conduct/風 skills (`〔技藝〕悲工·…；圓場話·…`), injected
     *  so their SPEECH + BEARING carry their skills — a 悲工 lead's beats read
     *  mournful, a 辛辣 記者's cutting. Advisory colour woven into conduct, never
     *  a script and never a menu to recite. Undefined = no conduct skill (beat
     *  unchanged, full backward-compat). */
    styleHint?: string;
    /** Items this character CARRIES right now (隨身物/行頭, each with provenance,
     *  e.g. 「白韻秋所贈的湘妃竹摺扇」). Whether/when to bring one out is the
     *  character's own in-scene choice — never scripted, never forced. */
    carried?: string[];
    /** Canon honorifics facts (identity guardrail, e.g. 蘇映雪為師姐). */
    etiquette?: string;
    /** the world's clock constitution: parts of day, one action per part,
     *  when the show opens and when the ledger settles — the rules an agent
     *  needs to BUDGET a day instead of living one beat at a time. */
    timeCharter?: string;
    /** §2.47/§2.53: the intimacy register is OPEN for this beat — either an old
     *  established pair alone at night, or this scene's own advance→accept
     *  negotiation opened it. Availability is permission, never a push. */
    consummate?: boolean;
    /** The other JUST made an overture (their previous beat tagged 'advance'):
     *  accepting or declining is entirely this actor's choice. */
    intimacyOffered?: boolean;
    /** Private 2-person scene where an overture is POSSIBLE this beat (no status
     *  gate — wanting to be close is a choice, not a permission). */
    intimacyPossible?: boolean;
    /** Season money ledger for THIS actor (pre-scoped by the engine: own purse,
     *  authorized treasury view, live contract terms, purchasable items here).
     *  Rendered verbatim; money moves only through economyCommands. */
    economyLine?: string;
    /** 借賒有據 (creditVerbs): which credit verbs to 亮牌 for this actor RIGHT
     *  HERE — `borrow` when a co-present cast member could be asked, `repay`
     *  when the actor holds an open 欠條 to someone co-present. Computed by the
     *  engine (flag-gated); absent ⇒ the money-ledger advertisement is
     *  byte-identical to before (characters only invoke what's advertised). */
    credit?: { borrow?: boolean; repay?: boolean };
}

export interface BeatObjectEffect {
    objectId: string;
    /** Destination venue name. Omit when the object stays in this scene. */
    toScene?: string;
    /** Registered object id or an ordinary in-scene container label; null clears it. */
    container?: string | null;
    /** True when the acting character takes it onto their person; false when
     * they set it down or hand it off. The engine resolves "actor" to an id. */
    carried?: boolean;
    /** Formal co-present character name when handing the object directly to
     * someone else. This is distinct from carried:false (set it down). */
    carrierName?: string | null;
    visibility?: 'visible' | 'hidden' | 'destroyed';
    /** Concrete state after the beat, e.g. open/closed/torn. */
    state?: string;
}

/**
 * A structured money/contract command proposed by a beat. Prose alone never
 * moves money — the engine validates authority, balance, price and contract
 * state against the season economy ledger, then commits or rejects the beat
 * (the same fail-loud contract as objectEffects/physical canon).
 */
export interface BeatEconomyCommand {
    action: 'purchase' | 'pay' | 'borrow' | 'repay' | 'contract_sign' | 'contract_reject' | 'contract_fill_partner' | 'contract_counter';
    /** purchase: a catalog item id from the beat's money-ledger listing. */
    itemId?: string;
    /** pay: recipient — a formal character name, or 班庫 for the troupe treasury.
     *  borrow: the CO-PRESENT lender's formal name (their consent decides).
     *  repay: the creditor being repaid (a 欠條 holder). */
    toName?: string;
    /** pay / borrow / repay: amount in whole 圓 (positive integer). */
    amountYuan?: number;
    /** borrow: 約定還期日數（正整數；省略＝15，至多 60）。 */
    dueDays?: number;
    /** Source of funds: own purse (default) or the troupe treasury (authorized only). */
    fromAccount?: 'self' | 'troupe';
    /** contract_*: the contract id from the beat's money-ledger listing. */
    contractId?: string;
    /** contract_fill_partner: the named 聯名搭檔's formal character name. */
    partnerName?: string;
    /** contract_counter: the written demand pushed back at the proposer (still their choice to accept). */
    demand?: string;
    /** contract_counter: 還價要對方在總價外加碼的圓數（整數）；只改條件不改錢則不填 — a
     *  SELF-TAG the engine routes on, never regex on prose. */
    askYuan?: number;
    memo?: string;
}

/**
 * GENERAL pronoun derivation from a 身/sex phrase (data-driven, never name-cased):
 * a bodyFact naming 男 → 他, everything else → 她. Used to name each co-present
 * person's correct pronoun so the prose stops defaulting 她 onto a male co-star.
 */
export function pronounFromBody(bodyFact?: string): '他' | '她' {
    // 女 outranks 男: a 坤生's bodyFact reads 「女兒身…台上扮男」 — the naive
    // includes('男') made the GUARD ITSELF emit 他 for her, poisoning every
    // prompt it was meant to protect (the root of the persistent 他-slips).
    if (!bodyFact) return '她';
    if (bodyFact.includes('女')) return '她';
    return bodyFact.includes('男') ? '他' : '她';
}

/**
 * GENERAL pronoun-guard line composed from the ACTUAL cast's bodyFacts (this actor +
 * each co-present other that carries a 身 phrase). No names or pairings hardcoded —
 * the correct 他/她 for each present person is derived from their bodyFact.
 */
function pronounNote(input: ActBeatInput): string {
    const people: string[] = [`${input.name}是${pronounFromBody(input.bodyFact)}`];
    for (const o of input.others) {
        // 相識分寸: refer to each other as this actor knows them (knownAs ?? name).
        if (o.bodyFact) people.push(`${o.knownAs ?? o.name}是${pronounFromBody(o.bodyFact)}`);
    }
    if (people.length <= 1) return '';
    return `【稱呼在場的人用對的代詞】${people.join('、')}——別張冠李戴、別把男子寫成「她」。`;
}

/** §2.53-validated L3 register, AGENCY-FRAMED: availability is permission, not a
 *  push. The craft constraints (艷而有情、露而不穢) hold IF the pair goes there;
 *  whether they go there, and when they close the night, is theirs — with the
 *  cost named (the hour spent, sleep shortened). */
const CONSUMMATE_BEAT_NOTE = [
    '【此處的許可（僅此私處、兩情相悅時）】此處無人，彼此的心意已經接上——要不要親近、',
    '走到哪一步、用什麼分寸，全由你們一拍一拍自己定；矜持與熱烈都是戲，誰也不欠誰一場雲雨。',
    '若真到了雲雨處，以古典話本筆法寫：艷而有情、露而不穢，忌現代詞、忌髒字。',
    '【代價】夜有多深、明日有無戲，這一晚怎麼花由你們自己掂量；盡興了、乏了、或心裡到了，就把這場收了。',
].join('');

/**
 * GENERAL, data-driven gender note for a consummate beat — composed at call time
 * from the ACTUAL participants' bodyFacts (this actor's own 身 + each co-present
 * other's 身). NO names or pairings are hardcoded; the LLM judges gender + state +
 * style from the data, so it works for 女女 / 男女 / 男男 alike. When the pair share
 * a long history, the bodies/years lead the beat, not the transactional errand.
 */
function genderNote(input: ActBeatInput): string {
    const you = input.bodyFact ? `${input.name}（${input.bodyFact}）` : input.name;
    const withBody = input.others.filter((o) => o.bodyFact);
    const them = withBody.length
        ? withBody.map((o) => `${o.knownAs ?? o.name}（${o.bodyFact}）`).join('、')
        : input.want.target ?? '對方';
    // SAME-SEX detection is data-driven (both 身 derive to the same 他/她) and only
    // fires when we hold both bodyFacts. It bans heteronormative penetration + the
    // invent-an-organ hedge (「沒根的東西」-type) that a 女女 床戲 wrongly produced.
    const other = withBody[0];
    const sameSex =
        !!input.bodyFact && !!other?.bodyFact && pronounFromBody(input.bodyFact) === pronounFromBody(other.bodyFact);
    const sameSexNote = sameSex
        ? '【同性之間的分寸】你二人是同一種身子，這場親密在手、在口、在身體相貼、在廝磨廝纏、在腿股腰背的糾纏，' +
          '**不在插入**；切勿寫成一方「進入」另一方，更**不許無中生有**寫出兩人身上都沒有的物事' +
          '（「那沒根的東西」「下身那物」這類含糊器官一概不許）。露骨可以，但要合乎兩具真實的身子。'
        : '';
    return (
        `【此刻兩人的身】此間${you}與${them}赤誠相對——` +
        '依兩人各自的身與此刻情狀，如實寫這場雲雨，合乎兩人性別，勿張冠李戴、' +
        '勿憑空生出對方身上沒有的器官；筆法、主動被動、剛柔皆隨兩人性情，不落套。' +
        '若兩人本有多年情分，就讓那身子與歲月裡的熟稔牽著這一段走——那樁熱望不過是個由頭，' +
        '真正承著這一刻的，是兩具早已相識的身與那些年。' +
        sameSexNote +
        // §金瓶梅 is talk-heavy: keep it dialogue-rich, and let the lead pass back and
        // forth (no fixed 純受). General — no names, no pairing assumptions.
        '【筆法】金瓶梅式的艷情是話多的：這一拍要嘛有一句話、要嘛有一個帶著性子的反應，別只是乾寫身體；' +
        '主動與被動要來回流轉，別讓某一方每一拍都是不出聲的純受——有取有予，兩個人都在這場裡。'
    );
}

export interface BeatResult {
    /** Objective act/say, one line. */
    beat: string;
    /** Private thought, one line. */
    inner: string;
    /** Who this beat addresses (co-present name), if anyone. */
    addressed?: string;
    /** Who can perceive the exact words/action. `addressed` is a deliberate
     *  aside/whisper; everyone else only observes that a private exchange took
     *  place. This is structured so the engine never infers privacy from prose. */
    audience?: 'scene' | 'addressed';
    /** Scene name to move to, if leaving. */
    /** @deprecated Parsed only so the engine can reject legacy cross-scene
     * proposals. Venue changes belong exclusively to decideMove. */
    move?: string;
    /** The actor CLOSES the scene on this beat (sleep/farewell/enough) — their
     *  own ending, honoured by the loop. */
    close?: boolean;
    /** Intimacy negotiation, self-tagged (private 2-person scenes only):
     *  'advance' = this beat carries an overture toward the other;
     *  'accept' / 'decline' = the answer to an overture on the table.
     *  No judge, no status gate — the pair negotiates in-scene; a decline is
     *  honoured and is itself a beat of drama. */
    intimacy?: 'advance' | 'accept' | 'decline';
    /** 執念自揀 (beatPicksWant): 1-based index into the `wantMenu` the actor was shown,
     *  naming which want this beat actually pushed. Only meaningful when a menu was
     *  offered; the engine re-binds the ledger (heat/frust/sat/resolution) to the
     *  chosen want. Absent / 0 / out-of-range ⇒ the engine keeps its hottest-want
     *  default (a beat that pushes nothing in particular is legitimate). */
    pushWant?: number;
    /** Objective physical mutations proposed by this beat. The engine validates
     * preconditions and commits them; prose alone can never move an object. */
    objectEffects?: BeatObjectEffect[];
    /** Structured money/contract commands proposed by this beat. The engine
     * validates authority/balance/price and commits them; prose alone can never
     * move money or sign a contract. */
    economyCommands?: BeatEconomyCommand[];
}

function extractBeatJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try { return JSON.parse(blocks[i]) as Record<string, unknown>; } catch { /* earlier block */ }
    }
    return null;
}

/** Shared by the stateless runner and the persistent-session adapter. */
export function parseBeatResult(raw: string, actorName: string): BeatResult {
    const o = extractBeatJson(raw) ?? {};
    const str = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
    const prose = (v: unknown): string => toTraditional(str(v));
    const esc = actorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const deName = (t: string): string => t.replace(new RegExp(`^${esc}(?!的)\\s*[:：]?\\s*`), '');
    const addressed = prose(o.addressed);
    const audience = o.audience === 'addressed' && addressed && addressed !== '無'
        ? 'addressed'
        : 'scene';
    const move = prose(o.move);
    // 執念自揀: a 1-based menu index. Only a positive integer counts; 0 / absent /
    // non-integer ⇒ the engine keeps its hottest-want default (pushed nothing).
    const pushWant = typeof o.pushWant === 'number' && Number.isInteger(o.pushWant) && o.pushWant > 0
        ? o.pushWant
        : undefined;
    const ECONOMY_ACTIONS = ['purchase', 'pay', 'borrow', 'repay', 'contract_sign', 'contract_reject', 'contract_fill_partner', 'contract_counter'] as const;
    const economyCommands = Array.isArray(o.economyCommands)
        ? o.economyCommands.flatMap((rawCommand): BeatEconomyCommand[] => {
            if (!rawCommand || typeof rawCommand !== 'object') return [];
            const command = rawCommand as Record<string, unknown>;
            const action = ECONOMY_ACTIONS.find((candidate) => candidate === command.action);
            if (!action) return [];
            const amountYuan = typeof command.amountYuan === 'number' && Number.isFinite(command.amountYuan)
                ? Math.floor(command.amountYuan)
                : undefined;
            // askYuan is a self-tag the engine routes money-counters on: only a
            // finite positive integer counts; anything else drops the field.
            const askYuan = typeof command.askYuan === 'number' && Number.isInteger(command.askYuan) && command.askYuan > 0
                ? command.askYuan
                : undefined;
            // dueDays (borrow) likewise: only a positive integer counts — the
            // engine defaults 15 / caps 60 when absent or dropped.
            const dueDays = typeof command.dueDays === 'number' && Number.isInteger(command.dueDays) && command.dueDays > 0
                ? command.dueDays
                : undefined;
            return [{
                action,
                itemId: str(command.itemId) || undefined,
                toName: prose(command.toName) || undefined,
                amountYuan,
                dueDays,
                fromAccount: command.fromAccount === 'troupe' ? 'troupe' : command.fromAccount === 'self' ? 'self' : undefined,
                contractId: str(command.contractId) || undefined,
                partnerName: prose(command.partnerName) || undefined,
                demand: prose(command.demand) || undefined,
                askYuan,
                memo: prose(command.memo) || undefined,
            }];
        })
        : [];
    const objectEffects = Array.isArray(o.objectEffects)
        ? o.objectEffects.flatMap((rawEffect): BeatObjectEffect[] => {
            if (!rawEffect || typeof rawEffect !== 'object') return [];
            const effect = rawEffect as Record<string, unknown>;
            const objectId = str(effect.objectId);
            if (!objectId) return [];
            const visibility = effect.visibility === 'visible' || effect.visibility === 'hidden' || effect.visibility === 'destroyed'
                ? effect.visibility
                : undefined;
            const container = effect.container === null ? null : prose(effect.container) || undefined;
            const carried = typeof effect.carried === 'boolean' ? effect.carried : undefined;
            const carrierName = effect.carrierName === null ? null : prose(effect.carrierName) || undefined;
            const toScene = prose(effect.toScene) || undefined;
            const state = prose(effect.state) || undefined;
            if (!visibility && container === undefined && carried === undefined && carrierName === undefined && !toScene && !state) return [];
            return [{ objectId, visibility, container, carried, carrierName, toScene, state }];
        })
        : [];
    return {
        beat: deName(prose(o.beat)) || '（沉默。）',
        inner: deName(prose(o.inner)),
        addressed: addressed && addressed !== '無' ? addressed : undefined,
        audience,
        move: move && move !== '無' ? move : undefined,
        close: o.close === true ? true : undefined,
        intimacy: o.intimacy === 'advance' || o.intimacy === 'accept' || o.intimacy === 'decline' ? o.intimacy : undefined,
        pushWant,
        objectEffects: objectEffects.length ? objectEffects : undefined,
        economyCommands: economyCommands.length ? economyCommands : undefined,
    };
}

function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[b.length];
}

function spokenSegments(text: string): string[] {
    return text.match(/[「『“"][^」』”"]*[」』”"]/g) ?? [];
}

/** A reviewer is an editor, not a second author. Reject candidate text that
 * changes spoken dialogue or rewrites too much of the objective action. */
export function safeSceneRevision(original: string, candidate: string): string {
    const normalized = toTraditional(candidate.trim());
    if (!normalized) return original;
    if (JSON.stringify(spokenSegments(original)) !== JSON.stringify(spokenSegments(normalized))) return original;
    const maxEdit = Math.max(6, Math.ceil(original.length * 0.28));
    return editDistance(original, normalized) <= maxEdit ? normalized : original;
}

/** 執念自揀: qualitative ripeness for a menu item — the SAME lexicon family as the
 *  move prompt's RIPE_ZH (numbers never enter the prompt), phrased for a beat. */
const RIPE_BEAT_ZH: Record<BeatForcing, string> = {
    idle: '淡淡的，擱著也不急',
    pressing: '按得住，卻總想起',
    edge: '快按不住了',
    breaking: '再壓就要溢出來了',
};

/** 執念自揀: render the full want menu (hottest-first, qualitative ripeness only)
 *  and hand the choice to the character. Replaces the single-want line when a menu
 *  is offered (beatPicksWant on). Item numbers are for the `pushWant` tag ONLY and
 *  must never bleed into the prose. */
function wantMenuNote(menu: NonNullable<ActBeatInput['wantMenu']>): string {
    return [
        '【你心裡這些事，此刻都在（火候各異，這一拍推哪一件由你）】',
        ...menu.map((m, i) => `〔${i + 1}〕「${m.desc}」${m.target ? `（牽涉${m.target}）` : ''}——此刻${RIPE_BEAT_ZH[m.ripe]}`),
        '這一拍你真正使力去推的是哪一件，由你的心與分寸；在 JSON 裡標 "pushWant":該編號。' +
            '若這拍你誰也不特別推——只是應個景、陪著、家常——標 0 或省略即可，不必勉強挑一件。' +
            '編號只為讓你回報所推之事，別把數字或「執念/想要」這類字眼寫進台詞。',
    ].join('\n');
}

/** §2.43-validated pressure language: removes stalling, never writes the answer. */
function forceNote(forcing: BeatForcing, privateAlone: boolean): string {
    if (forcing === 'idle')
        return privateAlone
            ? '此處只你二人、沒有眼睛，這是難得能這樣挨著的時候，順著心。'
            : '這事藏著就藏著、緩著就緩著。';
    if (forcing === 'pressing')
        return privateAlone
            ? '無人看著，藏了多年的，在這方寸裡有點按不住了。'
            : '心裡翻著，可人前多半還是按下不表。';
    if (forcing === 'breaking')
        // H3: past the edge — the want has become unbearable. Cross the line
        // this beat; the answer is still yours (confess, reckon, break, or bolt).
        return privateAlone
            ? '到頭了，一個字也壓不回去——只你二人，這一刻把積在心底最深的那句話、那個動作做出來，放不回頭也認了。'
            : '到頭了，再壓下去人就要散了——就在這些眼睛底下，做出那件放不回頭的事，由你的心。';
    return privateAlone
        ? '再也按不住了——只你二人、沒有眼睛，這年頭唯一能這樣的地方，這一刻全由你的心。'
        : '再也按不住了——這一刻你得做一件放不回頭的事，由你的心。';
}

/** Two CJK strings share a 3-char contiguous run (used to fold near-duplicate
 *  n-grams into one representative tic). */
function sharesRun3(a: string, b: string): boolean {
    for (let i = 0; i + 3 <= a.length; i++) {
        if (b.includes(a.slice(i, i + 3))) return true;
    }
    return false;
}

/**
 * 文筆二階 — dynamic imagery avoid-list. Given a character's OWN prior beats in
 * this scene, returns the vivid phrase-tics they are ALREADY looping — the
 * somatic/imagery 5-grams a long scene starts re-performing.
 *
 * The window is deliberately the actor's own beats, not the mixed exchange:
 * measured on a real 床戲, the pathology is per-character and scene-dense — 金鳳
 * reached for 「空著的那隻手」in 5 of 16 own beats, 柳安春 for 「著的那隻手」in 7 —
 * yet ANY 5-beat mixed window caught nothing, because each tic recurs every few
 * beats, not back-to-back. So we look at what THIS actor keeps doing across the
 * whole scene (last 12 beats), mirroring the offline metric's per-character
 * contiguous-CJK-5-gram count (once per beat).
 *
 * Static #171 forbids a fixed menu of gestures; this catches whatever THIS
 * character is over-using in THIS scene, by name.
 *
 * Pure & inert-by-default: <2 own beats or no repetition ⇒ `[]` ⇒ the prompt is
 * byte-identical to before. Returns distinct tics (near-duplicate n-grams
 * folded), highest-count first, capped.
 */
export function recurringImagery(ownSceneBeats: string[] | undefined): string[] {
    if (!ownSceneBeats || ownSceneBeats.length < 2) return [];
    const recent = ownSceneBeats.slice(-12);
    const CJK5 = /^[一-鿿]{5}$/;
    const counts = new Map<string, number>();
    for (const beat of recent) {
        const seen = new Set<string>();
        for (let i = 0; i + 5 <= beat.length; i++) {
            const gram = beat.slice(i, i + 5);
            if (CJK5.test(gram) && !seen.has(gram)) {
                seen.add(gram);
                counts.set(gram, (counts.get(gram) ?? 0) + 1);
            }
        }
    }
    const hot = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .map(([gram]) => gram);
    const kept: string[] = [];
    for (const gram of hot) {
        if (kept.some((k) => sharesRun3(k, gram))) continue;
        kept.push(gram);
        if (kept.length >= 6) break;
    }
    return kept;
}

export function buildBeatSystemPrompt(input: ActBeatInput): string {
    const mem = input.memories?.length
        ? `\n你心底偶爾翻起的舊事(對景就讓它浮上來、不對景別硬提)：\n- ${input.memories.join('\n- ')}`
        : '';
    const where = `你在【${input.sceneName}】${input.isPrivate ? '(私房)' : ''}，同場：${
        input.others.length
            ? input.others
                  .map((o) => {
                      // 相識分寸: DISPLAY the perceived name (knownAs ?? name); the
                      // canonical name stays intact upstream for addressed matching.
                      const shown = o.knownAs ?? o.name;
                      const facts = [o.role, o.tie].filter(Boolean).join('｜');
                      return facts ? `${shown}（${facts}）` : shown;
                  })
                  .join('、')
            : '只你一人'
    }。`;
    const state = input.stateLine ? `\n${input.stateLine}` : '';
    const innerSecret = input.innerSecret
        ? `\n【心底藏著、外人不知的事（只有你自己知道。平日它藏著、只從言外之意漏出來；藏不藏得住、要不要讓它見光，由你在這一拍自己拿主意）】${input.innerSecret}`
        : '';
    const objectLedger = input.objects?.length
        ? [
            '【本場物理帳（唯一真相）】只有下列物件在此刻可看見／觸碰：',
            ...input.objects.map((object) => `- id=${object.id}｜${object.label}${object.container ? `｜在${object.container}內` : ''}${object.state ? `｜${object.state}` : ''}`),
            '若這一拍使登記物件換場、換容器、被藏起／公開／毀去，必須同步填 objectEffects；沒有 effect，世界就不會改。拿進自己懷裡、袖中或口袋並打算帶走時填 carried:true；放下填 carried:false；直接交給同場某人必須填 carrierName:對方正式姓名（不能只填 carried:false）。',
            '不可操作清單外的物件。記得它在別處，只能說起或在 inner 想起，不能用眼看、用手碰。',
        ].join('\n')
        : '【本場物理帳（唯一真相）】沒有可操作的登記物件。知道別處有某物，只能在話裡或 inner 提及，不可看見、指向或觸碰。';
    const economyLedger = input.economyLine
        ? [
            input.economyLine,
            '銀錢與契約只在 economyCommands 裡動：口頭說付錢、簽字而不出 command，銀錢與契約就不會動；',
            '不可買清單外的東西、不可動你無權動的帳。命令若不合法（錢不夠、無權、契約已了結），世界會拒絕這一拍。',
        ].join('\n')
        : '';
    return [
        `你就是${input.name}。${input.persona}${mem}`,
        input.tone ?? '',
        `【此刻】${input.clock}。${where}${input.stake ? `\n【風聲】${input.stake}` : ''}${state}${innerSecret}`,
        input.sceneHint
            ? `【此處光景】${input.sceneHint}。眼前只有此處真有的物事——記憶裡別處的東西（誰家窗台的花、誰房裡的擺設）不會憑空出現在這裡，除非有人隨身帶了來；要提別處的物件，用話語提，不用手指。`
            : '',
        objectLedger,
        economyLedger,
        input.physicalRejection
            ? `【上一個動作沒有發生】世界拒絕了你剛才的提案：${input.physicalRejection}\n` +
              '那不是回憶、不是上一拍，也不可辯解或在台詞裡提到規則。保留你原本的心意，重新做一個此刻此地真的辦得到的動作；嚴格以刷新後的物理帳為準。'
            : '',
        '【位置已提交】本 tick 的自主移動已經完成，你現在確實位於此處。這一拍只做此處做得到的事，不能再走去另一個場景。若想離場，用 close:true 收住此場；下一 tick 你會重新得到合法去處選項。',
        '【文字】beat、inner 與所有文字欄位一律使用繁體中文（臺灣用字），不得繁簡混雜。',
        // 量測自真跑卷的兩大文筆病灶：同角色小動作意象 ≥3 拍重演（磕鏟沿×4、摸花串×3）、
        // 銀錢數字全卷覆誦（三十四圓半×8）。一條戒律同治兩者。
        '【身段換樣】同一個小動作意象（磕鏟沿、轉摺扇、抹嘴角、摸鬢邊之類）別拍拍重演——前幾拍你用過的身段，這一拍換個樣子，或干脆讓手閒著；銀錢數目與帳面數字，場上有人說過一次就夠，你至多一句帶過，不可再照數覆誦。',
        // 文筆二階（動態）：靜態戒律管不住「這一場」正在滾的字眼——長戲會自我複讀
        // 某幾個身體落點（脈門、喉頭、額頭相抵）。從近拍實抽正在反覆的片語，指名叫它
        // 換一種。近拍太短或無重複 ⇒ 空 ⇒ 這條不出現（與從前逐字相同）。
        ...(() => {
            const tics = recurringImagery(input.selfSceneBeats);
            return tics.length
                ? [`【近拍已用・這一拍換一種】方才幾拍裡（你或對手）已反覆出現這些字眼：${tics.map((g) => `「${g}」`).join('、')}。別再落回同一個點——同一層意思，改用另一個身體部位、另一個動作或比喻寫出來，讓這一拍的身段與前幾拍不一樣。`]
                : [];
        })(),
        // Metaphor stays metaphor: the want language runs on 帳/債/欠 imagery, and an
        // ungarded beat once materialized a paper 借據 to collect an EMOTIONAL debt.
        '【比喻不落地】心帳不是紙帳：欠的若是情分、話語、一句交代，就不可憑空掏出借據、文書、銀錢等有形物來討——手上能拿出的東西，只有此處真有的和你隨身帶著的。',
        pronounNote(input),
        input.carried?.length
            ? `【隨身】你身上帶著：${input.carried.join('、')}。用不用、何時拿出來，由你——對景就讓它出手，不對景就讓它待在袖底，別為了提而提。`
            : '【隨身】此刻沒有已登記可拿出的私人物件；不得從口袋、袖底憑空摸出懷錶、信、相片等道具。可用眼前場景原有的公共物件，也可觸碰自己正穿著的衣物。',
        input.etiquette ? `【稱謂鐵則】${input.etiquette}——輩分與稱呼不可顛倒、不可自創。` : '',
        input.standingPlan
            ? `【你這些日子的打算（心裡的盤算，不是台詞）】\n${input.standingPlan}\n——對景就往那裡走一步，不對景就先擱著；別把它照唸出來、也別為了提而提。`
            : '',
        input.styleHint
            ? `【你的看家本事與行事風格（貫在言行裡，別報菜名）】\n${input.styleHint}\n——它是你出手、開口、待人的底色；自然帶出來，不要照唸技藝的名目。`
            : '',
        input.timeCharter ? `【時辰之律】${input.timeCharter}` : '',
        // A continuation picks up a still-warm private encounter mid-moment (general;
        // keyed by caller on pair+venue+consecutive-tick). No fresh entrance, no re-lock.
        input.continuation
            ? `【承接前情】你們方才已在此處相擁纏綿，這一刻是同一段未了的光景往下走，不是重新進門、不必再敲門落鎖，順著剛才的姿態與氣息接續。${input.priorTail ? `方才到這裡：${input.priorTail}` : ''}`
            : '',
        input.consummate ? CONSUMMATE_BEAT_NOTE + genderNote(input) : '',
        input.intimacyOffered
            ? '【方才那一拍】TA 遞了親近的意圖過來。接或不接，全由你此刻的心：接，就讓這一拍應上去（intimacy:"accept"）；不接，安安穩穩地把它放下（intimacy:"decline"），不必失禮也不必解釋——那也是一拍戲。' +
              '**「接」只指一件事：你心裡允了這份肌膚親近。**若你這拍是接招、邀戰、譏誚回敬（「拿來看」「誰怕誰」之類），那是較勁不是允諾——不要標 accept；拿不準就什麼都不標。'
            : '',
        !input.intimacyOffered && input.intimacyPossible && !input.consummate
            ? '【若你想】此處只你二人。若你此刻真起了親近TA的心，就讓這一拍帶著那個意圖（intimacy:"advance"）——但多數的夜，什麼也不必發生；由你的心與分寸。' +
              '**「遞意」只指親近之心（意在這個人，想與TA肌膚相親）**；比武叫陣、威逼壓制、拿身子佔上風都不是遞意，別標。'
            : '',
        input.wantMenu?.length
            ? wantMenuNote(input.wantMenu)
            : `你心裡最重的：「${input.want.desc}」${input.want.target ? `（牽涉${input.want.target}）` : ''}。`,
        '【誓言有價】「命」「一輩子」「終身」是一生說一兩次的字——尋常的情話用尋常的字，'+
            '尋常的允諾給尋常的分量（今晚、這一場、這一件事）。天天押命的人，說的命就不值錢了。',
        '【說人話】多數的話是直說的——問路、催飯、道謝、抱怨、叫人名字；比方留給真到了那一步的時刻，'+
            '同一個比方一場戲至多用一次。兩個人說話不是猜謎，聽的人（和看戲的人）得聽得懂。',
        forceNote(input.forcing, input.privateAlone),
        '【知覺邊界】audience 只有兩種：scene＝同場者都看得／聽得這一拍完整內容；addressed＝你故意壓低聲音、耳語或遮掩，只讓 addressed 那個人知道完整內容。不要由文字後猜，在 JSON 裡自己標清楚；沒有對象時不得標 addressed。',
        // WARMTH SOIL (not a push): when nothing is burning, ordinary tenderness is
        // legitimate DRAMA — affection is mostly accrued in these small beats, and a
        // register that only knows pressure reads loveless between the beds.
        input.forcing === 'idle' && !input.consummate && input.isPrivate
            ? '【尋常的暖】若此刻沒什麼要緊事逼著，家常的細碎也是戲：一碗茶、一句閒話、替TA整整衣領、陪TA站一會兒——情分多半是這些一點點攢出來的。'
            : '',
        input.consummate
            ? '**這是一段正在進行的來回，接著剛剛的話與動作往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事——可以是一個動作、一句話、或（若你們往那處去了）床笫間的一下進退(一到三句)。' +
              'beat 是寫入正史逐拍的敘述，外層會另加你的名字：不要以「我」起筆、不要再寫一次自己名字；只有引號裡真正說出口的話可以用「我」。' +
              '輸出 JSON：{"beat":"客觀做了/說了什麼","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","audience":"scene|addressed","close":true或false（收場就 true）,"intimacy":"advance|accept|decline|無","objectEffects":[{"objectId":"登記id","toScene":"新場景或省略","container":"新容器/null/省略","carried":true或false或省略,"carrierName":"交給的同場者正式姓名或省略","visibility":"visible|hidden|destroyed或省略","state":"新狀態或省略"}]}。沒有物理改變就給空陣列。不要 markdown。'
            : '**這是一段正在進行的來回，接著剛剛的話往下、回應在場的人，別自說自話。** 做你此刻真會做或說的一件事——一到兩句，動作與話都可以帶著性子多走半步。' +
              'beat 是寫入正史逐拍的敘述，外層會另加你的名字：不要以「我」起筆、不要再寫一次自己名字；只有引號裡真正說出口的話可以用「我」。' +
              '輸出 JSON：{"beat":"客觀做了/說了什麼(一句)","inner":"心裡一句","addressed":"你這拍對著誰(在場某人名/無)","audience":"scene|addressed","close":true或false（收場就 true）,"intimacy":"advance|accept|decline|無","objectEffects":[{"objectId":"登記id","toScene":"新場景或省略","container":"新容器/null/省略","carried":true或false或省略,"carrierName":"交給的同場者正式姓名或省略","visibility":"visible|hidden|destroyed或省略","state":"新狀態或省略"}]}。沒有物理改變就給空陣列。不要 markdown。',
        // 執念自揀: only when a menu was offered — keeps the flag-off schema byte-identical.
        input.wantMenu?.length
            ? '（承上「你心裡這些事」：在同一個 JSON 裡另加 "pushWant":你這一拍真正使力那件的編號；誰也不特別推就給 0 或省略。）'
            : '',
        input.economyLine
            ? '若這一拍真有銀錢或契約動作，另在同一個 JSON 加 "economyCommands":[{"action":"purchase|pay|' +
              // 借賒有據: the credit verbs are advertised ONLY when the engine says
              // they apply here (flag on + a counterpart / an open 欠條) — absent
              // `credit` keeps this advertisement byte-identical to before.
              `${input.credit?.borrow ? 'borrow|' : ''}${input.credit?.repay ? 'repay|' : ''}` +
              'contract_sign|contract_reject|contract_fill_partner|contract_counter","itemId":"購買項目id或省略","toName":"收款人正式姓名或班庫或省略","amountYuan":整數圓或省略,"fromAccount":"self|troupe(省略=self)","contractId":"契約id或省略","partnerName":"聯名搭檔正式姓名或省略","demand":"還價條款一句（contract_counter 用）：寫你要的條款；若這句還價是要對方加碼銀錢，另附下面的 askYuan，並在 demand 裡寫明這筆錢該落誰帳上、為什麼。或省略","askYuan":整數圓數（加碼的數目，contract_counter 銀錢還價才附；只改條件不改錢就省略）或省略,"memo":"一句緣由或省略"}]；沒有銀錢動作就整欄省略。簽署契約的那一拍，economyCommands 與 objectEffects（契約物件狀態）要一起出。' +
              (input.credit?.borrow
                  ? '\n同場可開口告借（borrow）：toName＝出借人正式姓名、amountYuan＝整數圓、dueDays＝約定幾日內還（省略＝15，至多60）、memo＝緣故——借不借由對方當場定奪：應了錢即刻過手、欠條記帳到期照催；婉拒也作數，這一拍照樣落地。'
                  : '') +
              (input.credit?.repay
                  ? '\n你名下有欠條可還（repay）：toName＝債主正式姓名、amountYuan＝整數圓，當面還帳沖銷欠條——只沖欠著的數，白給請用 pay。'
                  : '')
            : '',
    ]
        .filter(Boolean)
        .join('\n');
}
