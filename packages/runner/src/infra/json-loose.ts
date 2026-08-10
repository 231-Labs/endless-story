/**
 * 破損 JSON 的修復解析 —— 座席回話的唯一收口。
 *
 * 每個座席都要模型吐 JSON，而每個解析點原本各自寫著同一行
 * `raw.match(/\{[\s\S]*\}/g)`：**要看到收尾的大括號才算數**。於是輸出一被
 * `max_tokens` 剪斷，整段就落空——beat 落成「（沉默。）」、genesis 落成
 * 零執念（角色沒有心事就無事可做，滿場 `action noop`，世界看起來完全靜止）。
 * 中文一個字往往吃掉一到兩個 token，話說得長的角色天天踩在這條線上，於是
 * 「偶爾成功、多半空白」——看起來像模型爛，其實是我們把話剪了又不肯撿。
 *
 * 這裡把「撿回來」做成共用的一步：先照原樣試完整區塊，真的殘了就補上欠缺的
 * 引號與括號再解析一次，並丟掉最後那個殘缺的元素（寧可少一件，不要一件半）。
 * 修復過的結果會標記 `__truncated`，呼叫端要據此喊出聲——**修得回來不等於
 * 沒事**，連著出現就是該把 maxTokens 放寬了。
 *
 * 第二種落空跟剪斷無關，長得卻一模一樣：**回話裡多出第二對大括號**。取區塊的
 * 那行 `raw.match(/\{[\s\S]*\}/g)` 是貪婪的，永遠只吐一塊，從第一個 `{` 一路
 * 吃到最後一個 `}`。模型收尾補一句「（格式為 {"wants":[...]}）」、開頭先示範
 * 一個空殼、或先草稿後定稿，那一塊就橫跨兩段東西必定解不開；而括號是齊的，
 * 修復器又當它「不是截斷」直接放手，於是整段落空，連截斷警告都不會響。實錄：
 * 蘇映雪 genesis 零心事，回話開頭第一件心事明明寫得好好的。改成逐字掃出真正的
 * 頂層區塊（字串裡的括號不算數），由後往前試。
 *
 * **此檔不得新增任何 import。** 它是跨套件共用的葉：engine 的 core（含 barrel）
 * 靠 exports entry `@endless-story/runner/infra/json-loose` 直接吃它，而 engine
 * 的測試跑在光禿禿的 `node --test` 上——runner 其餘檔案慣用的 `.js` 指名在那裡
 * 解不到。多一個 import 就等於把整包 runner 拖進 engine 的模組圖，521 支測試會
 * 當場解析失敗。要共用什麼，複製進來，別 import 出去。
 */

/** 修復過的結果帶這個記號（非列舉欄位，呼叫端讀完即可刪）。 */
export const TRUNCATED_MARK = '__truncated';

interface Scan {
    /** 尚未閉合的括號（由內而外補回去就完整了）。 */
    closers: string[];
    /** 掃到結尾時還在字串裡——話被剪在半句。 */
    inString: boolean;
    /** 最後一個「元素邊界」逗號的位置；退回這裡就能把殘缺的半個元素整個丟掉。 */
    lastSafe: number;
}

function scan(text: string): Scan {
    const closers: string[] = [];
    let inString = false;
    let escaped = false;
    let lastSafe = -1;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{' || ch === '[') closers.push(ch === '{' ? '}' : ']');
        else if (ch === '}' || ch === ']') closers.pop();
        else if (ch === ',' && closers.length) lastSafe = i;
    }
    return { closers, inString, lastSafe };
}

interface Block {
    start: number;
    /** 收尾大括號的位置。null＝這一塊沒收尾，也就是被剪斷的那一塊（只會是最後一塊）。 */
    end: number | null;
}

/** 切出回話裡每一個頂層大括號區塊；字串裡的括號不算數（見檔頭第二種落空）。 */
function topLevelBlocks(raw: string): Block[] {
    const out: Block[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}' && depth > 0) {
            depth--;
            if (depth === 0) { out.push({ start, end: i }); start = -1; }
        }
    }
    if (depth > 0) out.push({ start, end: null });
    return out;
}

/** 補完被剪斷的 JSON：丟掉殘缺的那半個元素，再由內而外補上欠缺的括號。 */
function repairTruncated(fragment: string): string | null {
    const full = scan(fragment);
    if (!full.closers.length) return null; // 括號是齊的，不是截斷
    // 話被剪在半句，或值只寫了一半（`"desc":` 之後什麼都沒有）——整個元素不要，
    // 半句話進了世界比沒有更糟。
    const tail = fragment.replace(/[\s,]*$/, '');
    const dangling = full.inString || /[:,]\s*$|"[^"]*$/.test(tail);
    const body = dangling && full.lastSafe >= 0 ? fragment.slice(0, full.lastSafe) : tail;
    // 括號必須以**回滾後**的本文重算：拿全文那份會多補一層（丟掉的那半個元素
    // 自己開的括號早就不存在了）。
    const kept = scan(body);
    if (kept.inString || !kept.closers.length) return null;
    return body.replace(/[\s,]*$/, '') + kept.closers.reverse().join('');
}

function parseExact(text: string): Record<string, unknown> | null {
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * 修一塊沒收尾的區塊；修得成才標記。修不成、或修出一個空殼（回話收尾又起了個
 * 頭就斷了，撿到的只有一對括號）都回 null，好讓呼叫端退回更早那塊真的有東西的。
 */
function parseRepaired(fragment: string): Record<string, unknown> | null {
    const repaired = repairTruncated(fragment);
    if (!repaired) return null;
    const parsed = parseExact(repaired);
    if (!parsed || Object.keys(parsed).length === 0) return null;
    return { ...parsed, [TRUNCATED_MARK]: true };
}

/**
 * 從模型的回話裡取出 JSON 物件。由後往前取第一塊拿得出東西的；被剪斷的那塊
 * 修完會標記 `__truncated`。都不成立回 null（那是真的什麼都沒有，與「剪斷」
 * 不同事）。
 */
export function extractJsonLoose(raw: string): Record<string, unknown> | null {
    const blocks = topLevelBlocks(raw);
    // 由後往前，因為答案總在後面：模型先示範格式再給答案是常態，反過來不是。
    // 「收尾齊全的優先」不能拿來當順序，那會讓開頭的示範空殼贏過後面被剪斷的
    // 真答案（先示範再給答案、答案又剛好被剪斷，正是兩個病一起發作的樣子）。
    for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        const parsed =
            b.end === null ? parseRepaired(raw.slice(b.start)) : parseExact(raw.slice(b.start, b.end + 1));
        if (parsed) return parsed;
    }
    // 以下兩步是舊寫法的原樣保留，接住掃描器會看走眼的回話：散文裡出現落單的
    // 半形引號時，引號之後整段會被當成字串，真正的區塊就被漏掉了。
    const span = raw.match(/\{[\s\S]*\}/);
    if (span) {
        const parsed = parseExact(span[0]);
        if (parsed) return parsed;
    }
    const start = raw.indexOf('{');
    return start < 0 ? null : parseRepaired(raw.slice(start));
}

/** 這份結果是修復來的嗎（呼叫端據此記一行日誌）。 */
export function wasTruncated(parsed: Record<string, unknown> | null): boolean {
    return parsed?.[TRUNCATED_MARK] === true;
}
