/**
 * enactChain —— 世界的**單一演繹鏈**（server-only）。
 *
 * 大拍（`/api/tick`）與折子（`/api/wake` 的巡佇列）是同一個世界的兩種演繹，
 * 它們寫的是同一批東西：per-character session、角色記憶、檔案店（want-ledger、
 * wake-store）。所以任何時刻**至多一個演繹在寫**——折子撞上進行中的大拍就等它，
 * 大拍撞上進行中的折子亦然。這條鏈是那個「等」的實作。
 *
 * 原本是 `/api/tick` route 自己的 tickChain（process-wide tick mutex）：即使一拍
 * 的 HTTP 回應被 maxDuration 切斷、拍身仍在跑，下一個請求也只會在這裡等，不會
 * 兩份拍身重疊、把共用的 spine／registry／world-tick 寫壞。喚醒層接上來以後，
 * 這件事的範圍從「拍與拍」擴到「一切演繹之間」，故改名 enactChain。
 *
 * 一個行程一條鏈：這是行程內的紀律，不是分散式鎖——世界的寫者本來就只有一個。
 */

let enactChain: Promise<unknown> = Promise.resolve();

/**
 * 把一段演繹排進鏈尾，等前面的演繹（成或敗）都收了才動身。
 * 前一段失手不擋後一段：鏈只保證**不重疊**，不保證都成事。
 */
export function runOnEnactChain<T>(fn: () => Promise<T>): Promise<T> {
    const run = enactChain.then(fn, fn);
    enactChain = run.then(
        () => {},
        () => {},
    );
    return run;
}
