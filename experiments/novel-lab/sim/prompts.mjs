/**
 * Prompt builders — the redesigned (prompt-B) method, with the three wiring
 * fixes baked into the material:
 *   1. structured cost (what the loser loses, re their plan)
 *   2. targeted private-ledger recall (the secret-derived memory at a beat)
 *   3. arcContext + chapter number injected into the writing prompt
 *
 * No-fabrication guardrails are ported from the real character-worker prompt.
 */

// ── 行當本色卡（預防層）：把性別/行當/道具規矩餵進 prompt，從源頭防硬傷 ──
const CRAFT_SHEETS = {
    坤生: '你是坤生（女小生）：女子扮演少年男子（書生、公子、年少將領）。你是女兒身，第三人稱敘述一律用「她」；台上扮男、戲文裡才是男角。常工許仙、書生、周瑜一類俊扮無鬚小生。【硬規矩】小生是俊扮，絕不掛髯口（鬍鬚）；不演老生戲（定軍山/烏盆記/捉放曹等）；不勾花臉。',
    乾生: '你是乾生（男小生）：男子演少年男子，俊扮。第三人稱用「他」。【硬規矩】小生俊扮，不掛髯口；不演老生戲；不勾花臉。',
    花旦: '你是花旦（女）：演年輕女子（小姐、丫鬟、白素貞一類）。第三人稱一律用「她」。【硬規矩】旦行不掛髯口、不勾花臉、不演男角。',
    青衣: '你是青衣（女）：演端莊女子。第三人稱用「她」。【硬規矩】旦行不掛髯口、不勾花臉、不演男角。',
    班主: '你是班主沈雪笙（女，前坤生名角），多在二樓不常登台。第三人稱用「她」。',
};
export function craftSheet(c) {
    return CRAFT_SHEETS[c.role] ?? `你的行當是「${c.role}」。敘述、道具、戲碼、第三人稱代詞都必須與此行當與你的性別（${c.gender}）相符。`;
}
// ── 改寫指令（修正層）：自檢抓到硬傷時，把違反項回灌，要求改寫 ──
export function correctionNote(violations) {
    return [
        '',
        '# ⚠️ 上一稿有以下硬傷，請在保留情節與好句的前提下改寫修正（只動錯處）：',
        ...violations.map((v) => `- ${v}`),
        '改寫後直接輸出修正版正文，不要解釋。',
    ].join('\n');
}

// ── POV chapter (single character, limited 3rd/1st person) ────────────────
export function povSystem() {
    return [
        '你是一位連載小說家，正在寫一本連載中的章回小說的其中一回。這一回不是獨立小品，它前承上一回、後啟下一回。',
        '讀者讀完要覺得「故事往前走了一步」，而不是「看了一段風景」。',
        '',
        '**這一回必須完成三件事（缺一不可）**：',
        '1. 承上：用一兩句勾連上一回留下的懸念（材料的【弧線座標】會告訴你上一回結在哪），讓老讀者立刻接上。',
        '2. 推進：材料有這樁事的【賭注】【轉折】【結算】【代價】。讓主角經歷這個轉折、做出或承受這個選擇、付出這個代價。一回讀完，這個角色或他的處境必須和開頭不一樣了。',
        '3. 啟下：結尾的鉤子要是這一回的後果催生的新問題，不是無關的小轉身。',
        '',
        '**限定視角 + 私帳**：**全程第一人稱「我」**，貼著主角（這是訂閱者付費鑽進此角色內心的內容，不要第三人稱旁觀）。材料的【私帳】是只有他知道的、他行為背後真正的 why。',
        '這一回要讓讀者透過他這次的選擇，瞥見這條 why 的一角（不必全揭，揭一角，留「原來如此」的餘味）。',
        '',
        '**不捏造鐵則**：賭注、轉折、結算、代價、客觀台詞、在場的人——只能用材料給的。',
        '不可改寫結果、不可發明死亡/血緣/重大新事實、不可身份漂移。【本場此刻】列出的他人動作是客觀事實，',
        '你可以寫如何看見、誤讀、回應，但不可寫成沒發生或換人做。但材料裡明確發生的轉折，你不但可以寫、必須寫。',
        '',
        '**質地**：民初梨園舊白話；情緒用動作與停頓承載，不用大詞（崩潰/撕裂/瘋狂/燃燒等）；對白只引材料給的台詞。',
        '600–1000 字，4–7 段。純散文，直接進正文，不要標題、不要「以下是」。',
    ].join('\n');
}

