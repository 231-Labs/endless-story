// 破損 JSON 的修復解析 —— 座席回話的唯一收口。
//
// 真實事故：每個解析點各自寫著 `raw.match(/\{[\s\S]*\}/g)`，要看到收尾大括號才
// 算數。中文一字常吃一到兩個 token，輸出一被 max_tokens 剪斷整段就落空，而且是
// **靜靜**回傳空值：beat 落成「（沉默。）」、genesis 落成零執念（角色沒有心事就
// 無事可做，滿場 action noop，世界完全靜止）。實錄診斷檔：12 個角色 0 genesis、
// liveWants 0、全員 noop。
//
// 這裡釘死修復器的六種情形（完整／剪在字串中／剪在值之前／剪在物件中／沒有
// JSON／markdown 包裹；「剪在物件中」再拆成元素界線與欄位界線兩條），以及
// genesis 這條最痛的路徑：撿回完整的那幾件、丟掉殘缺的半件。
// Runs under `node --test`。
//
//   pnpm --filter @endless-story/runner test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRUNCATED_MARK, extractJsonLoose, wasTruncated } from '../src/infra/json-loose.ts';
import { parseGenesisWants } from '../src/services/character-agent/want-genesis-parse.ts';

/* ── extractJsonLoose：六種情形 ──────────────────────────────────────── */

test('完整的回話照原樣解析，不得誤標撈回', () => {
    const o = extractJsonLoose('{"beat":"點了點頭","inner":"再看看"}');
    assert.deepEqual(o, { beat: '點了點頭', inner: '再看看' });
    assert.equal(wasTruncated(o), false);
});

test('剪在字串中：說到一半的那個欄位整個丟掉，前面說完的留下', () => {
    // max_tokens 剪在半句話裡——話已經說完的欄位仍然算數。
    const o = extractJsonLoose(
        '{"beat":"她把水袖往右沉了半指","inner":"今夜坐滿，穩住才是正經","addressed":"蘇映',
    );
    assert.equal(o?.beat, '她把水袖往右沉了半指');
    assert.equal(o?.inner, '今夜坐滿，穩住才是正經');
    assert.equal(o?.addressed, undefined, '半句話不許進世界');
    assert.equal(wasTruncated(o), true);
});

test('剪在值之前：欄位名寫了、值還沒寫，該欄位不算數', () => {
    const o = extractJsonLoose('{"beat":"擱下茶盞","inner":');
    assert.equal(o?.beat, '擱下茶盞');
    assert.equal(o?.inner, undefined);
    assert.equal(wasTruncated(o), true);
});

test('剪在物件中：陣列裡寫完的元素撿回來，還沒寫成的那個丟掉', () => {
    // 修復是退回**最後一個寫完的欄位邊界**：第二件連第一個欄位都還沒收尾，
    // 整件不存在。
    const o = extractJsonLoose('{"wants":[{"layer":"愛","desc":"想聽她親口說一次"},{"layer":"班');
    const wants = o?.wants as Array<Record<string, unknown>>;
    assert.equal(wants.length, 1, '寧可少一件，不要一件半');
    assert.equal(wants[0].desc, '想聽她親口說一次');
    assert.equal(wasTruncated(o), true);
});

test('剪在物件中：寫完的欄位留著，剪在半途的那個欄位不留', () => {
    // 同一件裡也照這個界線走——layer 已經收尾所以算數，desc 剪在半句所以不算。
    // 呼叫端據此判斷這件夠不夠格（parseGenesisWants 就靠沒有 desc 把它剔掉）。
    const o = extractJsonLoose('{"wants":[{"layer":"虧欠","desc":"那年欠下的話，總');
    const wants = o?.wants as Array<Record<string, unknown>>;
    assert.equal(wants.length, 1);
    assert.equal(wants[0].layer, '虧欠');
    assert.equal(wants[0].desc, undefined, '半句話不許進世界');
    assert.equal(wasTruncated(o), true);
});

test('整段沒有 JSON：回 null（真的什麼都沒有，與被剪斷不是同一件事）', () => {
    assert.equal(extractJsonLoose('（我想不出來）'), null);
    assert.equal(wasTruncated(null), false);
});

test('markdown 包裹：圍欄裡的區塊照樣取得出來', () => {
    const o = extractJsonLoose('好的：\n```json\n{"resolved":true,"note":"她當眾撕了那張契"}\n```\n');
    assert.equal(o?.resolved, true);
    assert.equal(o?.note, '她當眾撕了那張契');
    assert.equal(wasTruncated(o), false);
});

test('撈回的記號是固定常數，呼叫端讀得到也刪得掉', () => {
    const o = extractJsonLoose('{"a":1,"b":');
    assert.equal(o?.[TRUNCATED_MARK], true);
});

/* ── genesis：最痛的那條路徑 ────────────────────────────────────────── */

test('被截斷的 genesis 回話：完整的那幾件撿得回來，殘缺的半件丟掉', () => {
    // 700 tokens 寫 3-5 件心事，每件都帶 layer/desc/target/weight/sat/resistance
    // ＋一句 why——舊解析在這裡一律回 []，於是「12 個角色 0 genesis」。
    const raw = [
        '{"wants":[',
        '{"layer":"愛","desc":"想聽她親口說一次","target":"蘇映雪","weight":0.9,"sat":0.3,"resistance":8,"why":"班規禁伶人私情，說破即失飯碗"},',
        '{"layer":"班務","desc":"把這季的戲撐住","weight":0.7,"sat":0.4,"resistance":4,"why":"班主已經催了兩回"},',
        '{"layer":"虧欠","desc":"那年欠下的話，總',
    ].join('');
    const wants = parseGenesisWants(raw, ['蘇映雪', '柳安春'], undefined, '金鳳');
    assert.equal(wants.length, 2, '寫完的兩件都要撿回來');
    assert.equal(wants[0].desc, '想聽她親口說一次');
    assert.equal(wants[0].target, '蘇映雪');
    assert.equal(wants[0].resistance, 8);
    assert.equal(wants[1].desc, '把這季的戲撐住');
    // 第三件只剩一個 layer——沒有 desc 就不是一件心事，剔掉。
    assert.ok(!wants.some((w) => w.layer === '虧欠'), '殘缺的半件不許進世界');
});

test('完整的 genesis 回話照舊全收，名冊外的 target 仍然擋掉', () => {
    const raw = '{"wants":[{"layer":"志","desc":"總有一天要挑大梁","target":"不在名冊的人","weight":0.8,"sat":0.2,"resistance":6,"why":"行當壓著"}]}';
    const wants = parseGenesisWants(raw, ['蘇映雪'], undefined, '金鳳');
    assert.equal(wants.length, 1);
    assert.equal(wants[0].target, undefined);
});

test('整段沒有 JSON 的 genesis 回話：空手，呼叫端據此喊出聲', () => {
    assert.deepEqual(parseGenesisWants('這個人心裡沒什麼特別的。', [], undefined, '金鳳'), []);
});
