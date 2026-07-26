import assert from 'node:assert/strict';
import test from 'node:test';

import { seedAcquaintance } from '../src/core/acquaintance.ts';
import { seedRenown } from '../src/core/renown.ts';
import { isStageScene } from '../src/core/skills.ts';
import { templeScenesOf } from '../src/core/temple-prayer.ts';
import { buildWorldState, type RawPreset } from '../src/preset.ts';

function preset(publiclyRecognizable = true): RawPreset {
    return {
        id: 'strict-preset',
        saga: { description: '一座城' },
        scenes: [
            {
                name: '沒有戲台二字的場地',
                description: '演出所在',
                privacy: 0,
                capabilities: ['stage'],
            },
            {
                name: '觀音堂',
                description: '名字像廟但沒有宣告',
                privacy: 1,
            },
            {
                name: '靜室',
                description: '名字不像廟但有宣告',
                privacy: 1,
                capabilities: ['temple'],
            },
        ],
        founding_cast: [
            {
                name: '甲',
                role: '班主',
                publicly_recognizable: publiclyRecognizable,
                description: '甲',
                work_scene: '沒有戲台二字的場地',
                home_scene: '觀音堂',
            },
            {
                name: '乙',
                role: '小生',
                description: '乙',
                work_scene: '靜室',
                home_scene: '靜室',
            },
        ],
        bonds: [],
        established_pairs: [],
    };
}

function stripStrictFields(raw: RawPreset): RawPreset {
    const copy = structuredClone(raw);
    for (const scene of copy.scenes ?? []) delete scene.capabilities;
    for (const member of copy.founding_cast ?? []) delete member.publicly_recognizable;
    delete copy.bonds;
    delete copy.established_pairs;
    return copy;
}

test('flag off ignores STRICT-only preset declarations byte-for-byte', () => {
    const authored = preset();
    const legacy = stripStrictFields(authored);

    assert.equal(
        JSON.stringify(buildWorldState(authored).data),
        JSON.stringify(buildWorldState(legacy).data),
    );
});

test('STRICT carries scene capabilities, public recognizability and explicit empty ties', () => {
    const world = buildWorldState(preset(), undefined, 6, { strictStructured: true });
    const stage = world.data.scenes[0];

    assert.deepEqual(stage.capabilities, ['stage']);
    assert.equal(world.data.cast[0].publiclyRecognizable, true);
    assert.deepEqual(world.data.bonds, []);
    assert.deepEqual(world.data.establishedPairs, []);
    assert.equal(isStageScene(stage, true), true);
    assert.equal(isStageScene(world.data.scenes[1], true), false);

    const temples = templeScenesOf(world);
    assert.equal(temples.has(world.data.scenes[1].id), false);
    assert.equal(temples.has(world.data.scenes[2].id), true);
    assert.ok(
        world.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'temple-capability' &&
                event.subjectId === world.data.scenes[1].id,
        ),
    );
});

test('STRICT welcome reads disposition, never the authored tone prose', () => {
    const world = buildWorldState(preset(), undefined, 6, { strictStructured: true });
    world.setEdge('c0', 'c1', '暖得像一家人');

    assert.equal(world.welcome('c0', 'c1'), 0.5);
    assert.ok(
        world.data.structuredMonitor?.warnings.some(
            (warning) => warning.kind === 'missing-edge-disposition',
        ),
    );

    world.setEdge('c0', 'c1', '一段完全中性的顯示文字', 'warm');
    assert.ok(world.welcome('c0', 'c1') >= 0.7);
});

test('STRICT acquaintance and renown use authored fields or neutral defaults', () => {
    const declared = buildWorldState(preset(), undefined, 6, { strictStructured: true });
    declared.data.subjectiveNaming = true;
    seedAcquaintance(declared);
    assert.equal(declared.acquaintLevel('c1', 'c0'), 'acquainted');

    const missing = buildWorldState(preset(false), undefined, 6, { strictStructured: true });
    delete missing.data.cast[0].publiclyRecognizable;
    missing.data.subjectiveNaming = true;
    seedAcquaintance(missing);
    assert.equal(missing.acquaintLevel('c1', 'c0'), 'stranger');

    seedRenown(missing);
    assert.equal(missing.data.cast[0].renown, 0.5);
    assert.equal(missing.data.cast[0].selfRegard, 0.5);
    assert.ok(
        missing.data.structuredMonitor?.warnings.some(
            (warning) =>
                warning.kind === 'missing-public-recognizability' ||
                warning.kind === 'missing-explicit-renown',
        ),
    );
});
