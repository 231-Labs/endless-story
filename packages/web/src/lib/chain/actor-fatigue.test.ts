/**
 * actor-fatigue unit test — proves the rotation is a MECHANISM (acting → tired →
 * suppressed → recovered), the §2.51 monopoly breaks, and settlement inputs are
 * untouched (we only ever scale copies).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/chain/actor-fatigue.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ACTOR_FATIGUE,
    applyActorFatigue,
    bumpActorFatigue,
    decayActorFatigue,
    type FatigueLedger,
} from './actor-fatigue.ts';

const rows = (...t: Array<[string, number]>) =>
    t.map(([characterId, tension]) => ({ characterId, tension, statement: `s:${characterId}` }));

test('① 空帳本＝identity — 沒人累，張力原樣', () => {
    const input = rows(['bai', 0.72], ['zheng', 0.6]);
    const out = applyActorFatigue(input, {});
    assert.deepEqual(
        out.map((r) => r.tension),
        [0.72, 0.6],
    );
    assert.notEqual(out[0], input[0], '回傳新物件、輸入不動');
});

test('② §2.51 壟斷會破 — 剛演完的 0.72 地板被壓到 0.6 之下，換人上', () => {
    const ledger = bumpActorFatigue({}, ['bai']);
    const out = applyActorFatigue(rows(['bai', 0.72], ['zheng', 0.6]), ledger);
    const bai = out.find((r) => r.characterId === 'bai')!;
    const zheng = out.find((r) => r.characterId === 'zheng')!;
    assert.ok(bai.tension < zheng.tension, `演完一場的 0.72 (${bai.tension.toFixed(3)}) 要輸給歇著的 0.6`);
});

test('③ 是輪替不是放逐 — 歇幾拍就回來', () => {
    let ledger: FatigueLedger = bumpActorFatigue({}, ['bai']);
    const ticksToRecover = Math.ceil(ACTOR_FATIGUE.cost / ACTOR_FATIGUE.decay);
    for (let i = 0; i < ticksToRecover; i += 1) ledger = decayActorFatigue(ledger);
    assert.equal(ledger['bai'], undefined, '休息夠 → 條目清掉、完全復原');
    const out = applyActorFatigue(rows(['bai', 0.72]), ledger);
    assert.equal(out[0].tension, 0.72);
});

test('④ 疲勞有頂 — 連演不會把人壓到負值/永久沉底', () => {
    let ledger: FatigueLedger = {};
    for (let i = 0; i < 10; i += 1) ledger = bumpActorFatigue(ledger, ['bai']);
    assert.equal(ledger['bai'], ACTOR_FATIGUE.cap);
    const out = applyActorFatigue(rows(['bai', 1]), ledger);
    assert.ok(out[0].tension > 0, `cap 後仍有正張力 (${out[0].tension.toFixed(3)})`);
});

test('⑤ 只壓自己的行 — 同場其他人的張力不受牽連', () => {
    const ledger = bumpActorFatigue({}, ['bai']);
    const out = applyActorFatigue(rows(['bai', 0.5], ['liu', 0.5]), ledger);
    assert.equal(out.find((r) => r.characterId === 'liu')!.tension, 0.5);
});
