/**
 * RunnerSceneAgent — the real-LLM SceneAgentPort. Thin wrapper over
 * `@endless-story/runner`'s character-agent + scene-record + event-chapter
 * services. Every method is a straight delegate; the runner services own the
 * prompts and validation.
 *
 * This module imports the runner package eagerly (its `.js` specifiers only load
 * under tsx / a bundler), so it lives OUTSIDE the node-clean barrel and is
 * dynamically imported by the CLI only when `--real-llm` is set.
 */

import { characterAgent, sceneRecord, eventChapter, eventDossier } from '@endless-story/runner';
import { text as llmText } from '@endless-story/llm';
import { toTraditional } from '@endless-story/shared/to-traditional';
import * as path from 'node:path';
import type {
    ActionKind,
    AudienceReactionInput,
    ChooseActionInput,
    ChooseActionResult,
    GenesisWant,
    RippleJudgeDelta,
    SceneAgentPort,
    ObserveSceneInput,
    EvolveSecretInput,
    DossierCanonicalEvent,
    DossierPerspectiveSource,
    ComposeDiaryInput,
    ComposeDiaryReply,
    ComposePoemInput,
    ComposePoemReply,
    DebtStanceInput,
    DebtStanceReply,
    DeclareWantSemanticsInput,
    DeclareWantSemanticsReply,
    DirectorPickInput,
    DirectorPickReply,
    InterludeInput,
    InterludeReply,
    SelfModelConsolidateInput,
    SelfModelConsolidateReply,
    PlanDayInput,
    PlanDayReply,
} from '../ports.ts';
import { PROPOSAL_LIMITS, type CardProposal } from '../core/event-deck.ts';
import { WANT_SEMANTIC_TAGS, type WantSemanticTag } from '../core/want-core.ts';
import { projectEventBeatsForWitness } from '../core/scene-perception.ts';
import {
    coerceRewriteReply,
    type RegenerateWantInput,
    type RewriteSpawn,
    extractRewriteJson,
    type RewriteLedgerInput,
    type RewriteReply,
} from '../core/want-rewrite.ts';
import {
    FileCharacterSessionStore,
    PersistentCharacterSessions,
    type CharacterSessionIdentity,
} from '../session/character-session.ts';

const ACTION_KINDS: ActionKind[] = [
    'propose_play',
    'join_play',
    'compose',
    'rehearse',
    'seek_person',
    'perform',
    'personal',
];

export interface RunnerSceneAgentOptions {
    /** Durable directory. Omit to keep legacy stateless behaviour. */
    sessionDir?: string;
    /** 32-byte hex/base64 AES key for private session files. */
    sessionKey?: string;
}

/** 折子回話裡的起念（P2）—— 讀出來、截短，形狀不對就當沒說。真正的夾限（僅台柱、
 *  分鐘數 [15,1440]、每人一枚在途）在引擎的 `runInterludes` 裡，這裡只求不把垃圾
 *  遞進去：座席的職責是說話，不是守規矩。 */
function readFollowUp(raw: unknown): Pick<InterludeReply, 'followUp'> | null {
    if (!raw || typeof raw !== 'object') return null;
    const { inMinutes, note } = raw as { inMinutes?: unknown; note?: unknown };
    const text = typeof note === 'string' ? toTraditional(note.trim()).slice(0, 40) : '';
    const minutes = readNumber(inMinutes);
    if (!text || !Number.isFinite(minutes)) return null;
    return { followUp: { inMinutes: Math.round(minutes), note: text } };
}

/** 折子回話裡的自陳活動（P2）—— 同上：讀出來、截短，`forMinutes` 說不清就省略，
 *  讓引擎套它的預設（一個時辰）。 */
function readActivity(raw: unknown): Pick<InterludeReply, 'activity'> | null {
    if (!raw || typeof raw !== 'object') return null;
    const { what, forMinutes } = raw as { what?: unknown; forMinutes?: unknown };
    const text = typeof what === 'string' ? toTraditional(what.trim()).slice(0, 20) : '';
    if (!text) return null;
    const minutes = readNumber(forMinutes);
    return { activity: { what: text, ...(Number.isFinite(minutes) ? { forMinutes: Math.round(minutes) } : {}) } };
}

/** 數字或說得清的數字字串才算數——null/布林/物件一律 NaN（`Number(null)` 是 0，
 *  那個 0 會被引擎夾成十分鐘的活動，等於憑空替角色安排了一樁事）。 */
function readNumber(raw: unknown): number {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.trim()) return Number(raw);
    return Number.NaN;
}

export class RunnerSceneAgent implements SceneAgentPort {
    private readonly sessions?: PersistentCharacterSessions;
    private dossierClient?: ReturnType<typeof llmText.createTextClient>;

    constructor(options: RunnerSceneAgentOptions = {}) {
        if (options.sessionDir) {
            // Do not resolve a provider while Next.js imports /api/tick during
            // build/page-data collection. Configuration is required only when a
            // real character turn actually asks the model to complete text.
            let client: ReturnType<typeof llmText.createTextClient> | undefined;
            this.sessions = new PersistentCharacterSessions(
                new FileCharacterSessionStore(path.resolve(options.sessionDir), options.sessionKey),
                {
                    complete: async (input) => {
                        client ??= llmText.createTextClient({ kind: 'primary' });
                        const res = await client.chat({
                            model: client.defaultModel,
                            system: input.system,
                            messages: input.messages,
                            maxTokens: input.maxTokens,
                            temperature: input.temperature,
                        });
                        return res.text;
                    },
                },
            );
        }
    }

    private identity(input: {
        sagaId?: string;
        characterId?: string;
        name: string;
        persona: string;
        role?: string;
        bodyFact?: string;
    }): CharacterSessionIdentity | null {
        if (!this.sessions || !input.sagaId || !input.characterId) return null;
        return {
            sagaId: input.sagaId,
            characterId: input.characterId,
            characterName: input.name,
            // Keep this cross-surface stable: actBeat and povScene do not carry
            // identical metadata, but both always carry name + persona.
            canon: `你就是${input.name}。\n${input.persona}`,
        };
    }

    async actBeat(
        input: Parameters<typeof characterAgent.actBeat>[0],
    ): ReturnType<typeof characterAgent.actBeat> {
        const identity = this.identity(input);
        if (!identity || !this.sessions) return characterAgent.actBeat(input);
        const dynamic = characterAgent.buildBeatSystemPrompt(input);
        const percept = [
            '【世界在此刻投遞給你的知覺與行動邊界】',
            dynamic,
            `【這場戲剛剛的來回】\n${input.sceneLog || '（戲方起。）'}`,
            `輪到你（${input.name}）。`,
        ].join('\n\n');
        // A proposed action is not a lived memory. Read the durable session to
        // draft it, but do not append the proposal. Only observeScene records the
        // engine-accepted event after physical/canon validation succeeds.
        const raw = await this.sessions.project(identity, percept, {
            eventId: input.perceptId,
            instruction: '依照此刻知覺提出一拍待世界驗證的行動；這只是提案，尚未發生。只輸出指定 JSON。',
            maxTokens: input.consummate ? 1600 : 1100,
            temperature: 0.95,
        });
        return characterAgent.parseBeatResult(raw, input.name);
    }

    /** A rejected physical proposal never enters the durable character session.
     *  Replan statelessly from the refreshed affordances; the accepted event is
     *  delivered to the session later through observeScene. */
    async replanBeat(
        input: Parameters<typeof characterAgent.actBeat>[0],
    ): ReturnType<typeof characterAgent.actBeat> {
        return characterAgent.actBeat(input);
    }