export function povUser(ctx) {
    const c = ctx.character;
    const lines = [
        '# 你的身份',
        `- 姓名：${c.name}　行當：${c.role}　性別：${c.gender}　年齡：${c.age}`,
        `- 外形：${c.physical}`,
        `- 屬性：外貌 ${c.appearance} · 筋骨 ${c.constitution} · 機敏 ${c.acuity} · 心性 ${c.disposition}`,
        '',
        '# 行當本色（硬規矩，違反即出戲）',
        craftSheet(c),
        '',
        '# 弧線座標（承上啟下用 — 來自 showrunner 的弧線計畫）',
        `- 本書：《${ctx.bookTitle}》（你的角色版連載）　你個人連載：第 ${ctx.chapterNo} 章`,
        `- 全書主問：${ctx.arc.throughline}`,
        `- 這條線上一回結在哪：${ctx.arc.lastBeat}`,
        `- 本回要推進：${ctx.arc.thisPush}`,
        '',
        '# 當下目標（你的 plan，讓場面有方向，不要直接宣告）',
        c.plan,
        '',
        '# 私帳（只有你知道的 why；這一回揭一角，不要全盤托出）',
        ctx.privateLedger,
    ];
    if (ctx.stakes) lines.push('', '# 賭注（這樁事爭的是什麼，對你意味著什麼）', ctx.stakes);
    if (ctx.turn) lines.push('', '# 轉折（已客觀發生，不可改寫）', ctx.turn);
    if (ctx.outcome) lines.push('', '# 結算（世界狀態真的變了）', ctx.outcome);
    if (ctx.cost) lines.push('', '# 代價（你得了什麼／失了什麼）', ctx.cost);
    if (ctx.relationshipHints?.length)
        lines.push('', '# 關係壓力（影響你看誰、避開誰、對誰說半句話）', ...ctx.relationshipHints.map((s) => `- ${s}`));
    if (ctx.sceneBeats?.length)
        lines.push('', '# 本場此刻（客觀事實 — 同場他人剛剛的舉動，只可詮釋不可改寫）', ...ctx.sceneBeats.map((s) => `- ${s}`));
    lines.push('', '請把上述材料寫成這一回的角色限定視角章回。直接輸出正文。');
    return lines.join('\n');
}

// ── POV chapter · 現況版 (prompt-A，忠實移植 character-worker 現行 prompt) ──
// 用於 --compare：同材料下，現況 prompt（為防捏造而壓制劇情）vs 重設計 prompt 的對照。
export function povSystemA() {
    return [
        '你是一位連載小說家，正在為「無盡故事」寫一小節角色 POV 章回。',
        'POV 的意思是：鏡頭、感官、誤解與判斷都綁在這個角色身上；它不是反思、不是日記、不是情緒摘要。',
        '',
        '**敘事鐵則**：',
        '1. 第一人稱限定視角。讀者只能知道此人看見、聽見、猜到、誤會到的事。',
        '2. 寫一個可拍的場面，不寫一份心情報告。每章至少要有：一個具體空間、一件可觸摸的小物、一個正在發生的外部動作。',
        '3. 公報已交代過大事 — 不要 recap。只取其中最能刺到此人的一瞬。',
        '4. 情緒要有節制。強烈情緒只能透過停頓、閃避、手上小動作露出來；避免大詞（崩潰/撕裂/瘋狂/燃燒/命運）。',
        '5. 不要濫用回憶。記憶片段只挑一條化成比喻或動作；不要寫成回憶錄。',
        '6. 對白只能引用客觀台詞，不可自創。',
        '7. 不得發明重大新事實：不可突然死亡、成親、揭露血緣、改寫事件結果。',
        '8. 身份不得漂移。9. 舞台中心不是管理權力。10. 身體缺陷與秘密物件要有來源。11. 同場客觀事實不可改寫。',
        '',
        '**聲音與質地**：民初梨園舊白話；角色扁平時寧可低調寫觀察、身段、職業習慣與眼前利害；',
        '結尾留一個未解的小鉤子或轉身，不要總結人生道理、不要「於是我明白了」。',
        '450–900 字，3–6 段。純散文，直接進正文。',
    ].join('\n');
}

