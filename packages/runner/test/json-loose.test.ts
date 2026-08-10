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

/* ── 第二對大括號：跟剪斷無關，落空的樣子卻一模一樣 ────────────────── */

test('收尾補了一句含大括號的說明：答案照樣取得出來', () => {
    // 貪婪跨度會從第一個 `{` 吃到說明裡的最後一個 `}`，解不開；括號又是齊的，
    // 修復器當它「不是截斷」直接放手 → 整段靜靜落空，連截斷警告都不響。
    const o = extractJsonLoose(
        '```json\n{"wants":[{"layer":"妒","desc":"越想越恨，不知該恨誰"}]}\n```\n\n（格式為 {"wants":[...]}）',
    );
    const wants = o?.wants as Array<Record<string, unknown>>;
    assert.equal(wants.length, 1);
    assert.equal(wants[0].desc, '越想越恨，不知該恨誰');
    assert.equal(wasTruncated(o), false, '這不是截斷，別誤標');
});

test('開頭先示範空殼再給答案：取後面那份，不是示範那份', () => {
    const o = extractJsonLoose('格式如下：{"wants":[]}\n\n```json\n{"wants":[{"layer":"志","desc":"要唱自己的戲"}]}\n```');
    const wants = o?.wants as Array<Record<string, unknown>>;
    assert.equal(wants.length, 1, '示範的空殼不算答案');
    assert.equal(wants[0].desc, '要唱自己的戲');
});

test('先草稿後定稿：兩塊都完整時取最後一塊', () => {
    const o = extractJsonLoose('草稿：\n{"beat":"擱下茶盞"}\n\n定稿：\n{"beat":"把茶盞推了回去"}');
    assert.equal(o?.beat, '把茶盞推了回去');
});

test('字串裡的大括號不算一塊', () => {
    const o = extractJsonLoose('{"beat":"她說「格式是 {…}」","inner":"隨他去"}');
    assert.equal(o?.beat, '她說「格式是 {…}」');
    assert.equal(o?.inner, '隨他去');
});

test('散文裡先出現過括號，後面才被剪斷：修的是沒收尾的那一塊', () => {
    // 從第一個 `{` 起修，會把前面那段閒話一起當成 JSON。
    const o = extractJsonLoose('（照 {"wants":[]} 這個樣子）\n{"wants":[{"layer":"愛","desc":"想聽她親口說一次"},{"layer":"班');
    const wants = o?.wants as Array<Record<string, unknown>>;
    assert.equal(wants.length, 1);
    assert.equal(wants[0].desc, '想聽她親口說一次');
    assert.equal(wasTruncated(o), true);
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

test('genesis 回話收尾多補一句說明：五件心事一件都不能掉', () => {
    // 實錄 2026-08-10 春雪：十個角色九個長出心事，蘇映雪零件——回話開頭第一件
    // 明明寫得好好的，卻整批落空。
    const raw = [
        '```json\n{"wants":[',
        '{"layer":"妒","desc":"安春跟金鳳那些年夜裡到底怎樣","target":"柳安春","weight":0.9,"sat":0.1,"resistance":9,"why":"禁忌之情，說破就沒了班中位置"},',
        '{"layer":"志","desc":"總有一天要唱一齣自己的戲","weight":0.8,"sat":0.2,"resistance":7,"why":"名額有限，班主未必許"}',
        ']}\n```\n\n（以上依鐵則 3 推導，格式為 {"wants":[...]}）',
    ].join('');
    const wants = parseGenesisWants(raw, ['柳安春', '金鳳'], undefined, '蘇映雪');
    assert.equal(wants.length, 2);
    assert.equal(wants[0].target, '柳安春');
    assert.equal(wants[1].desc, '總有一天要唱一齣自己的戲');
});