    judgeWantResolved = characterAgent.judgeWantResolved;
    decideMove = characterAgent.decideMove;
    transitReact = characterAgent.transitReact;
    negotiateCounter = characterAgent.negotiateCounter;
    decideRehearsal = characterAgent.decideRehearsal;
    speakPrayer = characterAgent.speakPrayer;
    // 資助搭救 — delegate straight to the runner capability (real LLM judge by
    // default; finalizeAid enforces real-peer + no-overdraft inside it).
    decideAid = characterAgent.decideAidAction;
    // 叩門/放行 — the occupant answers the door (through it); consent lives with
    // the occupant, never the visitor's ardor. Fail-safe to null ⇒ the tick
    // refuses the door.
    decideAdmit = characterAgent.decideAdmit;
    decideInvite = characterAgent.decideInvite;
    // 告借/應借 — the asked lender answers a borrow face to face; 借錢是兩造的事，
    // 錢動之前出借的人先點頭。Fail-safe to null ⇒ the tick refuses the loan.
    decideLend = characterAgent.decideLend;
    // 復核座席 — the 班主 reviews a user-minted candidate (mint flow, not tick).
    // Fail-safe to null ⇒ the candidate is NOT admitted.
    decideRecruit = characterAgent.decideRecruit;

    async observeScene(input: ObserveSceneInput): Promise<void> {
        if (!this.sessions) return;
        const identity = this.identity({
            sagaId: input.event.sagaId,
            characterId: input.characterId,
            name: input.name,
            persona: input.persona,
        });
        if (!identity) return;
        const perceived = projectEventBeatsForWitness(input.event, input.characterId);
        const lines = input.event.beats.map((b, index) => {
            const own = b.characterId === input.characterId && b.inner ? `（我心裡：${b.inner}）` : '';
            return `${perceived[index].name}：${perceived[index].text}${own}`;
        });
        await this.sessions.observe(
            identity,
            [
                `【我親歷的客觀事件 ${input.event.id}】`,
                `${input.event.clock}｜${input.event.sceneName}｜${input.event.visibility === 'private' ? '私下' : '公開'}`,
                ...lines,
                '以上是我當時真正看見／聽見的逐拍；別人的心裡話不在其中。',
            ].join('\n'),
            input.event.id,
        );
    }

    async curateDossier(
        event: DossierCanonicalEvent,
        perspectives: DossierPerspectiveSource[],
    ): Promise<DossierPerspectiveSource[]> {
        this.dossierClient ??= llmText.createTextClient({ kind: 'primary' });
        const curateOne = async (source: DossierPerspectiveSource): Promise<DossierPerspectiveSource> => {
            // One editor writes one POV, but it still needs immutable identity
            // facts for everybody that POV may mention.
            const prompt = eventDossier.buildClaimAuditPrompt(event, [source], perspectives);
            // 同一個預算：prompt 要多少條、parser 收多少條、天花板夠寫幾條，都從
            // 段數推出來，不能各自寫死一個數字。
            const budget = eventDossier.subjectiveClaimBudget(source.body);
            let lastErrors: string[] = [];
            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await this.dossierClient!.chat({
                    model: this.dossierClient!.defaultModel,
                    system: `你是${source.characterName}這一份卷宗的專屬認識論編輯。只寫導語、比較既有說法與封存證據；不續寫故事，不創造證據。`,
                    messages: [{
                        role: 'user',
                        content: attempt === 0
                            ? prompt
                            : `${prompt}\n\n【上次輸出未通過】\n${lastErrors.join('\n')}\n請重新輸出完整 JSON，必須有以角色姓名開頭的專屬 lead、最多 ${budget} 條主觀 claim，並覆蓋每個 p:N。`,
                    }],
                    // 一份卷宗：24-52 字的專屬導語＋每條 claim 帶 20-70 字的
                    // editorialNote；四條就寫滿四五百個中文字，1500 常剪在最後一條，
                    // 而少一條就過不了 validateClaimAudit，白跑一次重試。長 POV 的
                    // claim 上限跟著段數長，天花板就得一起長，否則放寬的那幾條會改
                    // 由 maxTokens 剪掉，症狀一模一樣。夾住上界是怕段數異常的 POV
                    // 開出模型收不下的 max_tokens（reasoning 還會再吃一層）。
                    maxTokens: Math.min(6000, 900 + budget * 380),
                    temperature: attempt === 0 ? 0.32 : 0.15,
                });
                const [curated] = eventDossier.applyClaimAudit(event, [source], response.text);
                const validationErrors = eventDossier.validateClaimAudit([curated]);
                if (!validationErrors.length) return curated;
                lastErrors = [
                    ...validationErrors,
                    `輸出結構：${eventDossier.diagnoseClaimAudit(response.text)}`,
                ];
            }
            throw new Error(`incomplete dossier audit for ${source.characterName}: ${lastErrors.join('; ')}`);
        };