export function povUserA(ctx) {
    const c = ctx.character;
    const lines = [
        '# 你的身份',
        `- 姓名：${c.name}　行當：${c.role}　性別：${c.gender}　年齡：${c.age}`,
        `- 外形：${c.physical}`,
        `- 屬性：外貌 ${c.appearance} · 筋骨 ${c.constitution} · 機敏 ${c.acuity} · 心性 ${c.disposition}`,
    ];
    if (ctx.recentMemorySnippets?.length)
        lines.push('', '## 可用記憶材料（只可取一兩個細節，化入場面）', ...ctx.recentMemorySnippets.map((m, i) => `${i + 1}. ${m}`));
    if (ctx.relationshipHints?.length)
        lines.push('', '## 同場名冊', ...ctx.relationshipHints.map((s) => `- ${s}`));
    lines.push('', '## 當下目標（讓場面有方向，不要直接宣告）', c.plan);
    if (ctx.dramaHint) lines.push('', '## 稀缺張力（讓它變成行動或視線）', ctx.dramaHint);
    if (ctx.sceneBeats?.length)
        lines.push('', '## 本場此刻（客觀事實，只可詮釋不可改寫）', ...ctx.sceneBeats.map((s) => `- ${s}`));
    lines.push('', '## 事件材料（這是背景，不是正文摘要）', ctx.triggerNarrative, '', '請把上述材料寫成一小節角色限定視角小說。不要寫反思；不要解釋你如何寫作；直接輸出正文。');
    return lines.join('\n');
}

// ── Sequel / aftermath chapter (quiet, non-competition) ───────────────────
export function sequelSystem() {
    return [
        '你是一位連載小說家，寫一回「餘波 / 溫情」章回——沒有競爭、沒有輸贏易手，但仍然必須讓某樣東西改變。',
        '',
        '**安靜的戲的鐵則**：這一回結束時，下面四項至少一項要和開頭不一樣（這就是它的結局）：',
        '親密度（更近/更遠）｜理解（誤讀或忽然看清）｜未說出口的事（變得可說，或從此不能說）｜一個私下的決定。',
        '',
        '手法：兩人（或一人）在做一件具體瑣事（繫水袖、對詞、收箱、吊嗓），真正的戲在動作底下走（潛台詞）。',
        '有人多冒半寸險（多伸的手、多留的一句、多看的一眼），對方接不接，就是這一回的轉折。',
        '',
        '私帳：材料的【私帳】這一回揭一角。承上啟下同 POV 規則。',
        '不捏造：客觀台詞只引材料給的；不發明重大新事實。',
        '視角：**全程第一人稱「我」**，限定主角（單角色章回一律第一人稱；第三人稱只留給多視角合本）。遵守材料的【行當本色】。',
        '質地：民初梨園舊白話，情緒克制。600–900 字，純散文直接進正文。',
    ].join('\n');
}

export function sequelUser(ctx) {
    const c = ctx.character;
    return [
        '# 你的身份',
        `- 姓名：${c.name}　行當：${c.role}　性別：${c.gender}　年齡：${c.age}`,
        `- 外形：${c.physical}`,
        '',
        '# 行當本色（硬規矩，違反即出戲）',
        craftSheet(c),
        '',
        '# 弧線座標',
        `- 本書：《${ctx.bookTitle}》（你的角色版連載）　你個人連載：第 ${ctx.chapterNo} 章`,
        `- 這條線上一回結在哪：${ctx.arc.lastBeat}`,
        `- 本回要移動：${ctx.deltaType}（${ctx.deltaNote}）`,
        '',
        '# 這場戲的具體瑣事 / 場合',
        ctx.occasion,
        '',
        '# 底下真正在進行的事（潛台詞，不要說破）',
        ctx.undercurrent,
        '',
        '# 私帳（揭一角）',
        ctx.privateLedger,
        ctx.relationshipHints?.length ? '\n# 關係壓力\n' + ctx.relationshipHints.map((s) => `- ${s}`).join('\n') : '',
        '',
        '請寫成一回安靜但不空的章回。直接輸出正文。',
    ].filter((s) => s !== '').join('\n');
}

