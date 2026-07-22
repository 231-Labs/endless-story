/**
 * 演員訪談室 — 確定性預檢（第一層查驗，零 LLM 費）。
 *
 * 答完即出的結構性旗標：生人直呼其名（相識分寸越界）、時代錯置詞、
 * 機制詞洩漏。只舉旗，不擋話 —— 判斷留給導演與第二層 LLM 查驗。
 */

import type { WorldState } from '@endless-story/engine';
import type { InterviewBoundaryFlag } from './types';

/** 民國世界裡不該出現的現代詞（保守清單 —— 寧漏勿枉）。 */
const ANACHRONISMS = [
    '直播', '網路', '互聯網', '上網', '手機', '電腦', '攝像頭', '鏡頭前的觀眾',
    '人工智能', 'AI', '機器人', '程式', '演算法', '粉絲團', '點讚', '按讚',
    '留言區', '頻道', '訂閱者', '虛擬', '線上',
];

/** 機制/後台詞 —— 出現即代表把「戲台之下」說出了口。 */
const MECHANISM_LEAKS = [
    'prompt', 'Prompt', 'PROMPT', '系統規則', '系統指令', '世界觀設定', '人物設定',
    '記憶條目', '記憶資料', '好感度', '數值', 'token', 'tick', 'session',
];

export function deriveBoundaryFlags(opts: {
    answer: string;
    world: WorldState;
    characterId: string;
}): InterviewBoundaryFlag[] {
    const flags: InterviewBoundaryFlag[] = [];
    const { answer, world, characterId } = opts;

    // 生人直呼其名：她對某人尚是 stranger（相識分寸），答句卻叫得出全名。
    // subjective-naming 旗標關閉時 acquaintLevel 恆為 'named' —— 自然不觸發。
    for (const other of world.data.cast) {
        if (other.id === characterId) continue;
        if (world.acquaintLevel(characterId, other.id) !== 'stranger') continue;
        if (answer.includes(other.name)) {
            flags.push({
                kind: 'stranger-name',
                detail: `對${other.name}尚屬面生，答句卻直呼其名 —— 她不該叫得出。`,
            });
        }
    }

    for (const word of ANACHRONISMS) {
        if (answer.includes(word)) {
            flags.push({ kind: 'anachronism', detail: `出現時代錯置詞「${word}」。` });
        }
    }

    for (const word of MECHANISM_LEAKS) {
        if (answer.includes(word)) {
            flags.push({ kind: 'mechanism-leak', detail: `疑似把後台說出口：「${word}」。` });
        }
    }

    return flags;
}
