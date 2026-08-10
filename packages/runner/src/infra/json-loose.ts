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

/**
 * 從模型的回話裡取出 JSON 物件。完整的優先；真的被剪斷才修復，並標記
 * `__truncated`。都不成立回 null（那是真的什麼都沒有，與「剪斷」不同事）。
 */
export function extractJsonLoose(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (blocks?.length) {
        for (let i = blocks.length - 1; i >= 0; i--) {
            try { return JSON.parse(blocks[i]) as Record<string, unknown>; } catch { /* 換更早的區塊 */ }
        }
    }
    const start = raw.indexOf('{');
    if (start < 0) return null;
    const repaired = repairTruncated(raw.slice(start));
    if (!repaired) return null;
    try {
        const parsed = JSON.parse(repaired) as Record<string, unknown>;
        return { ...parsed, [TRUNCATED_MARK]: true };
    } catch {
        return null;
    }
}

/** 這份結果是修復來的嗎（呼叫端據此記一行日誌）。 */
export function wasTruncated(parsed: Record<string, unknown> | null): boolean {
    return parsed?.[TRUNCATED_MARK] === true;
}
