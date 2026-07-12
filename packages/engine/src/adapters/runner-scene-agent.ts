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

import { characterAgent, sceneRecord, eventChapter } from '@endless-story/runner';
import { text as llmText } from '@endless-story/llm';
import type {
    ActionKind,
    AudienceReactionInput,
    ChooseActionInput,
    ChooseActionResult,
    GenesisWant,
    RippleJudgeDelta,
    SceneAgentPort,
    SelfModelConsolidateInput,
    SelfModelConsolidateReply,
} from '../ports.ts';
import {
    coerceRewriteReply,
    type RegenerateWantInput,
    type RewriteSpawn,
    extractRewriteJson,
    type RewriteLedgerInput,
    type RewriteReply,
} from '../core/want-rewrite.ts';

const ACTION_KINDS: ActionKind[] = [
    'propose_play',
    'join_play',
    'compose',
    'rehearse',
    'seek_person',
    'perform',
    'personal',
];

export class RunnerSceneAgent implements SceneAgentPort {
    actBeat = characterAgent.actBeat;
    judgeWantResolved = characterAgent.judgeWantResolved;

    async reviewScene(
        input: Parameters<typeof characterAgent.reviewScene>[0],
    ): ReturnType<typeof characterAgent.reviewScene> {
        return characterAgent.reviewScene(input);
    }

    async povReflect(
        input: Parameters<typeof characterAgent.povReflect>[0],
    ): ReturnType<typeof characterAgent.povReflect> {
        return characterAgent.povReflect(input);
    }

    async povScene(
        input: Parameters<typeof characterAgent.povScene>[0],
    ): ReturnType<typeof characterAgent.povScene> {
        return characterAgent.povScene(input);
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
        return sceneRecord.weaveTickChapter(input);
    }

    async reviewChapter(
        input: Parameters<typeof sceneRecord.reviewChapter>[0],
    ): ReturnType<typeof sceneRecord.reviewChapter> {
        return sceneRecord.reviewChapter(input);
    }

    async composeEpisode(
        input: Parameters<typeof eventChapter.composeEpisode>[0],
    ): Promise<string | null> {
        return eventChapter.composeEpisode(input);
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
            '- personal:以上都不是的私事(練功/了結舊帳/放電/處理生活)。',
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
            '你是一個戲園角色「心裡那本帳」的記帳人。給你這個人剛剛做過的一件事(逐字),',
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
            '1. 承接——剛了結一樁,人到了新的地步:守住了的怕失去、得不到的想放下、了了債的問往後怎麼過。',
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
            '   不是流水帳、不是回憶清單。今天若關係變了(舊帳了結、心涼了、更近了),就寫**新的**,',
            '   舊的那句作廢。',
            '2. 必須貼著今天實際發生的事,不要替 TA 安排以後要怎樣、不要暗示劇情。',
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
                    `- otherId=${it.otherId}｜${it.otherName}${it.currentView ? `｜你原本的看法:「${it.currentView}」` : '｜(你原本沒特別記著TA)'}${it.resolvedWithThem ? '｜(今天你和TA之間有一樁心事了結了)' : ''}\n  今天你和TA之間:${it.todayText || '(只是照了個面)'}`,
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
