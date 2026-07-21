/**
 * 復核座席 — the 班主's three-gate review of a user-minted candidate
 * (RECRUIT_INCENSE_SPEC §2). The pure leaf must (1) carry all three gates —
 * 正典/文風/安全 — and the 原句照錄 demand in the built prompts, (2) clamp
 * replies fail-safe (an accept without a whole seed admits NOBODY), and (3)
 * make the 擁有感錨點 checkable (hasVerbatimAnchor), so a 拓寫 that paraphrased
 * every user sentence away is detectable and retryable.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildSystemPrompt,
    buildUserPrompt,
    hasVerbatimAnchor,
    parseRecruitReply,
    type RecruitDecideInput,
} from '../src/services/character-agent/recruit-prompt.ts';

const input: RecruitDecideInput = {
    candidate: { name: '沈茶蘼', seedText: '十四歲那年在蘇州河邊學會了吊嗓子。她放不下早夭的妹妹。', role: '武生' },
    canonSummary: '民國十五年，上海梨園。無洋槍、無穿越。',
    castList: ['柳含煙·青衣', '金鳳·花旦'],
    slotNote: '班主嫌武戲太素',
};

test('the built prompts carry the three gates, the 原句照錄 demand, and the candidate verbatim', () => {
    const sys = buildSystemPrompt();
    assert.match(sys, /正典/, 'gate 1 present');
    assert.match(sys, /文風/, 'gate 2 present');
    assert.match(sys, /安全/, 'gate 3 present');
    assert.match(sys, /原句照錄/, 'the 擁有感錨點 demand is in the contract');
    assert.match(sys, /JSON/, 'strict JSON output demanded');

    const user = buildUserPrompt(input);
    assert.match(user, /沈茶蘼/, 'the candidate name rides verbatim');
    assert.match(user, /吊嗓子/, 'the user seed rides verbatim');
    assert.match(user, /武生/, 'the slot 行當 rides');
    assert.match(user, /班主嫌武戲太素/, 'the slot note rides');
});

test('parse clamps: whole accept passes; half-formed accept admits nobody; refuse needs no seed', () => {
    const whole = parseRecruitReply(
        JSON.stringify({
            accept: true,
            line: '進來吧，武戲缺你這樣的。',
            seed: {
                description: '身量不高，眉眼卻利落。',
                secret: '妹妹的事她從不與人說。',
                memories: ['十四歲那年在蘇州河邊學會了吊嗓子。', '妹妹走那夜落著雨。', '頭一回登台摔了個跟頭。', '多的一條該被剪去'],
                skills: [{ kind: '身段', style: '腰馬乾淨' }, { kind: '唱', style: '短促見骨' }, { kind: '多的', style: '剪去' }],
            },
        }),
    );
    assert.ok(whole && whole.accept, 'a whole accept parses');
    assert.equal(whole!.seed!.memories.length, 3, 'memories clamp to 3');
    assert.equal(whole!.seed!.skills.length, 2, 'skills clamp to 2');

    // Accept WITHOUT a whole seed → null (never mint a half-formed character).
    assert.equal(parseRecruitReply('{"accept": true, "line": "來吧"}'), null);
    assert.equal(parseRecruitReply('{"accept": true, "line": "來吧", "seed": {"description": "有形無憶", "secret": "…", "memories": []}}'), null);

    // A refusal carries only the 班主 line.
    const no = parseRecruitReply('{"accept": false, "line": "本班不收帶槍的。"}');
    assert.deepEqual(no, { accept: false, line: '本班不收帶槍的。' });

    // Garbage degrades safe.
    assert.equal(parseRecruitReply('抱歉，我不能……'), null);
    assert.equal(parseRecruitReply('{"accept": "yes"}'), null);
});

test('hasVerbatimAnchor: a preserved user sentence is found; wholesale paraphrase is not', () => {
    const seed = '十四歲那年在蘇州河邊學會了吊嗓子。她放不下早夭的妹妹。';
    assert.ok(
        hasVerbatimAnchor(seed, ['我十四歲那年在蘇州河邊學會了吊嗓子，師父就站在垛口。']),
        'a verbatim run inside a longer memory anchors',
    );
    assert.ok(
        hasVerbatimAnchor(seed, ['她放不下\n早夭的妹妹。']),
        'whitespace differences do not break the anchor',
    );
    assert.ok(
        !hasVerbatimAnchor(seed, ['我少時在河邊練嗓，妹妹早早去了。']),
        'a paraphrase anchors nothing',
    );
    assert.ok(!hasVerbatimAnchor('', ['任何記憶']), 'an empty seed anchors nothing');
});
