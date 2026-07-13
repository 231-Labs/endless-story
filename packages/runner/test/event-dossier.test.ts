import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    compileDossier,
    embedDossierHeader,
    parseDossierHeader,
    validateDossier,
} from '../src/services/event-dossier/compile.ts';
import { applyClaimAudit, buildClaimAuditPrompt } from '../src/services/event-dossier/claims.ts';

const source = {
    event: {
        id: 'spring-snow:d81:stage',
        canonHead: 'commit:0x81',
        eventTx: '0xtx81',
        saga: '春雪社',
        day: 81,
        scene: '大世界戲臺',
        title: '別把我寫進戲裡',
        beats: [
            { characterId: 'liu', name: '柳生春', text: '添了一句定稿沒有的唱詞。' },
            { characterId: 'su', name: '蘇映雪', text: '停半拍後接了一句。' },
            { characterId: 'lq', name: '連翹', text: '以槍尾頓臺兩響，樂隊重新入板。' },
        ],
    },
    perspectives: [
        { characterId: 'liu', characterName: '柳生春', role: '許仙', body: '我唱出口才知道，這句話已經不只屬於我。' },
        { characterId: 'su', characterName: '蘇映雪', role: '白素貞', body: '我先看見她的口形變了。\n\n槍尾替我守住半拍。' },
        { characterId: 'lq', characterName: '連翹', role: '小青', body: '她們都在看彼此，只有我看著鑼點。' },
    ],
};

test('compiler freezes one canon head while preserving three different POV bodies', () => {
    const bundle = compileDossier(source);
    assert.equal(bundle.manifest.canonHead, 'commit:0x81');
    assert.equal(bundle.manifest.eventTx, '0xtx81');
    assert.equal(bundle.manifest.perspectives.length, 3);
    assert.equal(bundle.event.canonFacts.length, 3);
    assert.match(bundle.manifest.perspectives[0].passages[0].text, /唱出口/);
    assert.match(bundle.manifest.perspectives[1].passages[0].text, /口形變了/);
    assert.match(bundle.manifest.perspectives[2].passages[0].text, /鑼點/);
});

test('every generated claim is anchored and every passage points to a known claim', () => {
    const bundle = compileDossier(source);
    assert.deepEqual(validateDossier(bundle), { ok: true, errors: [] });
    const evidence = new Set(bundle.manifest.evidence.map((e) => e.id));
    for (const perspective of bundle.manifest.perspectives) {
        const claims = new Set(perspective.claims.map((c) => c.id));
        for (const claim of perspective.claims) {
            assert.ok(claim.evidenceRefs.every((ref) => evidence.has(ref)));
        }
        for (const passage of perspective.passages) {
            assert.ok(passage.claimIds.every((id) => claims.has(id)));
        }
    }
});

test('invalid model claim cannot smuggle an unknown evidence reference', () => {
    assert.throws(() => compileDossier({
        ...source,
        perspectives: source.perspectives.map((p, i) => i ? p : {
            ...p,
            claims: [{
                id: 'bad-claim',
                text: '一件沒有證據的事。',
                epistemicMode: 'fabricated' as const,
                relation: 'contradicts' as const,
                review: 'unresolved' as const,
                evidenceRefs: ['missing:evidence'],
            }],
        }),
    }), /unknown evidence/);
});

test('dossier header round-trips inside the same immutable chapter blob', () => {
    const bundle = compileDossier(source);
    const prose = '## 一句入戲　三人失聲\n\n臺下掌聲驟起。';
    const embedded = embedDossierHeader(prose, bundle);
    const parsed = parseDossierHeader(embedded);
    assert.deepEqual(parsed.bundle, bundle);
    assert.equal(parsed.body, prose);
});

test('one POV is not publishable as a multi-POV dossier', () => {
    assert.throws(() => compileDossier({ ...source, perspectives: source.perspectives.slice(0, 1) }), /fewer than two/);
});

test('claim audit uses a closed evidence vocabulary and drops invented refs', () => {
    const prompt = buildClaimAuditPrompt(source.event, source.perspectives);
    assert.match(prompt, /beat:0/);
    assert.match(prompt, /session/);
    const enriched = applyClaimAudit(source.event, source.perspectives, JSON.stringify({
        perspectives: [{
            characterId: 'liu',
            claims: [
                { text: '柳生春確實添唱。', mode: 'observed', relation: 'supports', review: 'verified', evidenceRefs: ['beat:0'] },
                { text: '台下有人替她哭。', mode: 'heard', relation: 'unresolved', review: 'unresolved', evidenceRefs: ['invented:review'] },
            ],
        }],
    }));
    assert.equal(enriched[0].claims?.length, 1);
    assert.deepEqual(enriched[0].claims?.[0].evidenceRefs, ['spring-snow:d81:stage:beat:0']);
    assert.equal(enriched[1].claims, undefined);
});
