import { text as llmText } from '@endless-story/llm';
import type { EpistemicDossierBundle } from '@endless-story/shared';
import { planSeasonAnthology, type PlanSeasonAnthologyOptions, type SeasonAnthologyPlan } from './anthology.ts';

function sourceBlock(bundle: EpistemicDossierBundle, index: number): string {
    const perspectives = bundle.manifest.perspectives.map((perspective) => [
        `- ${perspective.characterName}：${perspective.lead}`,
        ...perspective.passages.map((passage) => `  ${passage.text}`),
    ].join('\n')).join('\n');
    return [
        `## 選材 ${index + 1}｜${bundle.event.title}`,
        `事件 ID：${bundle.manifest.eventId}`,
        `第 ${bundle.event.day} 日｜${bundle.event.scene}`,
        '客觀層：',
        ...bundle.event.canonFacts.map((fact) => `- ${fact}`),
        '角色主觀層：',
        perspectives,
    ].join('\n');
}

function buildAnthologyPrompt(plan: SeasonAnthologyPlan, bundles: EpistemicDossierBundle[]): string {
    const byId = new Map(bundles.map((bundle) => [bundle.manifest.eventId, bundle]));
    const sources = plan.selected.map((pick, index) => {
        const bundle = byId.get(pick.eventId);
        if (!bundle) throw new Error(`selected dossier missing: ${pick.eventId}`);
        return `${sourceBlock(bundle, index)}\n編排角色：${pick.role}；入選原因：${pick.reason}`;
    }).join('\n\n');
    return [
        '你是《Endless Story》的季選集編輯。你的工作是編排已選定的真實事件，不是補寫世界。',
        '寫一篇 1200–2400 字、可以獨立讀懂且有情感弧線的中文章回。',
        '鐵則：',
        '1. 事件順序、動作、說出口的話，只能來自下方客觀層，不得創造新事件或新對白。',
        '2. 角色主觀層可以作為內心詮釋，但不可冒充客觀事實；有衝突時保留歧義。',
        '3. turning_point 寫足，development 用來加深人物，quiet_bridge 最多一小段。',
        '4. 開頭給一個具體鉤子，結尾停在已發生事件造成的新局面，不要空泛總結。',
        '5. 文末加「本回選材」清單，逐項列出事件 ID，讓讀者能回到事件卷宗。',
        '只輸出 Markdown 正文。',
        '',
        sources,
    ].join('\n');
}

export class SeasonEditorAgent {
    plan(
        bundles: ReadonlyArray<EpistemicDossierBundle>,
        options?: PlanSeasonAnthologyOptions,
    ): SeasonAnthologyPlan {
        return planSeasonAnthology(bundles, options);
    }

    async compose(
        plan: SeasonAnthologyPlan,
        bundles: EpistemicDossierBundle[],
        model?: string,
    ): Promise<string> {
        if (!plan.publishable) throw new Error(`season anthology is not publishable: ${plan.reason}`);
        const llm = llmText.createTextClient({ kind: 'primary' });
        const response = await llm.chat({
            model: model ?? llm.defaultModel,
            system: '你是嚴謹而有節奏感的小說選集編輯；不改史實，不替角色消除歧義。',
            messages: [{ role: 'user', content: buildAnthologyPrompt(plan, bundles) }],
            maxTokens: 4200,
            temperature: 0.72,
        });
        const prose = response.text.trim();
        if (!prose) throw new Error('season editor returned empty prose');
        return prose;
    }
}
