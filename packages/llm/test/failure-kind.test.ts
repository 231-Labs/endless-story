/**
 * 失敗的種類 — what a caller can DO about an HTTP failure.
 *
 * A live season ended at
 *   [fatal] [poe] HTTP 402 on GLM-4.7-N: {"error": {"message": "You've used up
 *   your points! ...", "type": "insufficient_quota"}}
 * and that line answered none of the questions an operator actually has: is this
 * worth retrying, will the fallback model help, is the run damaged, what do I do.
 *
 * The load-bearing distinction is quota. It is the one failure where BOTH of the
 * engine's coping mechanisms are useless — retrying does not create points, and
 * every model in the fallback chain bills the same exhausted account — so the
 * classifier must never let it be mistaken for an overload.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyLLMFailure, isQuotaError, isRetryableError, LLMHttpError } from '../src/text/failure.ts';

const POE_QUOTA = '{"error": {"message": "You\'ve used up your points! Visit https://poe.com/api/keys to get more.", "type": "insufficient_quota", "code": "insufficient_quota"}}';

test('額度用盡 is recognised by status AND by body — providers disagree on which they send', () => {
    assert.equal(classifyLLMFailure(402, POE_QUOTA), 'quota');
    assert.equal(classifyLLMFailure(402, ''), 'quota', 'the bare status is enough');
    // Some providers return 429 for a spent balance rather than for rate limiting;
    // the body is the tiebreak, and it has to win — otherwise a spent account gets
    // retried three times and then walked down the whole fallback chain.
    assert.equal(classifyLLMFailure(429, '{"type":"insufficient_quota"}'), 'quota');
    assert.equal(classifyLLMFailure(429, 'rate limited, slow down'), 'transient');
});

test('the other kinds are separated by what they ask you to do', () => {
    assert.equal(classifyLLMFailure(401, ''), 'auth');
    assert.equal(classifyLLMFailure(403, ''), 'auth');
    assert.equal(classifyLLMFailure(404, 'bot not found'), 'unknown-model');
    for (const status of [429, 500, 502, 503, 504, 529]) {
        assert.equal(classifyLLMFailure(status, ''), 'transient', `HTTP ${status}`);
    }
});

test('quota is NOT retryable — retrying and falling back are equally useless', () => {
    const err = new LLMHttpError(402, 'poe', 'GLM-4.7-N', POE_QUOTA);
    assert.equal(err.kind, 'quota');
    assert.equal(isQuotaError(err), true);
    assert.equal(isRetryableError(err), false, '重試不會生出點數');
    // Every model on the chain bills the same account, so the chain is not a
    // second chance either — the caller has to stop, and it has to stop cleanly.
});

test('the message says what to do, not just what broke', () => {
    const quota = new LLMHttpError(402, 'poe', 'GLM-4.7-N', POE_QUOTA);
    assert.match(quota.message, /額度用盡/);
    assert.match(quota.message, /共用額度/, '「換個模型再試」是這裡最容易犯的錯，訊息要先堵掉');
    assert.match(quota.message, /GLM-4\.7-N/, 'and it still names the model + provider');
    assert.match(quota.message, /poe/);

    assert.match(new LLMHttpError(404, 'poe', 'GLM-9-XYZ', 'bot not found').message, /下架或改名/);
    assert.match(new LLMHttpError(401, 'poe', 'GLM-4.7-N', '').message, /API key/);
    // A plain overload keeps a bare message: there is nothing to advise beyond
    // what the engine already does automatically.
    assert.match(new LLMHttpError(503, 'poe', 'GLM-4.7-N', 'overloaded').message, /過載/);
});

test('a loose error object still classifies — not everything arrives as LLMHttpError', () => {
    assert.equal(isQuotaError({ status: 402 }), true);
    assert.equal(isQuotaError(new Error("You've used up your points!")), true);
    assert.equal(isQuotaError(new Error('insufficient_quota')), true);
    assert.equal(isQuotaError(new Error('fetch failed')), false);
    assert.equal(isQuotaError(undefined), false);
});
