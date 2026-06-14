/**
 * 行當表（戲曲常識，跨製作通用——不綁任何一套卡司）。
 * 這是「引擎知識」：新增一個行當＝在此加一筆；新增一個角色＝只動 cast.mjs。
 * 自檢（mechanism.auditProse）與寫作 prompt（prompts.craftSheet）共用這張表，
 * 杜絕「規則寫死成這套卡司、換角就失靈」。
 *
 * 欄位：
 *   performer   是否登台演員（false＝班主/記者/衣箱等非演員）
 *   beard       本行當是否掛髯口/鬍鬚（false＝俊扮無鬚，正文出現鬍鬚即出戲）
 *   gender      行當綁定性別（'女'＝旦行只能女；省略＝不綁，看演員性別/反串）
 *   forbidKinds 不應工的戲碼類別（對照 PLAY_KINDS）
 *   line        是否有文/武細分（小生＝文小生/武小生）
 *   is          這個行當「是什麼」（一句，可入 prompt）
 *   rules       寫作禁限（給模型的守門規矩，**讀者看不到、角色不會把它掛嘴上**）
 */
export const CRAFTS = {
    小生: { performer: true, beard: false, forbidKinds: ['老生', '花臉'], line: true, is: '年輕男性角色（書生、公子、少年將）', rules: '俊扮無鬚、不掛髯口；不演老生戲；不勾花臉' },
    花旦: { performer: true, beard: false, gender: '女', forbidKinds: ['老生', '花臉', '男角'], is: '年輕女子（小姐、丫鬟、白素貞一類）', rules: '旦行不掛髯口、不勾花臉、不演男角' },
    青衣: { performer: true, beard: false, gender: '女', forbidKinds: ['老生', '花臉', '男角'], is: '端莊女子', rules: '旦行不掛髯口、不勾花臉、不演男角' },
    刀馬旦: { performer: true, beard: false, gender: '女', forbidKinds: ['老生', '花臉', '男角'], is: '旦行武戲，穿靠使槍、翻身亮相', rules: '不掛髯口、不勾花臉、不演男角' },
    武旦: { performer: true, beard: false, gender: '女', forbidKinds: ['老生', '花臉', '男角'], is: '旦行武打，重出手翻撲', rules: '不掛髯口、不勾花臉' },
    老旦: { performer: true, beard: false, gender: '女', is: '老年女性，本色蒼勁', rules: '旦行不掛髯口、不勾花臉' },
    老生: { performer: true, beard: true, is: '中老年男性，掛髯口（鬚）為本色' },
    武生: { performer: true, beard: false, is: '年輕武將/俠士，重靠把開打', rules: '俊扮無鬚' },
    淨: { performer: true, beard: true, facePaint: true, is: '花臉，勾臉譜、多掛滿髯，重工架炸音' },
    丑: { performer: true, beard: false, is: '插科打諢，抹豆腐塊小花臉', rules: '不掛滿髯' },
    班主: { performer: false, is: '戲班班主（經營層），多在後場/二樓，不常登台' },
    記者: { performer: false, is: '報館寫手/掮客，非戲班演員' },
    衣箱: { performer: false, is: '管行頭、水袖、靠旗、頭面——也管秘密；非登台演員' },
};
// 別名：坤生＝女演員的小生、乾生＝男演員的小生，同屬「小生」這一行當。
CRAFTS['坤生'] = CRAFTS['乾生'] = CRAFTS['小生'];

/** 戲碼 → 應工行當類別（戲曲常識，跨製作通用）。自檢用來查「某行當唱了不該唱的戲」。 */
export const PLAY_KINDS = {
    老生: ['定軍山', '烏盆記', '捉放曹', '碰碑', '搜孤救孤', '空城計', '轅門斬子', '文昭關', '斬經堂', '四郎探母', '武家坡', '大登殿', '二進宮', '洪羊洞', '失街亭', '戰太平', '李陵碑'],
    // 花臉/淨戲、武生戲…日後按需擴充
};
/** 鬍鬚相關詞（俊扮行當出現即出戲）。 */
export const BEARD_WORDS = ['髯口', '三髯', '黲髯', '白滿', '黑三', '掛髯', '鬍鬚', '鬍子', '鬍髭', '絡腮鬍', '髭', '鬚口'];

/** 取一個角色的行當定義（craft 優先，否則用 role；未知行當回空物件）。 */
export function craftDef(c) {
    if (!c) return {};
    return CRAFTS[c.craft] ?? CRAFTS[c.role] ?? {};
}
/** 演員性別反串的顯示標籤：女演小生＝坤生、男演旦＝乾旦（顯示用，非另一種行當）。 */
export function performerLabel(c) {
    const craft = c.craft ?? c.role;
    if (craft === '小生') return c.gender === '女' ? '坤生' : '乾生';
    if (/旦/.test(craft) && c.gender === '男') return '乾旦';
    return c.role ?? craft;
}
