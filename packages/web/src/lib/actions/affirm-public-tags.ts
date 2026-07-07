'use server';

import { Transaction } from '@mysten/sui/transactions';
import { createTextClient } from '@endless-story/llm/text';
import {
    buildPublicTagsPrompt,
    parsePublicTags,
    type CharacterCandidate,
    type RolledAttribute,
} from '@endless-story/llm/prompts';
import { ENDLESS_STORY_DEPLOYMENT, findCreatedObjectId, tx as endlessTx } from '@endless-story/sdk';
import {
    deriveFallbackPublicTags,
    mergePublicTags,
    socialTagsOnly,
} from '../public-tags.js';
import { getAdminContext, execAdminTx } from '../chain/admin-signer.js';

const INTENT_WITNESS = 6;
const TAG_OP_KIND_ADD = 0;

export interface AffirmMintPublicTagsInput {
    characterId: string;
    sceneId: string;
    characterName: string;
    candidate: CharacterCandidate;
    rolledValues: RolledAttribute[];
    recruitmentSpecialty?: string;
    recruitmentIntent?: string;
}

export interface AffirmMintPublicTagsResult {
    ok: boolean;
    tags?: string[];
    eventId?: string;
    pushDigest?: string;
    applyDigest?: string;
    llmSkipped?: string;
    error?: string;
}

export async function affirmMintPublicTagsAction(
    input: AffirmMintPublicTagsInput,
): Promise<AffirmMintPublicTagsResult> {
    const deployment = ENDLESS_STORY_DEPLOYMENT;
    if (!deployment.packageId || !deployment.sagaId || !deployment.storytellerCapId) {
        return { ok: false, llmSkipped: 'deployment_not_ready', error: 'saga 尚未種子化' };
    }
    if (!input.sceneId) return { ok: false, error: '缺少 sceneId，無法建立身份確認事件' };

    const fallbackTags = deriveFallbackPublicTags(input);
    let llmTags: string[] = [];
    let llmSkipped: string | undefined;
    try {
        const prompt = buildPublicTagsPrompt({
            candidate: input.candidate,
            rolledValues: input.rolledValues,
            recruitmentSpecialty: input.recruitmentSpecialty,
            recruitmentIntent: input.recruitmentIntent,
            fallbackTags: socialTagsOnly(fallbackTags),
        });
        const client = createTextClient({ kind: 'cheap' });
        const res = await client.chat({
            model: client.defaultModel,
            messages: prompt.messages,
            system: prompt.system,
            maxTokens: prompt.maxTokens,
            temperature: 0.45,
        });
        llmTags = parsePublicTags(res.text)?.tags ?? [];
        if (llmTags.length === 0) llmSkipped = 'llm_parse_empty';
    } catch (err) {
        llmSkipped = err instanceof Error ? err.message : String(err);
    }

    const tags = mergePublicTags(fallbackTags, llmTags);
    if (tags.length === 0) return { ok: false, llmSkipped, error: '沒有可寫入的公開標籤' };

    try {
        const pushed = await pushPublicTagEvent({
            characterName: input.characterName,
            sceneId: input.sceneId,
            tags,
        });
        const applyDigest = await resolveAndApplyPublicTags({
            eventId: pushed.eventId,
            sceneId: input.sceneId,
            characterId: input.characterId,
            tags,
        });
        return {
            ok: true,
            tags,
            eventId: pushed.eventId,
            pushDigest: pushed.pushDigest,
            applyDigest,
            llmSkipped,
        };
    } catch (err) {
        return { ok: false, tags, llmSkipped, error: err instanceof Error ? err.message : String(err) };
    }
}

async function pushPublicTagEvent(input: {
    characterName: string;
    sceneId: string;
    tags: string[];
}): Promise<{ eventId: string; pushDigest: string }> {
    const deployment = ENDLESS_STORY_DEPLOYMENT;
    const admin = getAdminContext();
    const tx = new Transaction();
    const card = tx.add(
        endlessTx.event.newCardTemplate({
            id: 1,
            intent: INTENT_WITNESS,
            label: '證',
            payload: [],
        }),
    );
    const catalog = tx.makeMoveVec({
        type: `${deployment.packageId}::event::CardTemplate`,
        elements: [card],
    });
    tx.add(
        endlessTx.event.pushEvent({
            cap: deployment.storytellerCapId!,
            saga: deployment.sagaId!,
            sceneId: input.sceneId,
            title: `身份確認 · ${input.characterName}`,
            summary: `公開確認 ${input.characterName} 的社會標籤：${input.tags.join('、')}`,
            scale: 1,
            catalog,
            handSize: 1n,
        }),
    );

    const res = await execAdminTx(admin, tx);
    if (!res.success) {
        throw new Error(res.error ?? '身份確認事件建立失敗');
    }

    const eventId = findCreatedObjectId(res, '::event::BudgetEvent');
    if (!eventId) throw new Error('身份確認事件交易成功，但找不到 BudgetEvent object');
    return { eventId, pushDigest: res.digest };
}

async function resolveAndApplyPublicTags(input: {
    eventId: string;
    sceneId: string;
    characterId: string;
    tags: string[];
}): Promise<string> {
    const deployment = ENDLESS_STORY_DEPLOYMENT;
    const admin = getAdminContext();
    const tx = new Transaction();
    const tagOps = input.tags.map((label) =>
        tx.add(
            endlessTx.event.newTagOp({
                characterId: input.characterId,
                kind: TAG_OP_KIND_ADD,
                label,
            }),
        ),
    );
    const tagOpsVec = tx.makeMoveVec({
        type: `${deployment.packageId}::event::TagOp`,
        elements: tagOps,
    });
    const outcomes = tx.add(endlessTx.event.outcomesWithTagOps({ tagOps: tagOpsVec }));
    tx.add(
        endlessTx.event.resolveEvent({
            cap: deployment.storytellerCapId!,
            saga: deployment.sagaId!,
            budgetEvent: input.eventId,
            scene: input.sceneId,
            outcomes,
        }),
    );
    for (let i = 0; i < input.tags.length; i += 1) {
        tx.add(
            endlessTx.event.applyTagOp({
                cap: deployment.storytellerCapId!,
                saga: deployment.sagaId!,
                budgetEvent: input.eventId,
                character: input.characterId,
                opIndex: BigInt(i),
            }),
        );
    }

    const res = await execAdminTx(admin, tx);
    if (!res.success) {
        throw new Error(res.error ?? '公開標籤寫入失敗');
    }
    return res.digest;
}