        // Each character gets a separate editorial pass. Besides producing more
        // specific copy, this prevents a long ensemble JSON response from
        // truncating later characters or collapsing each to one generic claim.
        const curated = await Promise.all(perspectives.map(curateOne));
        const errors = eventDossier.validateClaimAudit(curated);
        if (errors.length) throw new Error(`incomplete dossier audit: ${errors.join('; ')}`);
        return curated;
    }

    async reviewScene(
        input: Parameters<typeof characterAgent.reviewScene>[0],
    ): ReturnType<typeof characterAgent.reviewScene> {
        return characterAgent.reviewScene(input);
    }

    async povReflect(
        input: Parameters<typeof characterAgent.povReflect>[0],
    ): ReturnType<typeof characterAgent.povReflect> {
        const prose = await characterAgent.povReflect(input);
        return prose ? toTraditional(prose) : null;
    }

    async povScene(
        input: Parameters<typeof characterAgent.povScene>[0],
    ): ReturnType<typeof characterAgent.povScene> {
        const identity = this.identity(input);
        if (!identity || !this.sessions) return characterAgent.povScene(input);
        const objective = input.beats.map((b) => `${b.name}：${b.text}`).join('\n');
        const castCanon = (input.castBodies ?? [])
            .filter((member) => member.name)
            .map((member) => {
                const pronoun = !member.bodyFact || member.bodyFact.includes('女') ? '她' : '他';
                return `${member.name}＝${member.role ?? '行當不詳'}｜${pronoun}（${member.bodyFact ?? '身不詳'}）`;
            })
            .join('、');
        const projected = await this.sessions.project(
            identity,
            [
                `【事件】${input.eventId ?? '未編號事件'}｜${input.clock}｜${input.venue}`,
                castCanon ? `【在場人的身份（不可改）】${castCanon}。女子縱然在台上扮小生，敘事仍用「她」。` : '',
                '【不可更動的客觀逐拍】',
                objective,
                input.ties ? `【我向來怎麼看在場的人】\n${input.ties}` : '',
                '只用我在這個 session 裡真正知道的事，寫我如何經歷這一場。',
            ].filter(Boolean).join('\n\n'),
            {
                eventId: input.eventId,
                instruction:
                    '把同一客觀事件寫成第一人稱的敘事段落。注意、誤讀與情感可以偏；人物、順序、動作、對白不可改。' +
                    '不要替別人斷言內心；不知道的就留白。人物行當、身與第三人稱代詞嚴格按輸入 canon。' +
                    '只輸出敘事正文本身：不要標題行、不要「第X回」或任何回目／章節編號、不要 markdown 井號（#）' +
                    '（畫面自帶第X日·第Y拍·場景的眉題）。純正文，350至900字。',
                maxTokens: 1500,
                temperature: 0.82,
            },
        );
        return characterAgent.formatPovSceneParagraphs(characterAgent.stripPovTitle(toTraditional(projected))) || null;
    }

    async judgeEstablished(
        input: Parameters<typeof characterAgent.judgeEstablished>[0],
    ): ReturnType<typeof characterAgent.judgeEstablished> {
        return characterAgent.judgeEstablished(input);
    }

    // ── 宏觀節奏 seats (director · diary · poem) ─────────────────────────────

    /**
     * 導演選牌 — the ONLY seat where a model influences what the world DOES to the
     * cast, and its authority is three answers wide: which offered card, aimed at
     * which offered candidates, dressed in what words. The engine has already
     * computed the eligible set and will settle every consequence, so the prompt
     * carries no figure the director could optimise against — no balances, no
     * tension numbers, no box office. A reply naming a card that was not offered is
     * refused by the caller, so the worst a bad reply can do is waste a tick.
     */
    async pickEventCard(input: DirectorPickInput): Promise<DirectorPickReply | null> {
        if (!input.offered.length && !input.mayPropose) return null;
        const system = [
            '你是這齣戲的導演。你的職權只有三件事：**選哪張牌、何時打、對準誰**，外加把卡面文字',
            '穿上戲服（改寫成這個世界的話）。你不決定後果——後果由引擎按牌面確定性結算。',
            '',
            '鐵則：',
            '1. cardId 只能從【今日可打的牌】裡逐字挑一張。捏造的牌一律不採納。',
            '2. targetIds 只能從那張牌自己的【可對準】名單裡挑，最多挑該牌指定的人數。',
            '3. costume 是把卡面改寫成世界語言的一兩句話（30–80字），只寫**已經發生的客觀事**，',
            '   不預告後果、不替角色決定反應、不出現數字。不改寫就省略。',
            '4. 你可以按牌不打（decline:true）——外力是推手，不是主角。已標【到日必打】的牌沒有',
            '   這個選項，你只能替它穿戲服。',
            '5. rationale 一句話說明為什麼是這張、為什麼是這個人（只進 log，不入世界）。',
            '',
            '選牌的判準：哪一張最能把**已經存在的張力**推向一個必須有人回答的處境。不要為了熱鬧',
            '而打牌；一天到晚都在下雨的世界，跟從不下雨的一樣悶。',
            '',
            // 自撰一張 — advertised only when the quota is open, and advertised with
            // its own fence. The caps are quoted verbatim from PROPOSAL_LIMITS so
            // the prompt and the validator can never drift: a director told 「至多
            // 四條」 while the engine enforces three would be refused for reasons it
            // was never given.
            ...(input.mayPropose
                ? [
                      '',
                      `【自撰一張】牌面上沒有合適的，你可以自己寫一張——但只能用引擎認得的積木，`,
                      `一卷至多 ${PROPOSAL_LIMITS.seasonCap} 張、一日至多 ${PROPOSAL_LIMITS.perDay} 張，越界一律駁回並記錄。`,
                      `可用的後果只有這幾種（其餘一律駁回）：`,
                      '  percept  —— 世上發生了一件事，全班次拍知曉。{"kind":"percept","text":"一兩句客觀事實","sceneName":"場景名或省略"}',
                      `  want     —— 在對象心上種一樁事。{"kind":"want","layer":"事務","desc":"至多40字","weight":≤${PROPOSAL_LIMITS.wantWeight},"dueInDays":≤${PROPOSAL_LIMITS.wantDueDays}}`,
                      `  bill     —— 對象頭上多一筆按期債。{"kind":"bill","id":"唯一id","label":"名目","amountYuan":≤${PROPOSAL_LIMITS.billYuan},"dueInDays":≤${PROPOSAL_LIMITS.billDueDays},"fromAccountId":"@target"}`,
                      `  renown / self-regard —— 名頭或自視微調。{"kind":"renown","delta":±${PROPOSAL_LIMITS.renownDelta}以內}`,
                      `  weather  —— 天時。{"kind":"weather","label":"名目","housePct":${PROPOSAL_LIMITS.weatherHousePct.min}~${PROPOSAL_LIMITS.weatherHousePct.max}}`,
                      '  object-state —— 已登記物件換個狀態。{"kind":"object-state","objectId":"登記id","state":"新狀態"}',
                      '  leak-secret  —— 已在帳上的秘密走漏。{"kind":"leak-secret","secretId":"帳上的id"}',
                      `一張至多 ${PROPOSAL_LIMITS.maxEffects} 條後果。發錢、分紅、注資、結帳、進班、離班、見報都不在其中——`,
                      '那些不是導演的權柄：錢的來去有它自己的鐘，人的進出是全季最大的一張牌。',
                      '自撰的牌是給「牌組想不到、但此刻非有不可」的那一件事用的；牌面上有合用的就別自撰。',
                      '',
                      '自撰時把 cardId 留空、decline 省略，改給 propose：',
                      '{"cardId":"","propose":{"label":"卡面（40字內）","note":"一句說明","targetIds":["角色id"],"effects":[...]},"rationale":"..."}',
                  ]
                : []),
            '',
            '只輸出 JSON，不要 markdown：',
            '{"cardId":"...","targetIds":["..."],"costume":"可省略","rationale":"...","decline":false}',
        ].join('\n');
        const offered = input.offered
            .map((card) => {
                const who = card.candidates.length
                    ? card.candidates.map((candidate) => `${candidate.id}=${candidate.name}`).join('、')
                    : '（此牌無對象）';
                return [
                    `- cardId：${card.cardId}${card.forced ? '【到日必打，只能穿戲服】' : ''}`,
                    `  卡面：${card.label}`,
                    card.note ? `  說明：${card.note}` : '',
                    `  可對準（挑 ${card.pickCount} 人）：${who}`,
                ].filter(Boolean).join('\n');
            })
            .join('\n');
        const user = [
            `【此刻】第 ${input.day} 日，${input.clock}`,
            '',
            '【世情】',
            ...input.worldBrief,
            '',
            input.offered.length ? '【今日可打的牌】' : '【今日可打的牌】（無——牌組今日給不出東西）',
            offered,
            input.forcedCardIds.length ? `\n【今日已經注定要落的牌】${input.forcedCardIds.join('、')}` : '',
        ].filter(Boolean).join('\n');
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 400,
            temperature: 0.6,
        });
        const block = res.text.match(/\{[\s\S]*\}/)?.[0];
        if (!block) return null;
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(block) as Record<string, unknown>;
        } catch {
            return null;
        }
        const rationale = typeof parsed.rationale === 'string' && parsed.rationale.trim()
            ? toTraditional(parsed.rationale.trim())
            : undefined;
        const card = typeof parsed.cardId === 'string'
            ? input.offered.find((row) => row.cardId === parsed.cardId)
            : undefined;
        // 自撰一張 — passed through verbatim, NOT sanitised here. The engine's
        // `validateProposal` is the single authority on what a proposal may do,
        // and a second, looser copy of those rules in the adapter would be exactly
        // the drift the deck exists to prevent. An overreach comes back as logged
        // reasons instead of being quietly trimmed into something the director
        // never actually proposed.
        if (!card && input.mayPropose && parsed.propose && typeof parsed.propose === 'object') {
            const draft = parsed.propose as Record<string, unknown>;
            const label = typeof draft.label === 'string' ? toTraditional(draft.label.trim()) : '';
            const note = typeof draft.note === 'string' && draft.note.trim() ? toTraditional(draft.note.trim()) : undefined;
            return {
                cardId: '',
                propose: {
                    label,
                    ...(note ? { note } : {}),
                    ...(Array.isArray(draft.targetIds)
                        ? { targetIds: draft.targetIds.filter((raw): raw is string => typeof raw === 'string') }
                        : {}),
                    effects: (Array.isArray(draft.effects) ? draft.effects : []) as CardProposal['effects'],
                },
                ...(rationale ? { rationale } : {}),
            };
        }
        if (!card) return null; // a card the engine never offered is not a card
        const allowed = new Set(card.candidates.map((candidate) => candidate.id));
        const byName = new Map(card.candidates.map((candidate) => [candidate.name, candidate.id]));
        const targetIds = Array.isArray(parsed.targetIds)
            ? parsed.targetIds
                  .map((raw) => (typeof raw === 'string' ? (allowed.has(raw) ? raw : byName.get(raw)) : undefined))
                  .filter((id): id is string => !!id)
                  .slice(0, Math.max(1, card.pickCount))
            : [];
        return {
            cardId: card.cardId,
            ...(targetIds.length ? { targetIds } : {}),
            ...(typeof parsed.costume === 'string' && parsed.costume.trim() ? { costume: toTraditional(parsed.costume.trim()) } : {}),
            ...(rationale ? { rationale } : {}),
            ...(parsed.decline === true && !card.forced ? { decline: true } : {}),
        };
    }

    /**
     * 債主的態度 — how hard THIS creditor calls THIS unpaid debt.
     *
     * The seat exists because the engine refuses to debit anybody: 「打死不還」 has
     * to be a position a character can actually hold, so the consequence of not
     * paying is social, and how loud that consequence gets is the CREDITOR'S
     * judgment, not the clock's. A creditor who genuinely does not mind is
     * allowed not to mind.
     *
     * The prompt carries no figure the seat could do arithmetic on, and the seat
     * cannot move money — it returns one of three stances and the engine settles
     * the social consequence of it.
     */
    async decideDebtStance(input: DebtStanceInput): Promise<DebtStanceReply | null> {
        const system = [
            `你是${input.creditorName}。有人欠你的帳到了日子，還沒還。`,
            '',
            '**你拿不走他的錢**——這條街上沒有人能從別人手裡搶錢。你能決定的只有一件事：',
            '這筆帳，你要怎麼說。三選一：',
            '',
            '- `forgive`（免了）：把那頁紅字撕了。帳沒了，情記下了——他往後欠你的是人情。',
            '  你若真的不在意，或者覺得逼他不值當，就選這個。',
            '- `press`（當面催）：把他叫到一邊，數目日子問到底。帳還在，話沒往外傳；',
            '  丟的是他當著你的臉，不是當著整條街的臉。',
            '- `broadcast`（傳出去）：當眾把名字和數目報出來。帳還在，而且往後你這裡',
            '  不再賒給他，整條街都會知道他是什麼樣的人。這是最重的一手，收不回。',
            '',
            '判準是你自己的：你的營生撐不撐得住、這個人值不值得留、他是**還不出**還是',
            '**不肯還**（這兩件事差得遠）、以及你已經給過他幾次機會。',
            '沒有標準答案；你就是你，按你的性子答。',
            '',
            '只輸出 JSON，不要 markdown：{"stance":"forgive|press|broadcast","note":"一句你自己的理由"}',
        ].join('\n');
        const user = [
            input.stance ? `【你的立場】${input.stance}` : '',
            `【欠你的人】${input.debtorName}`,
            `【什麼帳】${input.label}，還差${input.owedText}`,
            `【過期】${input.daysOverdue <= 0 ? '今日正是日子' : `已經過了 ${input.daysOverdue} 日`}`,
            `【你已經叫過幾回】${input.priorCalls === 0 ? '這是頭一回' : `${input.priorCalls} 回了`}`,
            `【他還得出嗎】${input.debtorCouldPay ? '手裡不是沒有——他是不肯還，不是還不出' : '看樣子確實拿不出來'}`,
            `【你自己的光景】${input.creditorFooting}`,
        ].filter(Boolean).join('\n');
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 200,
            temperature: 0.7,
        });
        const block = res.text.match(/\{[\s\S]*\}/)?.[0];
        if (!block) return null;
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(block) as Record<string, unknown>;
        } catch {
            return null;
        }
        if (parsed.stance !== 'forgive' && parsed.stance !== 'press' && parsed.stance !== 'broadcast') return null;
        return {
            stance: parsed.stance,
            ...(typeof parsed.note === 'string' && parsed.note.trim() ? { note: toTraditional(parsed.note.trim()) } : {}),
        };
    }

    /**
     * 日記 — one tracked character's day, recombined from that day's own beats and
     * 心下 in a single call. The seat writes prose AND extracts its own claims with
     * `beat:N` citations; the engine then audits those citations (and any money
     * figure) before anything is stored. The claim structure is not decoration: a
     * diary reads as canon, so it is exactly the wrong place to let invention in.
     */
    async composeDiary(input: ComposeDiaryInput): Promise<ComposeDiaryReply | null> {
        if (!input.evidence.length) return null;
        const system = [
            `你是${input.name}，在一天結束時寫下自己的日記。`,
            '',
            '鐵則：',
            '1. **只能寫今日素材裡真的發生過的事**。素材是你自己這一天的每一拍：客觀做了什麼、',
            '   心下想了什麼。不發明新事件、新人物、新對白。',
            '2. **你可以主觀、偏心、自我辯護、看錯別人的用意**——那正是日記的價值。但你**不可以**',
            '   寫錯帳目：錢的數目只能寫素材裡出現過的，或你此刻真正的現銀。',
            '3. 文體是私密的、口語的、有情緒的；不是報告。250–600字。',
            '4. 另外抽出 1–5 條 claim：這篇日記到底主張了什麼。每條都要標出它靠哪幾拍',
            '   （evidenceRefs 只能填素材裡的 beat:N）。沒有憑據就不要寫成 claim。',
            '',
            '只輸出 JSON，不要 markdown：',
            '{"body":"日記正文","claims":[{"text":"這篇主張了什麼","evidenceRefs":["beat:0"]}]}',
        ].join('\n');
        const material = input.evidence
            .map((beat) => `${beat.ref}｜${beat.clock}·${beat.sceneName}：${beat.text}${beat.inner ? `（心下：${beat.inner}）` : ''}`)
            .join('\n');
        const user = [
            `【我是誰】${input.persona}`,
            input.secret ? `【只有我知道的事】${input.secret}` : '',
            `【第 ${input.day} 日，我這一天的每一拍】`,
            material,
            input.wantLines.length ? `\n【擱在我心上的】\n${input.wantLines.map((line) => `- ${line}`).join('\n')}` : '',
            input.purseLine ? `\n【我此刻真正的家當（寫到錢時只能照這個）】${input.purseLine}` : '',
        ].filter(Boolean).join('\n');
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 1600,
            temperature: 0.85,
        });
        const block = res.text.match(/\{[\s\S]*\}/)?.[0];
        if (!block) return null;
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(block) as Record<string, unknown>;
        } catch {
            return null;
        }
        if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
        const claims = Array.isArray(parsed.claims)
            ? parsed.claims
                  .map((raw) => raw as Record<string, unknown>)
                  .filter((raw) => typeof raw?.text === 'string' && (raw.text as string).trim())
                  .map((raw) => ({
                      text: toTraditional((raw.text as string).trim()),
                      evidenceRefs: Array.isArray(raw.evidenceRefs)
                          ? raw.evidenceRefs.filter((ref): ref is string => typeof ref === 'string')
                          : [],
                  }))
                  .slice(0, 5)
            : [];
        return { body: toTraditional(parsed.body.trim()), claims };
    }

    /**
     * 詩詞 — occasion-triggered, never a daily quota. The engine decided THAT there
     * is an occasion and hands over the reason; this seat only writes the words.
     * Deliberately short: a discarded draft that becomes a prop somebody else finds
     * has to be readable at a glance.
     */
    async composePoem(input: ComposePoemInput): Promise<ComposePoemReply | null> {
        const system = [
            `你是${input.name}。此刻有一樁事壓在心口，你提筆寫了幾行——不是為了給誰看。`,
            '',
            '鐵則：',
            '1. 民國初年、識字戲曲人寫得出來的舊體或半舊體，四到八行，每行不過十四字。',
            '2. **不敘事、不解釋、不點題**。只留意象與情緒；讀的人看得懂多少是他的事。',
            '3. 不寫人名全稱（可用稱謂或代稱），不出現數字、契約、帳目這類字眼。',
            '4. title 可省略；若寫，四字以內。',
            '',
            '只輸出 JSON，不要 markdown：{"title":"可省略","body":"第一行\\n第二行"}',
        ].join('\n');
        const user = [
            `【我是誰】${input.persona}`,
            `【為什麼是今夜】${input.occasionLine}`,
            input.wantDesc ? `【壓著我的那一樁】${input.wantDesc}` : '',
            input.otherName ? `【心裡繞不開的那個人】${input.otherName}` : '',
            input.sceneName ? `【我此刻在哪】${input.sceneName}，${input.clock}` : '',
        ].filter(Boolean).join('\n');
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 400,
            temperature: 0.95,
        });
        const block = res.text.match(/\{[\s\S]*\}/)?.[0];
        if (!block) return null;
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(block) as Record<string, unknown>;
        } catch {
            return null;
        }
        if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
        return {
            ...(typeof parsed.title === 'string' && parsed.title.trim() ? { title: toTraditional(parsed.title.trim()) } : {}),
            body: toTraditional(parsed.body.trim()),
        };
    }

    async declareWantSemantics(
        input: DeclareWantSemanticsInput,
    ): Promise<DeclareWantSemanticsReply | null> {
        const system = [
            '你是 Endless Story 的結構化心願語意宣告座席。',
            '這不是改寫心願，也不是替角色決定行動；你只為機制宣告有限 metadata。',
            'semanticTags 只能取 affection、reckoning、jealousy、hostility；沒有就空陣列。',
            'target 只能逐字回傳候選人物的 id 或 name；不是明確指向人物就省略。',
            'subjectRef 只能逐字回傳候選主體的 kind 與 id；不是明確指向就省略。',
            'affection=親密/愛慕；reckoning=虧欠/清算/討回；jealousy=妒意；hostility=敵意或傷害傾向。',
            '只輸出 JSON：{"semanticTags":[],"target":"可省略","subjectRef":{"kind":"contract","id":"可省略"}}。不要 markdown。',
        ].join('\n');
        const cast = input.cast.map((member) => `${member.id}=${member.name}`).join('、');
        const subjects = input.subjects.map((subject) => `${subject.kind}:${subject.id}=${subject.label}`).join('、');
        const user = [
            `來源：${input.source}`,
            `角色：${input.characterId}=${input.characterName}`,
            `自由文字層：${input.layer ?? '（無）'}`,
            `心願原句：${input.desc}`,
            `原始 target：${input.target ?? '（無）'}`,
            `target 候選：${cast || '（無）'}`,
            `subjectRef 候選：${subjects || '（無）'}`,
        ].join('\n');
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 180,
            temperature: 0,
        });
        const block = res.text.match(/\{[\s\S]*\}/)?.[0];
        if (!block) return null;
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(block) as Record<string, unknown>;
        } catch {
            return null;
        }
        const semanticTags = Array.isArray(parsed.semanticTags)
            ? parsed.semanticTags.filter(
                  (tag): tag is WantSemanticTag =>
                      typeof tag === 'string' &&
                      (WANT_SEMANTIC_TAGS as readonly string[]).includes(tag),
              )
            : [];
        const target =
            typeof parsed.target === 'string' &&
            input.cast.some(
                (member) => member.id === parsed.target || member.name === parsed.target,
            )
                ? parsed.target
                : undefined;
        const rawSubject = parsed.subjectRef as Record<string, unknown> | undefined;
        const subjectRef =
            rawSubject?.kind === 'contract' &&
            typeof rawSubject.id === 'string' &&
            input.subjects.some(
                (subject) => subject.kind === 'contract' && subject.id === rawSubject.id,
            )
                ? { kind: 'contract' as const, id: rawSubject.id }
                : undefined;
        return {
            semanticTags: [...new Set(semanticTags)],
            ...(target ? { target } : {}),
            ...(subjectRef ? { subjectRef } : {}),
        };
    }

    async deriveGenesisWants(
        input: Parameters<typeof characterAgent.deriveGenesisWants>[0],
    ): Promise<GenesisWant[]> {
        return characterAgent.deriveGenesisWants(input);
    }

    async deriveAftermathWant(
        input: Parameters<typeof characterAgent.deriveAftermathWant>[0],
    ): Promise<GenesisWant | null> {
        return characterAgent.deriveAftermathWant(input);
    }

    async judgeRipples(
        input: Parameters<typeof characterAgent.judgeRipples>[0],
    ): Promise<RippleJudgeDelta[]> {
        return characterAgent.judgeRipples(input);
    }

    async weaveTickChapter(
        input: Parameters<typeof sceneRecord.weaveTickChapter>[0],
    ): Promise<string | null> {
        const prose = await sceneRecord.weaveTickChapter(input);
        return prose ? toTraditional(prose) : null;
    }

    async reviewChapter(
        input: Parameters<typeof sceneRecord.reviewChapter>[0],
    ): ReturnType<typeof sceneRecord.reviewChapter> {
        const reviewed = await sceneRecord.reviewChapter(input);
        return reviewed ? { ...reviewed, chapter: toTraditional(reviewed.chapter) } : null;
    }

    async composeEpisode(
        input: Parameters<typeof eventChapter.composeEpisode>[0],
    ): Promise<string | null> {
        const prose = await eventChapter.composeEpisode(input);
        return prose ? toTraditional(prose) : null;
    }

    /**
     * Structured open-action (fix #1). Free-text FIRST person + a self-tagged
     * `action_kind` — the character tags its OWN action; the engine routes off
     * the tag, never a regex on prose. Prompt states season FACTS only; it never
     * tells the character to make a play (§2.42 discipline preserved). Adapted
     * from experiments/play-emergence-selfdrive.ts (the action prompt) + the
     * structured-tag fix the decoupled test demanded.
     */
    async chooseAction(input: ChooseActionInput): Promise<ChooseActionResult> {
        const system = [
            '你在扮演一個戲園裡的人。給你這個人是誰、心底藏著什麼、心裡此刻掛著的幾件事、',
            '眼下這世道的光景,以及近來班裡發生的事。',
            '',
            '用**第一人稱**寫下 TA 這一刻決定做什麼、為什麼(一個具體的動作,不是空泛心情),',
            '然後**替自己這個動作貼一個標籤**(action_kind),讓班子知道你這一刻在做哪類事。',
            '',
            '標籤只能從這幾個裡挑一個,照你真正在做的事誠實貼(不是我要你做什麼):',
            '- propose_play:起頭張羅一齣新戲(還沒有人在排時)。',
            '- join_play:別人已在張羅的新戲,你也算一個、要個角。',
            '- compose:寫詞/編腔/寫本子/添唱段——動筆攢出戲的文本。',
            '- rehearse:排練/走位/對戲/走一遍現有的戲。',
            '- seek_person:專程去找某個人(把對方名字填進 target)。',
            '- perform:上台演出。',
            '- personal:以上都不是的私事(練功/了結舊事/放電/處理生活)。',
            '',
            '**鐵則**:只寫 TA 自己這一刻的行動,順著性子與心事走,做什麼由 TA 自己定。',
            '',
            '**輸出**:嚴格只輸出 JSON:',
            '{"prose":"第一人稱這一段(50-120字)","action_kind":"…","target":"只有 seek_person 才填,對方名字"}',
            '不要 markdown、不要多餘文字。',
        ].join('\n');

        const wantLines = input.wants.length
            ? input.wants.map((w) => `- [${w.layer}] ${w.desc}${w.target ? `（心裡掛著${w.target}）` : ''}`).join('\n')
            : '（暫時沒有特別掛心的事）';
        const memLines = input.memories?.length ? `\n# 你還記著的幾件舊事\n${input.memories.map((m) => `- ${m}`).join('\n')}` : '';
        const logBlock = input.sharedLog.length ? input.sharedLog.join('\n') : '（還沒什麼動靜。）';
        const user = [
            `# 你是誰`,
            `${input.name}（${input.role ?? ''}）:${input.persona}`,
            input.secret ? `\n# 你心底的事（只有你自己知道）\n${input.secret}` : '',
            input.selfModel ? `\n${input.selfModel}` : '',
            memLines,
            `\n# 你此刻心裡掛著的事\n${wantLines}`,
            `\n# 眼下這世道（這些都是已經發生、擺在眼前的事實）\n${input.worldFact}`,
            `\n# 近來班裡發生的事\n${logBlock}`,
            input.playSummary ? `\n# 眼下班裡手邊這樁\n${input.playSummary}` : '',
            `\n此刻,你（${input.name}）決定做什麼?`,
        ]
            .filter(Boolean)
            .join('\n');

        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 400,
            temperature: 0.85,
        });
        const obj = extractRewriteJson(res.text) ?? {};
        const rawKind = String((obj as any).action_kind ?? (obj as any).kind ?? 'personal').trim();
        const kind: ActionKind = (ACTION_KINDS as string[]).includes(rawKind) ? (rawKind as ActionKind) : 'personal';
        const prose = String((obj as any).prose ?? res.text ?? '').trim().replace(/\s+/g, '');
        const target = typeof (obj as any).target === 'string' ? (obj as any).target.trim() || undefined : undefined;
        return { prose: prose || '（無語）', kind, target: kind === 'seek_person' ? target : undefined };
    }

    /**
     * Living-want self-rewrite (fix #2). Scene-scoped: only this character's own
     * wants + the one scene/action it just did. Prompt adapted verbatim in spirit
     * from experiments/rewrite-ab.ts (the VALIDATED mechanism); parsing reuses the
     * core coercer so the shape is identical to the fake path.
     */
    async rewriteWantLedger(input: RewriteLedgerInput): Promise<RewriteReply> {
        const system = [
            '你替一個戲園角色照看TA心裡掛著的事。給你這個人剛剛做過的一件事(逐字),',
            '和 TA 此刻心裡掛著的幾件事(wants)。替 TA 判斷:**這件事之後,每一件事在 TA',
            '心裡變成了什麼樣子**。',
            '',
            '**鐵則**:',
            '1. 只描述「這件事此刻在心裡是什麼樣」,不寫計畫、不寫下一步。',
            '2. 每件事給一個 action:keep(沒變)/mutate(變了,用 newDesc 寫新樣子,≤30字,',
            '   第一人稱,必須引用這場實際發生的事)/close(只有心裡那個結真放下了才用)。',
            '3. 你可以 spawn **至多一條**這場新勾起的心事(≤30字、第一人稱、引用這場)。',
            '4. 額度:同時至多 4 件;已滿還要 spawn 必須先 close 一件。',
            '5. 不要替 TA 安排劇情,不要暗示告白攤牌。只誠實記錄心裡的變化。',
            '6. 比喻的本性不許漂移:心裡的比方指什麼就仍是什麼——情分不可坐實成銀錢文書;反之亦然。',
            '7. 比方要長自這個人的行當與性子:武行想的是筋骨招式、歌女想的是曲與嗓、旦角想的是水袖身段、',
            '   班主想的是台面戲碼——**不是人人都拿帳房話說心事**,同一套「帳/債/欠/抵/押」翻來覆去就是懶筆。',
            '8. 肉身重話（連骨帶肉/押/填/骨血/絞）留給真到了那一步的時刻——尋常心事用尋常話,不然貞潔的日子讀起來也像床笫。',
            '7. 用 TA 的性子說話,不是 TA 的行當:急性子的心事短而衝,藏心事的婉轉留白,',
            '   傲的人不肯把渴望說滿,怯的人連對自己都說得含糊。這是 TA 對自己說的話,',
            '   像 TA 的心跳,不像任何一種腔。',
            '',
            '**輸出**:嚴格只輸出 JSON:',
            '{"decisions":[{"id":"…","action":"keep|mutate|close","newDesc":"…","note":"一句"}],',
            ' "spawn":{"desc":"…","layer":"…"}}',
            '沒有要 spawn 就省略 spawn 欄。newDesc 只在 mutate 時給。不要 markdown。',
        ].join('\n');
        const wantList = input.wants.map((w) => `- id=${w.id}｜[${w.layer}]｜${w.desc}`).join('\n');
        const user = [
            `# 你是誰\n${input.name}:${input.persona}`,
            input.secret ? `\n# 你心底的事（只有你自己知道）\n${input.secret}` : '',
            `\n# 你此刻心裡掛著的事\n${wantList || '（暫時沒有）'}`,
            `\n# 剛剛你做的這件事（逐字,只此一件）\n${input.sceneText || '（這一刻你沒做出什麼。）'}`,
            `\n這之後,上面每一件事在你（${input.name}）心裡變成了什麼樣?`,
        ].join('\n');

        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 600,
            temperature: 0.7,
        });
        return coerceRewriteReply(extractRewriteJson(res.text));
    }

    /**
     * Nightly want REGENERATION (the antidote to a resolved arc going dormant). Unlike
     * rewriteWantLedger — which reflects on a scene the character was IN — this runs for
     * EVERY character, even one who did nothing, and asks whether a NEW want stirs from:
     * a want just settled (its next phase), or the world pressing (the finale deadline,
     * being broke/hungry, the collective task), or the year closing on a finite life.
     * It is deliberately reluctant when the character STILL has live wants (returns null
     * unless something genuinely stirs) — no artificial floor forced on a busy character.
     * But when the character has NOTHING left (zero live wants), it MUST yield one: a
     * living person is never truly wantless, and the year closing on an aging performer
     * is exactly the pressure that surfaces a fresh drive. That is not a floor — it is the
     * world doing its job on the most exposed case.
     */
    async regenerateWant(input: RegenerateWantInput): Promise<RewriteSpawn | null> {
        const empty = input.liveWants.length === 0;
        const system = [
            '入夜了。你替一個戲園角色照看 TA「心裡還想要什麼」。給你 TA 是誰、此刻心裡還掛著的事,',
            '剛剛了結的事,以及此刻壓在 TA 身上的世道與光陰。替 TA 誠實地想:**這時候,有沒有一件',
            '新的心事,正從這些裡頭生出來?**',
            '',
            '**三個真正的來源(只從這裡長,不要無中生有)**:',
            '1. 承接——剛了結一樁,人到了新的地步:守住了的怕失去、得不到的想放下、事了了的問往後怎麼過。',
            '2. 世道——年關、大會串的死線、兜裡沒錢、餓著、班子的存亡,這些外頭的壓力逼出來的。',
            '3. 光陰——又過了一季,人不會一直年輕,機會不多了,有些事再不做就來不及。',
            '4. 線頭——你記憶裡一直擱著、與眼下這樁無關的事:沒學會的、沒攢夠的、沒說出口的、欠著誰的。',
            '   人不是只有一件事;有時新的想要,是從另一條線裡冒出來的。',
            '',
            '**鐵則**:',
            empty
                ? '- TA 此刻心裡一件掛記也沒有了。**一個大活人不會真的什麼都不想**——年關在逼、身子在老、這行當要吃飯,總有一件從世道或光陰裡冒出來。**這種時候必須給一件,不許回空**,哪怕只是「我如今到底還想要什麼」。'
                : '- TA 手上還有掛著的事、又沒什麼要緊的壓力,就別硬生——回 null。這不是配額,是真有才給。',
            '- 至多一條。≤30字,第一人稱,像 TA 會對自己說的話,別像旁白替 TA 安排劇情、別暗示告白攤牌。',
            '- 只誠實記一句「我如今想要什麼」,不寫計畫、不寫下一步怎麼做。',
            '- 若新心事只是剛了結那樁換句話再要一遍,先想想線頭裡有沒有更真的——同一樁事不必翻來覆去地要。',
            '- 比喻的本性不許漂移:心裡的比方指什麼就仍是什麼,情分別坐實成銀錢文書。',
            '- 比方要長自TA的行當與性子(武行=筋骨、歌女=曲嗓、旦角=身段、班主=台面),別人人一套帳房話。',
            '- 肉身重話（連骨帶肉/押/填/骨血）留給真到了那一步的時刻,尋常心事用尋常話。',
            '- 用 TA 的性子說話,不是行當腔:急性子短而衝、藏心事的留白、傲的不說滿。',
            '',
            '**輸出**:嚴格只輸出 JSON。有新心事:{"desc":"…","layer":"…"};' + (empty ? '' : '沒有就:{"desc":""};') + '不要 markdown。',
        ].join('\n');
        const user = [
            `# 你是誰\n${input.name}:${input.persona}`,
            input.secret ? `\n# 你心底的事（只有你自己知道）\n${input.secret}` : '',
            input.coreIdentity.length ? `\n# 你此刻怎麼看自己\n${input.coreIdentity.join('\n')}` : '',
            `\n# 你此刻心裡還掛著的事\n${input.liveWants.map((w) => `- [${w.layer}] ${w.desc}`).join('\n') || '（一件也沒有了）'}`,
            input.justResolved.length ? `\n# 你剛剛了結的事\n${input.justResolved.map((d) => `- ${d}`).join('\n')}` : '',
            `\n# 此刻壓在你身上的世道\n${input.worldPressure}`,
            `\n# 光陰\n${input.lifecycle}`,
            input.otherThreads?.length
                ? `\n# 你記憶裡擱著的別的線頭\n${input.otherThreads.map((t) => `- ${t}`).join('\n')}`
                : '',
            `\n這時候,你（${input.name}）心裡有沒有一件新的想要,正從上面這些裡頭生出來?`,
        ].join('\n');

        try {
            const client = llmText.createTextClient({ kind: 'primary' });
            const res = await client.chat({
                model: client.defaultModel,
                system,
                messages: [{ role: 'user', content: user }],
                maxTokens: 220,
                temperature: 0.8,
            });
            const obj = extractRewriteJson(res.text);
            const desc = typeof obj?.desc === 'string' ? obj.desc.trim() : '';
            if (!desc) return null;
            const layer = typeof obj?.layer === 'string' ? obj.layer.trim() : undefined;
            return { desc, layer };
        } catch {
            return null; // non-fatal: no want this night
        }
    }

    /** NIGHTLY 心事自改 — the secret moves to its own next step when today truly
     *  landed on it. Same-heart rule: the new matter must grow from the OLD one's
     *  own grain (a demanded 認 in hand → 留不留/還來不來), never invented plot. */
    async evolveSecret(input: EvolveSecretInput): Promise<string | null> {
        const system = [
            '深宵。你替一個人照看TA埋在心底、沒對人說過的那樁心事。今天有些事真的落了地。',
            '先判斷:落地之事是否真的「兌了/推翻/往前推了」這樁心事?若沒有真碰到它——回 {"secret":""}(保持不變)。',
            '若真碰到了,替TA把心事改寫成它自己的下一步。',
            '',
            '**鐵則**:',
            '- 新心事必須從舊心事自己的紋理長出來,是同一顆心的下一步(例:苦等的一句「認」真拿到了手,懸著的自然變成「往後TA留不留/還來不來」)。不許新編劇情、不許引入沒發生的事。',
            '- 仍是「沒說出口的心事」——不是決定,不是計畫,不寫TA打算怎麼做。',
            '- 2-3句,寫法同原心事的口吻(第三人稱的內心白描);提到旁人用名字。',
            '- 比喻的本性不許漂移:情分仍是情分,不變銀錢文書。比方要長自TA的行當與性子,帳房話別當萬用比喻。',
            '- 用TA的性子:爽利的不繞彎、藏心事的留白、傲的不說滿。',
            '- **主根不許丟**:這個人心底最深的那根刺可以變形、可以結痂,不許憑空消失——若今日之事真拔了它,新心事要寫「拔掉之後」的樣子,不是當它從未存在。',
            '- **換句重說=不動**:若新寫出來的只是舊心事換個說法,回 {"secret":""}。心事不必每夜都動,多數的夜它只是躺著。',
            '- 肉身重話留給真到了那一步的時刻,尋常心事用尋常話。',
            '- **過往的硬事實不許漂**:年數、身世、誰做過什麼,一律照最初底稿——心境會變,歷史不會(糾纏六七年就是六七年,不因寫順口變成十年)。',
            ...(input.castBodies?.length
                ? [
                      `- 代詞鐵則:${input.castBodies.map((c) => `${c.name}（${c.bodyFact ?? '身不詳'}）`).join('、')}——心事裡提到誰,代詞按其身寫;坤生/女子縱台上扮男仍是「她」。`,
                  ]
                : []),
            '',
            '嚴格只輸出 JSON:{"secret":"…"} 或 {"secret":""}。不要 markdown。',
        ].join('\n');
        const user = [
            `# TA是誰\n${input.name}:${input.persona}`,
            input.selfModel?.length ? `\n# TA此刻怎麼看自己\n${input.selfModel.join('\n')}` : '',
            input.canonSeed && input.canonSeed !== input.secret
                ? `\n# 這樁心事最初的底稿(過往的硬事實以此為準)\n${input.canonSeed}`
                : '',
            `\n# 那樁心事(此刻的樣子)\n${input.secret}`,
            `\n# 今天真落了地的事\n${input.landed.map((d) => `- ${d}`).join('\n')}`,
            `\n第${input.day}日夜。這樁心事,如今變成什麼樣子了?`,
        ].join('\n');
        try {
            const client = llmText.createTextClient({ kind: 'primary' });
            const res = await client.chat({
                model: client.defaultModel,
                system,
                messages: [{ role: 'user', content: user }],
                maxTokens: 320,
                temperature: 0.75,
            });
            const obj = extractRewriteJson(res.text) as { secret?: unknown } | null;
            const next = typeof obj?.secret === 'string' ? obj.secret.trim() : '';
            return next || null;
        } catch {
            return null; // non-fatal: the matter keeps its shape tonight
        }
    }

    /** Audience reaction PROSE only (never the box-office number). */
    async audienceReaction(input: AudienceReactionInput): Promise<string | null> {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system: '你替一位看戲的觀眾寫下 TA 看完這場戲當下的體驗與滋味,第一人稱,60-120字,只此一段,不評分不談票房。',
            messages: [
                {
                    role: 'user',
                    content: `# 觀眾\n${input.audienceName}（對這班子的暖度約 ${input.warmth.toFixed(2)}）\n\n# 台上這場戲\n${input.performanceLines.join('\n')}\n\n此刻 TA 心裡是什麼滋味?`,
                },
            ],
            maxTokens: 320,
            temperature: 0.85,
        });
        return res.text.trim() || null;
    }

    /**
     * Nightly self-model consolidation (user's ③). Given who the character dealt
     * with today + what actually passed, it rewrites its CURRENT one-line view of
     * each — OVERWRITE, latest-wins. Prompt is grounded in the day's events and
     * forbids scripting (§2.43); it asks for the view AS IT NOW STANDS, so a
     * changed relationship supersedes the old line rather than piling up beside it.
     */
    async planDay(input: PlanDayInput): Promise<PlanDayReply | null> {
        const result = await characterAgent.updatePlan({
            name: input.name,
            role: input.role,
            sagaName: input.sagaName,
            dayLabel: input.dayLabel,
            recalledMemories: [],
            currentPlan: input.currentPlan,
            recentSituation: input.recentSituation,
            situation: input.situation,
            relationshipPressure: input.relationshipPressure,
            innerSecret: input.innerSecret,
            livelihoodFraming: input.livelihoodFraming,
        });
        return { planText: result.planText };
    }

    /**
     * 折子座席 —— 幕間的一輪。此人**不在場上**：他正按自己的行當節律過日子，外頭一句
     * 話遞到跟前，他聽見了，回一句，或許記下一筆心事。動詞集受限——不開場面、不拉旁
     * 人進戲、不替別人拿主意；那些是大拍的事。
     *
     * 走既有的 per-character session（`respond`，與 actBeat／povScene 同一把 identity）：
     * 這一輪是**真的活過的**，捎話與答話都留在他自己的 transcript 裡，所以下一個大拍
     * 只需「聽說」而不必重講。沒有 session 的接線（缺 sagaId／未配 sessionDir）退回單輪
     * 無狀態呼叫，機制不變。嚴格 JSON；任何失手回 null——引擎自會把這樁捎話原封留給
     * 下一個大拍。
     */
    async interlude(input: InterludeInput): Promise<InterludeReply | null> {
        const heard = input.stimuli.filter((stimulus) => stimulus.text.trim());
        // 起念（P2）不是外頭遞來的話，是這個人自己先前捎給此刻的一句——說法上分得開，
        // 機制上不分家（同一個佇列、同一套閘門）。
        const said = heard
            .map((stimulus) =>
                stimulus.kind === 'intent'
                    ? `- 你先前起的念，此刻到了：「${stimulus.text.trim()}」`
                    : `- ${stimulus.kind === 'note' ? '東家捎話' : '外頭有人捎話'}：「${stimulus.text.trim()}」`,
            )
            .join('\n');
        if (!said) return null;
        // 整組皆起念的一折，沒有人在跟前說話——別讓提示詞硬說「有話遞到你跟前」。
        const onlyIntent = heard.every((stimulus) => stimulus.kind === 'intent');
        // 鏡像卷有日期就報日期（民國十五年八月五日 晡時），排演卷只有第幾日。
        const when = input.dateLabel
            ? `${input.dateLabel} ${input.clock.partOfDay}`
            : `第${input.clock.day}日・${input.clock.partOfDay}`;
        const percept = [
            '【幕間·你此刻不在場上】',
            // activityHint 已是完整一句（「你正在：排戲」或節律推的所在），直接落地，
            // 不再包一層「你此刻本該在」——否則疊成「你此刻本該在：你正在：排戲」。
            `${when}。${input.activityHint ? `${input.activityHint}。` : ''}`,
            onlyIntent ? '你心裡自己記著的一樁事，時候到了：' : '有話遞到你跟前：',
            said,
            '',
            '你聽見了。回一句你此刻真會說、真會做的——民國年間戲班子裡的人怎麼說話，你就怎麼說；',
            '不許現代腔、不許洋詞、不許旁白解釋。就這一句（≤40字，可帶一個小動作）：',
            '不開場面、不拉旁人進戲、不替不在跟前的人拿主意。',
            '若這句話在你心裡留下了什麼，另記一筆心事（≤30字，第一人稱）；沒有就省略。',
            '若此刻起了一樁稍後要辦的念，記 {"inMinutes":分鐘,"note":"…"}；沒有就省略。',
            '若你此刻正做著一件要花時間的事，記 {"what":"…","forMinutes":分鐘}；沒有就省略。',
            '嚴格只輸出 JSON：{"response":"…","memoryNote":"…可省略…","followUp":{…可省略…},"activity":{…可省略…}}，',
            '不要 markdown、不要多餘文字。',
        ].join('\n');

        const identity = this.identity({
            sagaId: input.sagaId,
            characterId: input.characterId,
            name: input.name,
            persona: input.persona ?? '',
        });
        try {
            let raw: string;
            if (identity && this.sessions) {
                raw = await this.sessions.respond(identity, percept, {
                    eventId: `interlude:${input.stimuli[0]?.id ?? input.characterId}`,
                    maxTokens: 260,
                    temperature: 0.9,
                });
            } else {
                const client = llmText.createTextClient({ kind: 'primary' });
                const res = await client.chat({
                    model: client.defaultModel,
                    system: `你就是${input.name}。${input.persona ?? ''}\n你活在民國年間的一座戲園子裡。只答此刻被問到的這一樁。`,
                    messages: [{ role: 'user', content: percept }],
                    maxTokens: 260,
                    temperature: 0.9,
                });
                raw = res.text;
            }
            const obj = extractRewriteJson(raw) as {
                response?: unknown;
                memoryNote?: unknown;
                followUp?: unknown;
                activity?: unknown;
            } | null;
            const response = typeof obj?.response === 'string' ? toTraditional(obj.response.trim()).slice(0, 60) : '';
            if (!response) return null;
            const note = typeof obj?.memoryNote === 'string' ? obj.memoryNote.trim() : '';
            return {
                response,
                ...(note ? { memoryNote: toTraditional(note).slice(0, 30) } : {}),
                ...(readFollowUp(obj?.followUp) ?? {}),
                ...(readActivity(obj?.activity) ?? {}),
            };
        } catch {
            return null; // 幕間沒答上不是事故：這樁捎話留給大拍
        }
    }

    async consolidateSelfModel(input: SelfModelConsolidateInput): Promise<SelfModelConsolidateReply> {
        const system = [
            '入夜了。你替一個戲園角色做一件事:把 TA 心裡「此刻對某些人的看法」更新到最新。',
            '',
            '**鐵則**:',
            '1. 每個人只給**一句**(≤40字、第一人稱)「此刻在我心裡，TA 是什麼」——寫的是**現在**,',
            '   不是流水記、不是回憶清單。今天若關係變了(舊事了結、心涼了、更近了),就寫**新的**,',
            '   舊的那句作廢。',
            '2. 必須貼著今天實際發生的事,不要替 TA 安排以後要怎樣、不要暗示劇情。',
            '2b. 代詞鐵則:對方是女子(含坤生,台上扮男台下仍是她)就寫「她」,男子寫「他」,',
            '    行當各歸其主,別張冠李戴。',
            '2c. 比喻的本性不許漂移:心裡的比方指什麼就仍是什麼,情分不可寫成銀錢文書',
            '    (借據、欠條);已經走樣的舊看法,趁這一晚改回本性。',
            '3. 你可以(非必須)另外寫**一句**這一天讓 TA 對「自己是誰」有的新體悟(≤30字,第一人稱)。',
            '',
            '**輸出**:嚴格只輸出 JSON:',
            '{"relationshipViews":[{"otherId":"…","view":"…"}],"identityInsight":"…可省略…"}',
            '不要 markdown、不要多餘文字。',
        ].join('\n');
        const idBlock = input.coreIdentity.length ? `\n# 你一向記得自己是誰\n${input.coreIdentity.map((f) => `- ${f}`).join('\n')}` : '';
        const people = input.interactions
            .map(
                (it) =>
                    `- otherId=${it.otherId}｜${it.otherName}${it.otherRole ? `｜${it.otherRole}` : ''}${it.otherBodyFact ? `｜${it.otherBodyFact}` : ''}${it.currentView ? `｜你原本的看法:「${it.currentView}」` : '｜(你原本沒特別記著TA)'}${it.resolvedWithThem ? '｜(今天你和TA之間有一樁心事了結了)' : ''}\n  今天你和TA之間:${it.todayText || '(只是照了個面)'}`,
            )
            .join('\n');
        const user = [
            `# 你是誰\n${input.name}:${input.persona}`,
            input.secret ? `\n# 你心底的事（只有你自己知道）\n${input.secret}` : '',
            idBlock,
            `\n# 今天你打過交道的人（第${input.day}日入夜）\n${people || '(今天沒和誰深交)'}`,
            `\n把上面每個人「此刻在你（${input.name}）心裡是什麼」各寫一句最新的。`,
        ]
            .filter(Boolean)
            .join('\n');

        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system,
            messages: [{ role: 'user', content: user }],
            maxTokens: 500,
            temperature: 0.7,
        });
        const obj = (extractRewriteJson(res.text) ?? {}) as {
            relationshipViews?: Array<{ otherId?: unknown; view?: unknown }>;
            identityInsight?: unknown;
        };
        const valid = new Set(input.interactions.map((it) => it.otherId));
        const relationshipViews = Array.isArray(obj.relationshipViews)
            ? obj.relationshipViews
                  .map((r) => ({ otherId: String(r?.otherId ?? '').trim(), view: String(r?.view ?? '').trim().slice(0, 40) }))
                  .filter((r) => r.otherId && r.view && valid.has(r.otherId))
            : [];
        const identityInsight =
            typeof obj.identityInsight === 'string' && obj.identityInsight.trim()
                ? obj.identityInsight.trim().slice(0, 30)
                : undefined;
        return { relationshipViews, identityInsight };
    }
}
