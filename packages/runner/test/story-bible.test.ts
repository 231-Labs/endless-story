/**
 * Story-bible pure-core tests + the 承先啟後 prompt rendering. Proves the
 * read→write continuity loop that makes chapters read as one ongoing novel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    emptyBible,
    threadSlug,
    selectContinuityContext,
    applyChapter,
    type StoryBible,
} from '../src/services/storyteller-chapter/story-bible.ts';
import { buildUserPrompt, type EventCutContext } from '../src/services/event-chapter-compiler/weave.ts';

function seeded(): StoryBible {
    return applyChapter(emptyBible('0xsaga'), {
        day: 1,
        summary: '頭牌之爭起。',
        synopsisAppend: '春雪社為「誰當頭牌」起了爭執。',
        newThreads: [
            { title: '誰當頭牌', state: '蘇映雪與柳生春相爭，未定。', castIds: ['c1', 'c2'] },
            { title: '江聞鶴的唱片', state: '老生想灌第一張唱片。', castIds: ['c3'] },
        ],
        arcUpdates: [
            { characterId: 'c1', name: '蘇映雪', state: '志在頭牌，藏鋒。' },
            { characterId: 'c2', name: '柳生春', state: '外來坤生，按住爭心。' },
        ],
        hooks: ['沈班主還沒表態'],
    });
}

test('threadSlug: ascii slug, CJK falls back to a stable hash slug', () => {
    assert.equal(threadSlug('The Headliner'), 'the-headliner');
    const a = threadSlug('誰當頭牌');
    const b = threadSlug('誰當頭牌');
    assert.equal(a, b); // deterministic
    assert.ok(a.startsWith('t-'));
});

test('applyChapter folds threads/arcs/synopsis/hooks and bumps count', () => {
    const b = seeded();
    assert.equal(b.chapterCount, 1);
    assert.equal(b.throughDay, 1);
    assert.equal(b.threads.length, 2);
    assert.equal(b.arcs.length, 2);
    assert.deepEqual(b.hooks, ['沈班主還沒表態']);
    assert.equal(b.lastChapterSummary, '頭牌之爭起。');
    assert.ok(b.synopsis.includes('頭牌'));
});

test('selectContinuityContext ranks cast-relevant threads first and includes arcs + hooks', () => {
    const b = seeded();
    const ctx = selectContinuityContext(b, ['c1', 'c2']);
    assert.ok(ctx.synopsis);
    // the 頭牌 thread (cast c1,c2) outranks the 唱片 thread (c3)
    assert.equal(ctx.openThreads?.[0]?.startsWith('誰當頭牌'), true);
    assert.deepEqual(ctx.hooks, ['沈班主還沒表態']);
    assert.equal(ctx.castArcs?.length, 2);
    assert.ok(ctx.castArcs?.some((a) => a.name === '蘇映雪'));
});

test('resolved threads drop out of the 承先 context', () => {
    let b = seeded();
    const headlinerId = b.threads.find((t) => t.title === '誰當頭牌')!.id;
    b = applyChapter(b, { day: 5, summary: '頭牌定了。', resolvedThreadIds: [headlinerId] });
    const ctx = selectContinuityContext(b, ['c1', 'c2']);
    assert.ok(!(ctx.openThreads ?? []).some((t) => t.startsWith('誰當頭牌')));
});

test('continuity round-trip: advance a thread + leave a fresh hook → next chapter sees progress', () => {
    let b = seeded();
    // chapter 2 advances the headliner thread and leaves a new hook
    b = applyChapter(b, {
        day: 3,
        summary: '沈班主暗助柳生春。',
        synopsisAppend: '沈班主暗中偏向柳生春。',
        advancedThreads: [{ title: '誰當頭牌', state: '沈班主暗助柳生春，蘇映雪起疑。', castIds: ['c5'] }],
        arcUpdates: [{ characterId: 'c1', name: '蘇映雪', state: '察覺班主偏心，心生芥蒂。' }],
        hooks: ['蘇映雪會不會反擊'],
    });
    assert.equal(b.chapterCount, 2);
    const headliner = b.threads.find((t) => t.title === '誰當頭牌')!;
    assert.equal(headliner.status, 'advanced');
    assert.ok(headliner.state.includes('沈班主'));
    assert.ok(headliner.castIds.includes('c5')); // cast merged in
    const ctx = selectContinuityContext(b, ['c1', 'c2']);
    assert.deepEqual(ctx.hooks, ['蘇映雪會不會反擊']); // prior hook replaced
    assert.ok(ctx.synopsis?.includes('暗中偏向'));
});

// ── prompt rendering: 承先啟後 appears only when continuity is present ──────────
function baseCtx(): EventCutContext {
    return {
        sagaName: '春雪社',
        day: 4,
        sceneName: '後台妝閣',
        eventLabel: '誰壓軸',
        povs: [
            { characterId: 'c1', characterName: '蘇映雪', body: '映雪勻粉。' },
            { characterId: 'c2', characterName: '柳生春', body: '生春按鋒。' },
        ],
    };
}

test('buildUserPrompt renders 承先 block + 啟後 instruction when continuity present', () => {
    const b = seeded();
    const continuity = selectContinuityContext(b, ['c1', 'c2']);
    const prompt = buildUserPrompt({ ...baseCtx(), continuity });
    assert.ok(prompt.includes('故事總綱'));
    assert.ok(prompt.includes('未了的線'));
    assert.ok(prompt.includes('鉤子'));
    assert.ok(prompt.includes('啟後'));
});

test('buildUserPrompt stays byte-for-byte legacy when no continuity (backward compat)', () => {
    const prompt = buildUserPrompt(baseCtx());
    assert.ok(!prompt.includes('故事總綱'));
    assert.ok(!prompt.includes('承先'));
    assert.ok(prompt.includes('各角色 POV'));
});
