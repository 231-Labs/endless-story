import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deriveFallbackPublicTags,
    mergePublicTags,
    rolePublicTag,
    sanitizePublicTags,
} from './public-tags.ts';

const candidate = {
    name: '沈照夜',
    description: '百貨公司模特轉入梨園，穿洋裝也能提槍翻身，台下不太服人。',
    physicalFacts: { gender: '女', age: 22, body: '勻稱' },
    attributes: [],
};

test('deriveFallbackPublicTags includes role and visible social identity tags', () => {
    const tags = deriveFallbackPublicTags({
        candidate,
        recruitmentSpecialty: '刀馬旦 / 武旦',
        recruitmentIntent: '需要能在租界舞台上壓住武場，也帶一點摩登照相館出身。',
        rolledValues: [
            { key: 'appearance', label: '外貌', value: 92 },
            { key: 'constitution', label: '筋骨', value: 88 },
            { key: 'acuity', label: '機敏', value: 76 },
            { key: 'disposition', label: '心性', value: 42 },
        ],
    });
    assert.equal(tags[0], 'role:刀馬旦/武旦');
    assert.ok(tags.includes('麗質天生'));
    assert.ok(tags.includes('筋骨清健'));
    assert.ok(tags.includes('武場底子'));
    assert.ok(tags.includes('摩登新派'));
});

test('sanitizePublicTags drops malformed social tags but preserves role tags', () => {
    assert.deepEqual(
        sanitizePublicTags([' role: 坤生 / 女小生 ', ' role: 坤生 / 女小生 ', '秘密身世：王族', 'CP相好', '台緣出眾']),
        ['role:坤生/女小生', '台緣出眾'],
    );
});

test('mergePublicTags keeps deterministic tags first and deduplicates LLM tags', () => {
    assert.deepEqual(
        mergePublicTags(['role:花旦', '麗質天生'], ['麗質天生', '文墨清通', 'role:小生']),
        ['role:花旦', '麗質天生', '文墨清通'],
    );
});

test('rolePublicTag returns null for empty roles', () => {
    assert.equal(rolePublicTag('  '), null);
});
