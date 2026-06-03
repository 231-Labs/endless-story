export type PromptLabCallId =
    | 'recruit.moderation'
    | 'recruit.character'
    | 'recruit.portraitCuration'
    | 'director.intent'
    | 'tick.plan'
    | 'tick.move'
    | 'tick.drama'
    | 'tick.social'
    | 'tick.act'
    | 'tick.pov'
    | 'tick.povRevision'
    | 'tick.sleepConsolidate'
    | 'tick.gazette'
    | 'memory.genesis'
    | 'dream.moderator'
    | 'reflection.character';

export type PromptLabExecutionMode = 'inspect' | 'run';
export type PromptLabKind = 'cheap' | 'primary' | 'deterministic';

export interface PromptLabCallDefinition {
    id: PromptLabCallId;
    phase: string;
    title: string;
    shortTitle: string;
    kind: PromptLabKind;
    summary: string;
    outputShape: string;
    defaultTemperature?: number;
    defaultInput: unknown;
    existingTool?: {
        label: string;
        href: string;
        note: string;
    };
}

export const PROMPT_LAB_CALLS: PromptLabCallDefinition[] = [
    {
        id: 'recruit.moderation',
        phase: 'RECRUIT',
        title: '抽卡描述審核',
        shortTitle: 'Moderate',
        kind: 'cheap',
        summary: '玩家角色描述進入說書人之前的安全審核。',
        outputShape: '{"verdict":"ok|not_ok","reason":"..."}',
        defaultTemperature: 0,
        existingTool: {
            label: 'User mint wizard',
            href: '/',
            note: '正式流程在首頁徵召票裡，Lab 只測 prompt + parser。',
        },
        defaultInput: {
            userPrompt:
                '我想扮演一位從南方戲班逃來的女小生，台上英氣，台下怕冷，總把一枚舊銅錢縫在袖口。',
            rulesText: '',
        },
    },
    {
        id: 'recruit.character',
        phase: 'RECRUIT',
        title: '抽卡角色候選',
        shortTitle: 'Candidate',
        kind: 'primary',
        summary: '把玩家描述、職缺意圖、鎖定數值寫成 1 位可 mint 的角色。',
        outputShape: '{"name":"...","description":"...","physicalFacts":{...}}',
        defaultTemperature: 0.7,
        existingTool: {
            label: 'User mint wizard',
            href: '/',
            note: '正式流程會先驗證 moderation signature；Lab 用 fixture 直接測敘事品質。',
        },
        defaultInput: {
            userPrompt:
                '她是外地來的女小生，嘴上不肯服輸，怕黑又怕冷。她想在春雪社站穩，卻不願說自己為何離開舊班。',
            recruitmentIntent:
                '春雪社需要一位能與花旦搭戲、又能在後台製造競爭張力的小生。此人不必強，但必須有執念。',
            castNames: ['孟雲屏', '顧驚鴻', '柳生春'],
            storyTags: ['民初梨園', '春雪', '暗潮', '班內競逐'],
            rolledValues: [
                { key: 'appearance', label: '外貌', value: 72 },
                { key: 'constitution', label: '筋骨', value: 38 },
                { key: 'acuity', label: '機敏', value: 84 },
                { key: 'disposition', label: '心性', value: 56 },
            ],
        },
    },
    {
        id: 'recruit.portraitCuration',
        phase: 'RECRUIT',
        title: '角色 Anchor 肖像 Prompt',
        shortTitle: 'Portrait',
        kind: 'cheap',
        summary: '把角色長描述壓成 image model 可用的素顏臉部 anchor prompt。',
        outputShape: 'plain text prompt, <= 160 chars',
        defaultTemperature: 0.6,
        existingTool: {
            label: '動態形象面板',
            href: '/admin/director',
            note: '實際出圖與 Walrus 上傳仍在 Portrait evolve / mint wizard。',
        },
        defaultInput: {
            character: {
                description:
                    '二十六歲女小生，身量偏瘦，眼神機敏，台上英氣凌厲，台下常把舊銅錢縫在袖口裡。',
                physical: { gender: '女', ageYears: 26, body: '瘦削' },
                attributes: [
                    { key: 'appearance', label: '外貌', value: 72 },
                    { key: 'constitution', label: '筋骨', value: 38 },
                    { key: 'acuity', label: '機敏', value: 84 },
                    { key: 'disposition', label: '心性', value: 56 },
                ],
            },
            toneHint:
                '水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。不要動漫感、不要油畫感、不要寫實照片。',
            recruitmentIntent: '女小生 / 梨園角色 anchor，保留素顏與長期 reference 一致性。',
        },
    },
    {
        id: 'director.intent',
        phase: 'DIRECTOR',
        title: '導演意圖轉 Capability',
        shortTitle: 'Director',
        kind: 'primary',
        summary: '班主一句話轉成結構化 capability call，不直接寫劇情。',
        outputShape: '{"rationale":"...","capabilities":[...]}',
        defaultTemperature: 0.4,
        existingTool: {
            label: '導演 Dry-run',
            href: '/admin/director',
            note: '既有面板可讀真實 saga snapshot 並 dispatch；Lab 用 fixture 做 prompt QA。',
        },
        defaultInput: {
            intent: '讓顧驚鴻和柳生春都想接近孟雲屏，但不要讓孟雲屏本人像被操控。',
            snapshot: {
                sagaId: '0xsaga',
                sagaName: '春雪社',
                departurePolicy: '班主准許方可離班',
                scenes: [
                    { id: '0xscene_backstage', name: '後台化妝間' },
                    { id: '0xscene_stage', name: '小戲台' },
                ],
                characters: [
                    { id: '0xmeng', name: '孟雲屏' },
                    { id: '0xgu', name: '顧驚鴻' },
                    { id: '0xliu', name: '柳生春' },
                ],
            },
        },
    },
    {
        id: 'tick.plan',
        phase: 'PLAN',
        title: '角色立志 / Standing Plan',
        shortTitle: 'Plan',
        kind: 'cheap',
        summary: '每輪先更新角色長期目標、眼下打算與未竟之事。',
        outputShape: '{"longTermGoal":"...","dailyPlanHint":"...","openSubgoals":[...]}',
        defaultTemperature: 0.8,
        existingTool: {
            label: '自治 tick',
            href: '/admin/director',
            note: 'Scheduler 裡的一鍵 tick 會跑真實 recall + remember；Lab 只看 prompt。',
        },
        defaultInput: {
            name: '顧驚鴻',
            role: '小生',
            sagaName: '春雪社',
            dayLabel: '第 3 日 · 入夜',
            recalledMemories: [
                '孟雲屏在台口收袖時沒有看我，卻把那句慢板唱得比昨日更輕。',
                '柳生春今日在後廊同箱管說笑，我聽見自己的名字被壓低。',
            ],
            currentPlan: '[長期目標] 在春雪社站住小生位\n[眼下打算] 先取得孟雲屏下一折搭戲的默許',
            recentSituation: '導演剛把下一折戲的搭檔位推到台前，班內目光都落在孟雲屏身上。',
            rosterContext: ['孟雲屏 / 花旦 / 小戲台', '柳生春 / 小生 / 後台化妝間'],
        },
    },
    {
        id: 'tick.move',
        phase: 'MOVE',
        title: '角色自主走位',
        shortTitle: 'Move',
        kind: 'cheap',
        summary: '不在事件中的角色決定留在原地或走向某個場景。',
        outputShape: '{"move":true,"targetSceneId":"...","reason":"..."}',
        defaultTemperature: 0.8,
        existingTool: {
            label: '自治 tick',
            href: '/admin/director',
            note: '真實移動會被 web action clamp 到可到達 scene。',
        },
        defaultInput: {
            name: '顧驚鴻',
            role: '小生',
            planHint: '[眼下打算] 先去台口看孟雲屏今日是否願意搭戲。',
            currentSceneName: '後台化妝間',
            options: [
                {
                    sceneId: '0xscene_stage',
                    name: '小戲台',
                    description: '燈還沒全熄，台口仍有人試唱。',
                    presentCharacters: [{ id: '0xmeng', name: '孟雲屏', role: '花旦' }],
                },
                {
                    sceneId: '0xscene_yard',
                    name: '後院',
                    description: '夜風重，箱管在收道具。',
                    presentCharacters: [],
                },
            ],
        },
    },
    {
        id: 'tick.drama',
        phase: 'DRAMA',
        title: 'Drama 張力推導',
        shortTitle: 'Drama',
        kind: 'deterministic',
        summary: '不是 LLM call。由鏈上稀缺資源與 ledger 推導角色張力，再注入 ACT / POV prompt。',
        outputShape: 'deterministic tension hints',
        existingTool: {
            label: '自治 tick',
            href: '/admin/director',
            note: 'Drama 目前應在 tick 結果裡看 top tension，不在 prompt lab 裡跑模型。',
        },
        defaultInput: {
            note: 'DRAMA has no prompt. Check tick-loop drama output and injected dramaHint instead.',
        },
    },
    {
        id: 'tick.social',
        phase: 'SOCIAL',
        title: '輕量社交觀察 / 對話',
        shortTitle: 'Social',
        kind: 'cheap',
        summary: '同場閒置角色做 observe / talk / idle，小動作可寫入記憶。',
        outputShape: '{"kind":"observe|talk|idle","targetCharacterId":"...","line":"..."}',
        defaultTemperature: 0.75,
        existingTool: {
            label: '自治 tick',
            href: '/admin/director',
            note: '正式流程會驗證 talk 目標同場，並寫 scene-lines / MemWal。',
        },
        defaultInput: {
            name: '柳生春',
            role: '小生',
            sceneName: '後台化妝間',
            planHint: '[眼下打算] 不讓顧驚鴻獨占孟雲屏的搭檔位。',
            recentMemories: ['我看見顧驚鴻在台口等得太久，那不是尋常等戲。'],
            relationshipHints: ['自己的人物印象：孟雲屏收袖時留三分距離，不易被人催逼。'],
            dramaHint: '搭檔位稀缺；孟雲屏的下一折戲成為眾人暗中爭奪之物。',
            othersInScene: [
                { id: '0xmeng', name: '孟雲屏', role: '花旦' },
                { id: '0xgu', name: '顧驚鴻', role: '小生' },
            ],
        },
    },
    {
        id: 'tick.act',
        phase: 'ACT',
        title: '事件中角色出牌',
        shortTitle: 'Act',
        kind: 'cheap',
        summary: '角色根據記憶、關係、plan、drama tension 從手牌中選一張。',
        outputShape: '{"catalogIndex":2,"intent":"...","reason":"..."}',
        defaultTemperature: 0.85,
        existingTool: {
            label: '事件面板 / 自治 tick',
            href: '/admin/director',
            note: 'EventPanel 可手動開事件；tick 會讓角色自己出牌。',
        },
        defaultInput: {
            name: '顧驚鴻',
            role: '小生',
            physicalFacts: '女，二十六歲，瘦削',
            sagaName: '春雪社',
            eventTitle: '台口試折',
            eventSummary: '孟雲屏下一折戲缺搭檔，顧驚鴻與柳生春都在場。',
            hand: [
                { catalogIndex: 0, label: '退讓', intent: 'WITNESS' },
                { catalogIndex: 1, label: '逼近', intent: 'ATTACK' },
                { catalogIndex: 2, label: '搭話', intent: 'SOCIAL' },
            ],
            recalledMemories: ['我曾在舊班因一句急話失了台口，此後最怕人說我搶戲。'],
            relationshipHints: ['自己的人物印象：孟雲屏厭人催迫，但會記得有分寸的人。'],
            rosterContext: ['孟雲屏 / 花旦 / 小戲台', '柳生春 / 小生 / 小戲台'],
            planHint: '[眼下打算] 讓孟雲屏知道我能接住她的戲。',
            dramaHint: '搭檔位稀缺；我沒有被點名，心中不甘。',
        },
    },
    {
        id: 'tick.pov',
        phase: 'POV',
        title: '角色 POV 章回',
        shortTitle: 'POV',
        kind: 'primary',
        summary: '把事件材料、記憶、關係、plan、drama tension 寫成第一人稱限定視角章回。',
        outputShape: '450-900 Chinese chars, 3-6 prose paragraphs',
        defaultTemperature: 0.72,
        existingTool: {
            label: '自治 tick / Dossier trigger',
            href: '/admin/director',
            note: '正式流程會讀鏈上角色 snapshot、subscriber gate、Walrus + commitment anchor。',
        },
        defaultInput: {
            character: {
                id: '0xgu',
                name: '顧驚鴻',
                role: '小生',
                gender: '女',
                ageYears: 26,
                sagaName: '春雪社',
                sceneName: '小戲台',
                physicalFacts: '瘦削 / 眼神機敏 / 怕冷',
                attributes: { appearance: 72, constitution: 38, acuity: 84, disposition: 56 },
            },
            triggerNarrative: '台口試折時，孟雲屏沒有明說選誰，只把下一句慢板留給兩位小生自己接。',
            recentMemorySnippets: [
                '我曾在舊班因一句急話失了台口，此後最怕人說我搶戲。',
                '孟雲屏收袖時留三分距離，不易被人催逼。',
            ],
            dreamFragment: '',
            relationshipHints: ['自己的人物印象：柳生春在旁邊說笑，像是不肯讓我獨占台口。'],
            rosterContext: ['孟雲屏 / 花旦 / 小戲台', '柳生春 / 小生 / 小戲台'],
            planHint: '[眼下打算] 接住孟雲屏留下的那句，不要顯得急。',
            dramaHint: '搭檔位稀缺；不甘要化成站位與一句話，不要喊出來。',
        },
    },
    {
        id: 'tick.povRevision',
        phase: 'POV',
        title: 'POV 安全修稿',
        shortTitle: 'Revision',
        kind: 'primary',
        summary: '當 POV 產生未被設定支持的重設定時，第二次 LLM 只做必要刪改。',
        outputShape: 'revised prose only',
        defaultTemperature: 0.25,
        existingTool: {
            label: 'POV worker internal',
            href: '/admin/director',
            note: '這是條件式 call；只有偵測到 unsupported motifs 時才會跑。',
        },
        defaultInput: {
            motifs: ['舊傷', '血跡', '棺材'],
            chapter:
                '我站在台口，膝蓋的舊傷忽然發痛。燈影一晃，像有人把棺材推到我面前，袖口也沾了血跡。我仍想接住孟雲屏那句慢板，卻怕自己又輸給柳生春。',
        },
    },
    {
        id: 'tick.sleepConsolidate',
        phase: 'SLEEP',
        title: '睡眠記憶沉澱',
        shortTitle: 'Sleep',
        kind: 'primary',
        summary: '把多條低密度觀察 / 章回片段壓縮成 1-2 條長期反思記憶。',
        outputShape: 'JSON string array',
        defaultTemperature: 0.8,
        existingTool: {
            label: '自治 tick',
            href: '/admin/director',
            note: '真實 sleep 會 recall scattered memories、remember dense reflections、再上鏈 reflection。',
        },
        defaultInput: {
            name: '顧驚鴻',
            role: '小生',
            sagaName: '春雪社',
            scattered: [
                '台口試折時我沒有搶孟雲屏的句子，只在她停下時才接上。',
                '柳生春在旁邊笑了一聲，我聽出那不是玩笑，是提醒我別太急。',
                '我想起舊班那回，正是急著證明自己，才把整折戲弄亂。',
            ],
        },
    },
    {
        id: 'tick.gazette',
        phase: 'GAZETTE',
        title: '每日公報編輯',
        shortTitle: 'Gazette',
        kind: 'cheap',
        summary: '將鏈上事件與 POV 章回摘要縫成公開公報；事實不由 LLM 發明。',
        outputShape: 'markdown gazette',
        defaultTemperature: 0.5,
        existingTool: {
            label: '公報面板',
            href: '/admin/director',
            note: '既有面板可從真實鏈上事件編公報並 anchor。',
        },
        defaultInput: {
            sagaName: '春雪社',
            day: 3,
            events: [
                {
                    kind: 'BudgetEventOpened',
                    summary: '小戲台開出「台口試折」，孟雲屏、顧驚鴻、柳生春在場。',
                    characterNames: ['孟雲屏', '顧驚鴻', '柳生春'],
                    timestampMs: '1717000000000',
                },
                {
                    kind: 'RelationshipSeeded',
                    summary: '導演公開牽起顧驚鴻與孟雲屏的搭戲張力。',
                    characterNames: ['顧驚鴻', '孟雲屏'],
                    timestampMs: '1717000001000',
                },
            ],
            chapters: [
                {
                    characterId: '0xgu',
                    characterName: '顧驚鴻',
                    blobId: 'blob-gu-pov',
                    excerpt: '袖口那枚舊銅錢貼著腕骨，我沒有立刻接孟雲屏留下的慢板。',
                    committedAtMs: '1717000002000',
                },
            ],
            treasuryEndless: 1200,
            characterCount: 3,
        },
    },
    {
        id: 'memory.genesis',
        phase: 'GENESIS',
        title: '角色初始記憶',
        shortTitle: 'Genesis',
        kind: 'primary',
        summary: '角色 mint 後，將描述蒸餾成第一人稱人生記憶與初見印象。',
        outputShape: '{"selfMemories":[...],"relationshipMemories":[...]}',
        defaultTemperature: 0.95,
        existingTool: {
            label: '初始記憶面板',
            href: '/admin/director',
            note: '正式面板會對舊角色補種；新角色 redeem 後自動 seed。',
        },
        defaultInput: {
            name: '顧驚鴻',
            role: '小生',
            gender: '女',
            ageYears: 26,
            sagaName: '春雪社',
            physicalFacts: '瘦削 / 怕冷 / 眼神機敏',
            description:
                '外地來的女小生，嘴上不服輸，台下怕黑又怕冷。她離開舊班後，把一枚舊銅錢縫在袖口裡。',
            recruitmentRoleIntent: '需要一位與花旦搭戲、又能與另一位小生形成競爭張力的角色。',
            roster: [
                {
                    id: '0xmeng',
                    name: '孟雲屏',
                    role: '花旦',
                    gender: '女',
                    ageYears: 28,
                    brief: '春雪社台柱，行事有分寸。',
                    currentSceneName: '小戲台',
                },
                {
                    id: '0xliu',
                    name: '柳生春',
                    role: '小生',
                    gender: '男',
                    ageYears: 25,
                    brief: '笑意輕，出手快。',
                    currentSceneName: '後台化妝間',
                },
            ],
            count: 5,
        },
    },
    {
        id: 'dream.moderator',
        phase: 'DREAM',
        title: '注夢審核與改寫',
        shortTitle: 'Dream',
        kind: 'cheap',
        summary: 'Owner 注入夢境前，審核世界觀 / OOC，並改寫成可入記憶的夢境片段。',
        outputShape: '{"status":"accepted|rejected","optimizedText":"...","importance":8}',
        defaultTemperature: 0.6,
        existingTool: {
            label: '注夢流程',
            href: '/admin/director',
            note: '價格與暫停在導演頁；正式提交由 owner wallet 簽 tx。',
        },
        defaultInput: {
            rawText: '她夢見一場雪落在空戲台上，台下只有一盞燈還亮著，燈後像站著舊班裡那個人。',
            characterName: '顧驚鴻',
            sagaName: '春雪社',
            eraHint: '民初上海戲園',
        },
    },
    {
        id: 'reflection.character',
        phase: 'REFLECTION',
        title: '角色反思獨白',
        shortTitle: 'Reflect',
        kind: 'primary',
        summary: 'active / passive 反思，寫角色私密內在，而非公開 POV 場面。',
        outputShape: '150-500 Chinese chars, prose only',
        defaultTemperature: 0.85,
        existingTool: {
            label: '反思面板',
            href: '/admin/director',
            note: '既有面板可 dry-run / anchor；Lab 用 fixture 比較 prompt 品質。',
        },
        defaultInput: {
            character: {
                id: '0xgu',
                name: '顧驚鴻',
                role: '小生',
                gender: '女',
                ageYears: 26,
                sagaName: '春雪社',
                physicalFacts: '瘦削 / 怕冷 / 眼神機敏',
                attributes: { appearance: 72, constitution: 38, acuity: 84, disposition: 56 },
            },
            mode: 'active',
            ownerQuestion: '你究竟是在爭搭檔，還是在怕自己又被丟下？',
            recentChapterSnippets: [
                '袖口那枚舊銅錢貼著腕骨，我沒有立刻接孟雲屏留下的慢板。',
            ],
            previousReflection: '我總說自己只是要站穩，其實最怕的是又被人從名冊上抹去。',
            recalledMemories: ['離開舊班那夜，門房把我的箱子放在雪地裡，沒有人多說一句。'],
        },
    },
];

export function getPromptLabCall(id: PromptLabCallId): PromptLabCallDefinition {
    const found = PROMPT_LAB_CALLS.find((call) => call.id === id);
    if (!found) {
        throw new Error(`unknown prompt lab call: ${id}`);
    }
    return found;
}

export function stringifyPromptLabInput(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
