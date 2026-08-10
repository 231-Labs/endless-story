import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    compileDossier,
    embedDossierHeader,
    parseDossierHeader,
    validateDossier,
} from '../src/services/event-dossier/compile.ts';
import {
    applyClaimAudit,
    buildClaimAuditPrompt,
    subjectiveClaimBudget,
    validateClaimAudit,
} from '../src/services/event-dossier/claims.ts';

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
        { characterId: 'liu', characterName: '柳生春', role: '許仙', bodyFact: '女', body: '我唱出口才知道，這句話已經不只屬於我。' },
        { characterId: 'su', characterName: '蘇映雪', role: '白素貞', bodyFact: '女', body: '我先看見她的口形變了。\n\n槍尾替我守住半拍。' },
        { characterId: 'lq', characterName: '連翹', role: '小青', bodyFact: '女', body: '她們都在看彼此，只有我看著鑼點。' },
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

test('legacy headers get lossless paragraph shaping and redundant quote repair at read time', () => {
    const bundle = compileDossier(source);
    const perspective = bundle.manifest.perspectives[0];
    const raw = '晨光落上台板。江聞鶴揚聲道：「先走兩圈。」柳生春偏頭一笑。她沒有退。蘇映雪抱著手臂。連翹沉腰站穩。鑼聲還沒響。眾人都在等。';
    perspective.passages[0].text = raw;
    perspective.claims[0] = {
        ...perspective.claims[0],
        text: '客觀逐拍記錄：柳生春「偏頭笑道：「你先請。」」',
        relation: 'supports',
        review: 'verified',
    };
    const parsed = parseDossierHeader(embedDossierHeader('正文', bundle)).bundle!;
    const migrated = parsed.manifest.perspectives[0];
    assert.equal(migrated.passages.length, 4);
    assert.equal(migrated.passages.map((passage) => passage.text).join(''), raw);
    assert.equal(migrated.claims[0].text, '客觀逐拍記錄：柳生春：偏頭笑道：「你先請。」');
});

test('one POV is not publishable as a multi-POV dossier', () => {
    assert.throws(() => compileDossier({ ...source, perspectives: source.perspectives.slice(0, 1) }), /fewer than two/);
});

test('claim audit uses a closed evidence vocabulary and drops invented refs', () => {
    const prompt = buildClaimAuditPrompt(source.event, source.perspectives.slice(0, 1), source.perspectives);
    assert.match(prompt, /beat:0/);
    assert.match(prompt, /session/);
    assert.match(prompt, /第三人稱代詞用「她」/);
    assert.match(prompt, /柳生春｜許仙｜女｜第三人稱「她」/);
    assert.match(prompt, /連翹｜小青｜女｜第三人稱「她」/);
    assert.match(prompt, /女子扮小生仍用「她」/);
    const enriched = applyClaimAudit(source.event, source.perspectives, JSON.stringify({
        perspectives: [{
            characterId: 'liu',
            lead: '柳生春把臨時添唱當成出口，直到接唱聲讓那句話再也收不回來。',
            claims: [
                {
                    text: '柳生春確實添唱。',
                    mode: 'observed',
                    relation: 'supports',
                    review: 'unresolved',
                    evidenceRefs: ['beat:0'],
                    passageRefs: ['p:0'],
                    editorialNote: '客觀逐拍第一拍直接記錄了柳生春添唱，因此可由公開層核對。',
                },
                {
                    text: '台下有人替她哭。',
                    mode: 'heard',
                    relation: 'unresolved',
                    evidenceRefs: ['invented:review'],
                    passageRefs: ['p:0'],
                    editorialNote: '這句話沒有任何封存證據可以支撐。',
                },
            ],
        }],
    }));
    assert.equal(enriched[0].claims?.length, 1);
    assert.deepEqual(enriched[0].claims?.[0].evidenceRefs, ['spring-snow:d81:stage:beat:0']);
    assert.equal(enriched[0].claims?.[0].review, 'verified', 'verified anchor is generated only from the frozen beat');
    assert.match(enriched[0].claims?.[0].text ?? '', /添了一句定稿沒有的唱詞/);
    assert.doesNotMatch(enriched[0].claims?.[0].text ?? '', /。」」/);
    assert.deepEqual(enriched[0].passageClaimIds?.[0], ['spring-snow:d81:stage:claim:liu:0']);
    assert.equal(enriched[1].claims?.length, 1, 'every POV gets only its deterministic canon anchor until its own audit arrives');
});