// ── Ensemble cut (梨園版，weave multiple POVs of one event) ────────────────
export function cutSystem() {
    return [
        '你是章回體小說的編修者。把【同一樁事件】裡幾位角色各自的第一人稱 POV，織成一回多視角章回。',
        '',
        '鐵則：',
        '1. 只能用我給的素材（事件框架 + 各角色 POV 正文）。不可發明新事件、新人物、新身世。',
        '2. 不要把矛盾抹平成單一真相——同一刻各人理解不同，正是戲，並置它。客觀只在事件框架。',
        '3. 保留各人聲口。段落間自然切視角流轉，不要用「【某某視角】」標籤分段。',
        '4. **梨園版不揭私帳**：群像版回答「發生了什麼、各人如何不同」，把「為什麼」的私帳留給角色版——',
        '   結尾用一句把讀者引向角色各自的視角（CTA），不要替讀者揭穿任何人的內心秘密。',
        '5. 第一行是回目：`## 第 {N} 回　{七到十二字上聯}　{下聯}`，點出張力不劇透收場。',
        '   正文 4–6 段，約 600–900 字。純 markdown，從 `## ` 開始，不要 fence。',
    ].join('\n');
}

export function cutUser(ctx) {
    const head = [
        '# 事件框架（客觀事實，不可違背）',
        `- 本書：《${ctx.bookTitle}》　本回：第 ${ctx.chapterNo} 回`,
        `- 戲班：春雪社　第 ${ctx.day} 日　場景：${ctx.sceneName}`,
        `- 這樁事：${ctx.eventLabel}`,
        `- 在場：${ctx.povs.map((p) => `${p.name}（${p.role}）`).join('、')}`,
        `- 結算：${ctx.outcome}`,
    ];
    const blocks = ctx.povs.map((p, i) => `## 視角 ${i + 1}：${p.name}（${p.role}）\n${p.body.trim()}`).join('\n\n');
    return [head.join('\n'), '', '# 各角色 POV（原料，把它們織成一回）', blocks, '', '請輸出這一回的完整 markdown。'].join('\n');
}

// ── Cheap-tier decisions ──────────────────────────────────────────────────
export function cardSystem() {
    return [
        '你在一個自治戲班世界裡扮演一名角色，正捲入一樁稀缺資源的爭奪。',
        '規則：你**被發到一手牌**（不見得有強牌），只能從手上這幾張裡**選一張**打出——這就是你此刻的姿態。',
        '依你的人設、秘密、當下處境與關係，選「這個角色在這手牌裡真的會打」的那一張，不是抽象上最強的那張。',
        '（提示：若對手是你深愛或不忍傷的人，你也可能寧可打「讓」。）',
        '只輸出一個 JSON：{"card":"<你手牌中的一張>","why":"15字內動機"}。',
    ].join('\n');
}

export function cardUser(c, eventLabel, stakes, hand) {
    const handLines = hand.map((cd) => `- ${cd}：${CARD_GESTURE_TEXT[cd] ?? ''}`).join('\n');
    return [
        `# 你是 ${c.name}（${c.role}）`,
        `秘密：${c.secret}`,
        `當下打算：${c.plan}`,
        '',
        `# 這樁事：${eventLabel}`,
        `賭注：${stakes}`,
        '',
        '# 你這手牌（只能從這幾張選一張）',
        handLines,
        '',
        '你打哪張？只輸出 JSON（card 必須是上面手牌之一）。',
    ].join('\n');
}

// 牌面動作描述（給出牌 prompt 用；與 mechanism.CARD_GESTURE 同義，獨立一份避免循環依賴）。
const CARD_GESTURE_TEXT = {
    斬: '把話說死、半分餘地不留',
    攻: '正面進逼、要爭到手',
    守: '穩住不退、也不搶',
    誘: '不來硬的、用軟語身段拉攏',
    亮: '亮相奪目、用風采壓場',
    觀: '按兵不動、冷眼看破綻',
    讓: '退開一步、主動讓位',
};

// ── 班主介入（沈雪笙；NARRATIVE_AGENTS 經營層：不替角色演，只護制度與節奏）──
export function shenSystem() {
    return [
        '你是春雪社班主沈雪笙（女，前坤生名角），在二樓包廂審著全班。你不替任何角色決定怎麼演；',
        '你只在看見「一個人把全班的機會與情分都攬死、或一對好搭檔要被名利硬拆」時，出手護一護。',
        '你的手段是班主的裁奪與護持，不是寫戲。',
        '寫一小段你的第一人稱（300–500字）：你看見了什麼失衡、想起了什麼（你的私帳會給你），做了什麼裁奪。',
        '舊白話、克制；末了留一句未盡之意。直接輸出正文。',
    ].join('\n');
}
export function shenUser(c, situation, ledger) {
    return [
        `# 你是 ${c.name}（班主）`,
        `# 你眼下看見的失衡`,
        situation,
        '',
        '# 你的私帳（這一刻浮上心頭的舊事，揭一角）',
        ledger,
        '',
        '# 你這一手裁奪（已定，把它寫進場面，不要另編結果）',
        '你決意保下柳生春與蘇映雪這一對搭檔，不讓這場名利的爭奪把她們硬拆開；並讓那個把風頭攬死的人，這一輪先歇一歇。',
        '',
        '請寫你此刻在二樓的這一段。直接輸出正文。',
    ].join('\n');
}

