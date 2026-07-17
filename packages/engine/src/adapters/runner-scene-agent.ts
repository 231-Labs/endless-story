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
    SelfModelConsolidateInput,
    SelfModelConsolidateReply,
} from '../ports.ts';
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
            maxTokens: input.consummate ? 900 : 480,
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
            let lastErrors: string[] = [];
            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await this.dossierClient!.chat({
                    model: this.dossierClient!.defaultModel,
                    system: `你是${source.characterName}這一份卷宗的專屬認識論編輯。只寫導語、比較既有說法與封存證據；不續寫故事，不創造證據。`,
                    messages: [{
                        role: 'user',
                        content: attempt === 0
                            ? prompt
                            : `${prompt}\n\n【上次輸出未通過】\n${lastErrors.join('\n')}\n請重新輸出完整 JSON，必須有以角色姓名開頭的專屬 lead、1–4 個主觀 claim，並覆蓋每個 p:N。`,
                    }],
                    maxTokens: 1500,
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
                    '把同一客觀事件寫成第一人稱章回。注意、誤讀與情感可以偏；人物、順序、動作、對白不可改。' +
                    '不要替別人斷言內心；不知道的就留白。人物行當、身與第三人稱代詞嚴格按輸入 canon。' +
                    '純正文，350至900字。',
                maxTokens: 1500,
                temperature: 0.82,
            },
        );
        return characterAgent.formatPovSceneParagraphs(toTraditional(projected)) || null;
    }

    async judgeEstablished(
        input: Parameters<typeof characterAgent.judgeEstablished>[0],
    ): ReturnType<typeof characterAgent.judgeEstablished> {
        return characterAgent.judgeEstablished(input);
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