test('complete audit requires bespoke copy, mixed grounded decisions, and every passage mapped', () => {
    const onePerspective = source.perspectives.slice(0, 1);
    const enriched = applyClaimAudit(source.event, onePerspective, JSON.stringify({
        perspectives: [{
            characterId: 'liu',
            lead: '柳生春把臨時添唱當成出口，直到接唱聲讓那句話再也收不回來。',
            claims: [
                {
                    text: '柳生春確實添了一句定稿沒有的唱詞。',
                    mode: 'observed',
                    relation: 'supports',
                    evidenceRefs: ['beat:0'],
                    passageRefs: ['p:0'],
                    editorialNote: '客觀逐拍第一拍直接記錄添唱，這一項與正史完全相符。',
                },
                {
                    text: '她認為唱詞出口後便不再只屬於自己。',
                    mode: 'observed',
                    relation: 'reinterprets',
                    evidenceRefs: ['beat:0', 'session'],
                    passageRefs: ['p:0'],
                    editorialNote: '添唱是公開事實，但歸屬感的改變只存在柳生春自己的理解裡。',
                },
            ],
        }],
    }));

    assert.deepEqual(validateClaimAudit(enriched), []);
    assert.deepEqual(enriched[0].claims?.map((claim) => claim.review), ['verified', 'contested']);
    assert.deepEqual(enriched[0].claims?.map((claim) => claim.relation), ['supports', 'reinterprets']);
    assert.deepEqual(enriched[0].claims?.map((claim) => claim.epistemicMode), ['observed', 'inferred']);
});

test('dedicated one-POV audit accepts an exact character-name id alias', () => {
    const onePerspective = source.perspectives.slice(0, 1);
    const enriched = applyClaimAudit(source.event, onePerspective, JSON.stringify({
        perspectives: [{
            characterId: '柳生春',
            lead: '柳生春把添唱當成出口，卻在接唱聲裡聽見那句話已經離手。',
            claims: [{
                text: '她認為唱詞一出口，就不再只屬於自己。',
                mode: 'inferred',
                relation: 'reinterprets',
                evidenceRefs: ['beat:0', 'session'],
                passageRefs: ['p:0'],
                editorialNote: '添唱可由客觀逐拍核對，但話語是否離手只屬於柳生春的理解。',
            }],
        }],
    }));

    assert.deepEqual(validateClaimAudit(enriched), []);
    assert.equal(enriched[0].claims?.length, 2);
    assert.equal(enriched[0].lead?.startsWith('柳生春'), true);
});

test('audit keeps a third grounded claim when long POV needs it for passage coverage', () => {
    const long = [{
        ...source.perspectives[0],
        body: '我先唱出了那句。\n\n她接住了我。\n\n鑼點落下時，我才知道回不去了。',
    }];
    const enriched = applyClaimAudit(source.event, long, JSON.stringify({
        perspectives: [{
            characterId: 'liu',
            lead: '柳生春先把添唱當成出口，直到鑼點落下才知道那句話已經回不來。',
            claims: [
                {
                    text: '她把自己先唱出的事理解成主動跨線。',
                    mode: 'inferred',
                    relation: 'reinterprets',
                    evidenceRefs: ['beat:0', 'session'],
                    passageRefs: ['p:0'],
                    editorialNote: '添唱可由第一拍核對，但是否主動跨線只屬於她的自我理解。',
                },
                {
                    text: '她認為蘇映雪接住了自己。',
                    mode: 'remembered',
                    relation: 'reinterprets',
                    evidenceRefs: ['beat:1', 'session'],
                    passageRefs: ['p:1'],
                    editorialNote: '接唱是第二拍的客觀動作，接住一詞則是柳生春賦予它的意義。',
                },
                {
                    text: '鑼點使她感到事情已經無法收回。',
                    mode: 'inferred',
                    relation: 'reinterprets',
                    evidenceRefs: ['beat:2', 'session'],
                    passageRefs: ['p:2'],
                    editorialNote: '槍尾頓臺可核對，無法收回是她在該時刻形成的主觀判斷。',
                },
            ],
        }],
    }));

    assert.deepEqual(validateClaimAudit(enriched), []);
    assert.equal(enriched[0].claims?.length, 4, 'one canonical anchor plus three subjective claims');
});