// ── 感情戲（兩人 · 愛而不得 · 難以言喻）──
export function tenderSystem() {
    return [
        '你是一位連載小說家，寫一回「感情戲」——兩個人之間那份難以言喻、說不出口的情。',
        '這不是競爭、沒有輸贏。它要捕捉的是「愛而不得」：兩人都感覺到了那份遠超台上生旦、遠超師姐妹的情分，',
        '卻因身分、世道、與「一說破就再回不去」的恐懼，誰都不敢先點破。',
        '',
        '**鐵則**：',
        '1. 全程一件具體的瑣事（繫水袖、對詞、卸妝、分一盞茶），真正的情在動作底下走。',
        '2. 靠潛台詞、停頓、欲言又止、一個多停的眼神、一次該收回卻沒收回的手——不要直白告白。',
        '3. 這一回結束時，兩人之間「那層沒說破的東西」要有一個極輕微的移動：更近一寸、或更怕了一分、或第一次都意識到了卻又一起繞開。',
        '4. 限定主角視角，**全程第一人稱「我」**（這是讀者訂閱這個角色、要鑽進他心裡才付費的內容；不要寫成第三人稱旁觀）。私帳（材料給的）揭一角。對白只引材料給的，不可直接說「我愛你」這類點破的話。',
        '5. 行當/性別代詞依材料【行當本色】。舊白話、極克制。600–900字，純散文直接進正文。',
    ].join('\n');
}
export function tenderUser(ctx) {
    const c = ctx.character;
    return [
        '# 你的身份',
        `- 姓名：${c.name}　行當：${c.role}　性別：${c.gender}　年齡：${c.age}`,
        `- 外形：${c.physical}`,
        '',
        '# 行當本色（硬規矩，違反即出戲）',
        craftSheet(c),
        '',
        '# 對手（你心裡那個人）',
        `${ctx.other.name}（${ctx.other.role}）`,
        '',
        '# 這場戲的瑣事 / 場合',
        ctx.occasion,
        '',
        '# 底下真正在進行的事（潛台詞，絕不說破）',
        ctx.undercurrent,
        '',
        '# 私帳（你對她那份說不出口的情，揭一角）',
        ctx.privateLedger,
        '',
        '請把這一刻寫成一回感情戲。直接輸出正文。',
    ].join('\n');
}

export function planSystem() {
    return [
        '你在自治戲班世界裡扮演一名角色，剛經歷了一些事。請更新你的「打算」。',
        '依你的人設、秘密、剛發生的事，寫三行：[長期]…[眼下]…[未竟]…。',
        '要像這個角色真的會盤算的，不要喊口號。只輸出這三行，不要其他文字。',
    ].join('\n');
}

export function planUser(c, recent) {
    return [
        `# 你是 ${c.name}（${c.role}）`,
        `秘密：${c.secret}`,
        `先前的打算：${c.plan}`,
        '',
        '# 剛發生的事',
        recent || '（無特別的事）',
        '',
        '請更新你的打算（三行）。',
    ].join('\n');
}

export function showrunnerSystem() {
    return [
        '你是自治敘事世界的 Showrunner。你不替角色決定怎麼演，只維護「弧線計畫」：',
        '當前主題、進行中的張力線（各自進展）、已埋的伏筆、給寫手的「下一回該推進什麼」。',
        '讀最近發生的事，更新弧線。輸出 JSON：',
        '{"throughline":"全書主問一句","lines":[{"name":"張力線名","state":"目前進展","nextPush":"下一回該推進什麼"}],"foreshadow":["已埋伏筆…"]}',
    ].join('\n');
}

export function showrunnerUser(arcPlanJson, recentDigest) {
    return [
        '# 你上次留下的弧線計畫',
        arcPlanJson || '（尚無，請建立第一版）',
        '',
        '# 最近發生的事（舊→新）',
        recentDigest,
        '',
        '請輸出更新後的完整弧線計畫 JSON。',
    ].join('\n');
}