/** A seven-paragraph POV whose trailing paragraphs ride on one shared claim.
 * This is the shape that aborted 蘇映雪's dossier on the 2026-08-10 spring-snow
 * run: a flat four-claim cap dropped the fifth claim, and the coverage gate then
 * failed on exactly the two paragraphs that claim carried. */
const sevenParagraphBody = [
    '我先看見她的口形變了。',
    '那不是定稿裡的句子。',
    '鑼點慢了半拍，像也在等我決定。',
    '我接了。',
    '接的時候我沒想過台下。',
    '散戲以後，班主沒有看我。',
    '回房的路上，我才聽見自己心跳。',
].join('\n\n');

const sevenParagraphClaims = [
    { text: '她認為柳生春改詞是衝著自己來的。', mode: 'inferred', relation: 'reinterprets', passageRefs: ['p:0', 'p:1'] },
    { text: '她把慢下來的鑼點記成一次等待。', mode: 'inferred', relation: 'reinterprets', passageRefs: ['p:2'] },
    { text: '她認為自己是主動接的，不是被推著接的。', mode: 'remembered', relation: 'reinterprets', passageRefs: ['p:3'] },
    { text: '她相信那半拍裡沒有考慮過台下。', mode: 'inferred', relation: 'unresolved', passageRefs: ['p:4'] },
    { text: '她把班主的不看視為責備。', mode: 'inferred', relation: 'reinterprets', passageRefs: ['p:5', 'p:6'] },
].map((claim, index) => ({
    ...claim,
    evidenceRefs: claim.relation === 'unresolved' ? ['session'] : [`beat:${index % 3}`, 'session'],
    editorialNote: '客觀逐拍只記下了動作與說出口的話，這一層意思只存在蘇映雪自己的理解裡。',
}));

test('claim budget scales with paragraph count so the cap cannot starve the coverage gate', () => {
    const long = [{ ...source.perspectives[1], body: sevenParagraphBody }];
    assert.equal(subjectiveClaimBudget(sevenParagraphBody), 6, 'anchor holds p:0, so the budget covers p:1..p:6');

    const enriched = applyClaimAudit(source.event, long, JSON.stringify({
        perspectives: [{
            characterId: 'su',
            lead: '蘇映雪把半拍的猶豫記成主動，直到班主別開眼才不確定自己接的是什麼。',
            claims: sevenParagraphClaims,
        }],
    }));

    assert.deepEqual(validateClaimAudit(enriched), [], 'p:5 and p:6 keep the claim that carries them');
    assert.equal(enriched[0].claims?.length, 6, 'one canonical anchor plus all five audited claims survive');
});

test('the prompt asks for exactly the number of claims the parser will keep', () => {
    const long = [{ ...source.perspectives[1], body: sevenParagraphBody }];
    const prompt = buildClaimAuditPrompt(source.event, long, source.perspectives);
    assert.match(prompt, /本卷宗共 7 段/);
    assert.match(prompt, new RegExp(`最多可寫 ${subjectiveClaimBudget(sevenParagraphBody)} 條 claim`));
    assert.doesNotMatch(prompt, /1–4 個主觀 claim/, 'no second hardcoded budget to drift from the parser cap');
});

test('the budget is still a cost guard: claims beyond it are dropped', () => {
    const short = [source.perspectives[0]];
    const budget = subjectiveClaimBudget(source.perspectives[0].body);
    assert.equal(budget, 4, 'a one-paragraph POV keeps the historical floor');

    const enriched = applyClaimAudit(source.event, short, JSON.stringify({
        perspectives: [{
            characterId: 'liu',
            lead: '柳生春把臨時添唱當成出口，直到接唱聲讓那句話再也收不回來。',
            claims: Array.from({ length: budget + 3 }, (_, index) => ({
                text: `她對這一刻的第 ${index + 1} 層理解。`,
                mode: 'inferred',
                relation: 'reinterprets',
                evidenceRefs: ['beat:0', 'session'],
                passageRefs: ['p:0'],
                editorialNote: '添唱可由第一拍核對，這一層意思只屬於柳生春自己的理解。',
            })),
        }],
    }));

    assert.equal(enriched[0].claims?.length, budget + 1, 'anchor plus the budget, extras dropped');
    assert.deepEqual(validateClaimAudit(enriched), []);
});
