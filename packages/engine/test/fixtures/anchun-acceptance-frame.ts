import type { SeasonFrame } from '../../src/preset.ts';

/** Deterministic economy-acceptance season frame (no JSON in public repo). */
export function buildAnchunAcceptanceFrame(): SeasonFrame {
  return {
  "id": "anchun-after-curtain",
  "title": "柳安春，下戲以後",
  "openingScene": "後台妝閣",
  "centralQuestion": "當全上海願意記住的只是柳安春台上的少年郎，她是否願意把下戲以後的自己，也交給唱片、銀幕與一紙獨家契約？",
  "incitingIncident": "末場散戲，華光影片社與申聲唱片行聯名闖進後台，開出一紙只等三日的獨家約：預付足夠春雪社續租、付清欠薪並排一齣新戲的款項，替柳安春灌第一張獨唱片、拍十二分鐘無聲短片，讓她成為全上海第一個同時登上戲單、唱片與銀幕的坤生。契約卻要求她一年內不得替別家留聲或拍片，宣傳必須刊出她半卸妝的後台肖像，並由她親筆填上唯一一位聯名搭檔。眾人尚未答話，隨行記者已把明日副刊校樣攤在妝台上：標題寫著『上海第一美少年，下戲原是女兒身』；照片不是定稿宣傳照，而是柳安春不知情時拍下的半卸妝側影。影片社聲稱照片來自照相館誤送、尚未付印，願意讓春雪社決定是否採用；報館只肯等到第三日夜班付梓前。",
  "deadline": "第三日子夜、報館夜班付梓與華光影片社收回預付款以前，春雪社必須決定是否簽約；若簽，柳安春須親筆確定肖像用法、唯一聯名搭檔與一年獨家條款；若不簽，報館仍會自行決定是否刊出這樁已被多人看見的邀約與照片爭議。",
  "stakes": [
    "簽下獨家約，春雪社能立刻續租、付薪並排新戲，柳安春也會得到前所未有的聲音與銀幕；但她一年內的公開形象、錄音檔期與部分演出選擇將受兩家公司約束。",
    "拒簽可以守住自主，卻不能讓已存在的照片、校樣與傳聞從世界上消失；戲班也會失去足以渡過眼前難關的預付款。",
    "契約只有一個聯名搭檔位置。填上任何人的名字、留白、要求刪除或另造條款，都會真實改變名聲、收入、台上組合與人物關係，不能人人同時得到同一個位置。",
    "半卸妝肖像可以授權、重拍、扣留、公開抗議或嘗試銷毀，但角色無法同時利用它成名又宣稱它從未存在；底片、校樣與口頭見證各是不同的物證。",
    "『上海第一美少年原是女兒身』可能替柳安春打開新時代，也可能把她多年小生功夫縮成獵奇標題；如何解釋這張臉，不能只由旁白替她決定。"
  ],
  "publicFacts": [
    "獨家約、預付款用途、一年期限、唯一聯名搭檔欄與三日截止都白紙黑字寫在契約上，現場角色都能查驗。",
    "校樣上的照片確實是柳安春半卸妝時的側影，她事前沒有同意拍攝；拍攝者、底片如何流出與是否另有複本仍未查明。",
    "記者帶來的是尚未付印的校樣，不是已發行的報紙；『全上海已經看見』目前只是恐嚇或推測，不是正史。",
    "影片社聲稱願讓春雪社決定是否採用照片，但這只是公開承諾，尚未寫入契約。",
    "申聲唱片行已帶來一段柳安春當晚謝幕聲的蠟筒試錄，證明技術上能留聲；誰授權錄下謝幕聲，仍有爭議。",
    "沒有任何公開事實能證明柳安春應該選誰做搭檔、應該如何理解自己的小生身份，或最後一定簽約或拒簽。"
  ],
  "initialObjects": [
    {
      "id": "anchun-exclusive-contract",
      "label": "柳安春三日獨家契約",
      "aliases": [
        "獨家約",
        "契約",
        "合約",
        "華光約書"
      ],
      "scene": "後台妝閣",
      "state": "尚未簽署；肖像授權、一年獨家與唯一聯名搭檔欄仍待處理"
    },
    {
      "id": "backstage-photo-proof",
      "label": "半卸妝肖像副刊校樣",
      "aliases": [
        "校樣",
        "照片",
        "肖像",
        "副刊樣張"
      ],
      "scene": "後台妝閣",
      "state": "尚未付印；標題為『上海第一美少年，下戲原是女兒身』"
    },
    {
      "id": "glass-negative-envelope",
      "label": "標作柳安春的玻璃底片封套",
      "aliases": [
        "底片封套",
        "玻璃底片",
        "封套"
      ],
      "scene": "報館茶室",
      "state": "封套在報館，內有幾張底片、是否包含原始肖像尚未查驗"
    },
    {
      "id": "curtain-call-wax-cylinder",
      "label": "柳安春謝幕聲蠟筒",
      "aliases": [
        "蠟筒",
        "試錄",
        "謝幕聲",
        "留聲蠟筒"
      ],
      "scene": "後台妝閣",
      "state": "可播放；錄有當晚彩聲與柳安春一句謝幕"
    },
    {
      "id": "advance-payment-envelope",
      "label": "華光影片社預付款信封",
      "aliases": [
        "預付款",
        "訂金",
        "款項",
        "信封"
      ],
      "scene": "後台妝閣",
      "state": "封口完整；只有契約成立後才能入帳"
    },
    {
      "id": "stopped-watch",
      "label": "停在十一點四十七分的懷錶",
      "aliases": [
        "懷錶",
        "老錶",
        "錶鏈",
        "鏈扣",
        "停了的懷錶"
      ],
      "scene": "沈宅小樓",
      "visibility": "hidden",
      "container": "二樓抽屜深處",
      "state": "停在十一點四十七分；與白蘭離開那夜相連",
      "knownByNames": [
        "沈雪笙",
        "唐桂蘭"
      ]
    },
    {
      "id": "worn-huqin",
      "label": "斷弦的舊胡琴",
      "aliases": [
        "舊胡琴",
        "胡琴"
      ],
      "scene": "雲錦台戲台",
      "portable": true,
      "state": "斷了一根弦，勉強拉得響、上不得台面"
    },
    {
      "id": "wanxiangyu-pot",
      "label": "金鳳窗台那盆養了多年的晚香玉",
      "aliases": [
        "晚香玉",
        "花盆"
      ],
      "scene": "金鳳寓所",
      "portable": true,
      "state": "養得極好，夜裡開得正盛"
    }
  ],
  "scheduledEvents": [
    {
      "id": "deadline-last-hour",
      "atTick": 17,
      "clock": "第三日深宵·最後一個時辰",
      "scene": "戲園前街",
      "visibility": "public",
      "text": "上海各處的鐘先後敲過十一點。申報館夜班來了最後一通催稿電話：副刊版面只再保留一個時辰；華光影片社的代表也已到戲園前街，子夜鐘響時便按契約現狀收卷——有署名便照字生效，沒有署名便視為拒簽，預付款不得入帳。這不是替任何人作決定，只是世界的鐘不再停。"
    }
  ],
  "contestedResources": [
    {
      "label": "contract:唯一聯名搭檔",
      "statement": "契約正面只有一個聯名位置；它同時代表片酬、宣傳、台上組合與柳安春願意公開承認的合作關係。"
    },
    {
      "label": "image-rights:柳安春台上與台下的肖像解釋權",
      "statement": "照片本身是物證，但『美少年』『女兒身』『新女性』或『真正的柳安春』都是不同角色與機構可能爭奪的詮釋。"
    },
    {
      "label": "recording:柳安春第一段正式留聲",
      "statement": "誰製作、誰擁有、誰同唱以及能否重錄，會決定這段聲音日後如何被複製與記住。"
    }
  ],
  "economy": {
    "unitLabel": "圓",
    "subunitsPerUnit": 100,
    "noticeScene": "後台妝閣",
    "market": {
      "id": "market",
      "label": "上海市面"
    },
    "troupe": {
      "id": "troupe",
      "label": "春雪社班庫",
      "openingYuan": 42,
      "dailyFixedCostYuan": 10,
      "authorizedSpenderNames": [
        "沈雪笙"
      ],
      "costNote": "電燈、捐稅與雜支",
      "shortfallCreditor": "錢莊先生與房東"
    },
    "businesses": [
      {
        "id": "huaguang",
        "label": "華光影片社",
        "openingYuan": 400,
        "stance": "肖像與獨家期是華光的命根，半步不讓；小錢加碼倒撥得動——片酬多添幾個，只要不動一年獨家與那張肖像的用法。回話留三分餘地，話別說死。"
      },
      {
        "id": "shensheng",
        "label": "申聲唱片行",
        "openingYuan": 260,
        "dailyFixedCostYuan": 6,
        "costNote": "壓片工錢、行棧租與電費"
      },
      {
        "id": "shenbao",
        "label": "申報館",
        "openingYuan": 180,
        "dailyFixedCostYuan": 5,
        "costNote": "紙墨、排字工與館舍開銷",
        "wages": [
          { "name": "方競西", "amountYuan": 3 }
        ]
      },
      {
        "id": "changsan",
        "label": "長三堂子",
        "openingYuan": 320,
        "dailyFixedCostYuan": 8,
        "costNote": "堂子門面、琴師與粉頭月例",
        "shortfallCreditor": "堂子的老鴇",
        "wages": [
          { "name": "金鳳", "amountYuan": 6 }
        ]
      }
    ],
    "characterDefaults": {
      "openingYuan": 6,
      "dailyFixedCostYuan": 3
    },
    "characters": [
      {
        "name": "柳安春",
        "openingYuan": 12,
        "dailyFixedCostYuan": 3
      },
      {
        "name": "沈雪笙",
        "openingYuan": 8,
        "dailyFixedCostYuan": 3
      },
      {
        "name": "蘇映雪",
        "openingYuan": 20,
        "dailyFixedCostYuan": 3
      },
      {
        "name": "金鳳",
        "openingYuan": 15,
        "dailyFixedCostYuan": 3
      },
      {
        "name": "方競西",
        "openingYuan": 10,
        "dailyFixedCostYuan": 3
      },
      {
        "name": "白韻秋",
        "openingYuan": 80,
        "dailyFixedCostYuan": 5
      }
    ],
    "wages": [
      {
        "name": "柳安春",
        "amountYuan": 2
      },
      {
        "name": "蘇映雪",
        "amountYuan": 2
      },
      {
        "name": "連翹",
        "amountYuan": 1
      },
      {
        "name": "何阿喜",
        "amountYuan": 1
      },
      {
        "name": "江聞鶴",
        "amountYuan": 1
      },
      {
        "name": "唐桂蘭",
        "amountYuan": 1
      }
    ],
    "catalog": [
      {
        "id": "meal-front-street",
        "label": "前街一餐熱湯麵",
        "priceYuan": 3,
        "kind": "meal",
        "effect": {
          "kind": "relieve-hunger"
        },
        "oncePerDay": true
      },
      {
        "id": "repair-huqin",
        "label": "請琴師換弦修整舊胡琴",
        "priceYuan": 8,
        "kind": "repair",
        "sceneName": "雲錦台戲台",
        "effect": {
          "kind": "object-state",
          "objectId": "worn-huqin",
          "state": "換上新弦、修整如初，可上台伴奏"
        },
        "unique": true
      },
      {
        "id": "new-costume",
        "label": "添置一身簇新小生行頭",
        "priceYuan": 20,
        "kind": "costume",
        "effect": {
          "kind": "spawn-object",
          "objectId": "new-xiaosheng-costume",
          "label": "簇新的小生行頭",
          "sceneName": "衣箱房",
          "state": "簇新可上身",
          "aliases": [
            "新行頭",
            "新戲服"
          ]
        },
        "unique": true
      },
      {
        "id": "stage-new-play",
        "label": "注資開排一齣新戲",
        "priceYuan": 60,
        "kind": "production",
        "effect": {
          "kind": "spawn-object",
          "objectId": "new-play-fund",
          "label": "新戲《回雪》排演箱案",
          "sceneName": "雲錦台戲台",
          "state": "已注資，箱案齊備，隨時可開排",
          "aliases": [
            "新戲箱案",
            "排演箱案"
          ]
        },
        "unique": true
      },
      {
        "id": "sponsor-jinfeng-move",
        "label": "替金鳳出資賃下戲班後進的淨房（搬不搬離會樂里，由她自己）",
        "priceYuan": 25,
        "kind": "housing",
        "effect": {
          "kind": "tenancy",
          "sceneName": "後進廂房",
          "characterName": "金鳳",
          "keyObjectId": "jinfeng-room-lease",
          "keyLabel": "後進淨房的租契與鑰匙"
        },
        "unique": true
      }
    ],
    "contracts": [
      {
        "id": "anchun-exclusive",
        "label": "柳安春三日獨家契約",
        "objectId": "anchun-exclusive-contract",
        "proposer": "huaguang",
        "totalYuan": 270,
        "splits": [
          {
            "to": "柳安春",
            "amountYuan": 80,
            "memo": "柳安春獨唱片與短片片酬"
          },
          {
            "to": "@partner",
            "amountYuan": 50,
            "memo": "唯一聯名搭檔片酬"
          },
          {
            "to": "班庫",
            "amountYuan": 140,
            "memo": "春雪社續租、清欠薪與新戲之資"
          }
        ],
        "requiredSignerNames": [
          "柳安春"
        ],
        "partnerRequired": true,
        "deadlineDay": 3,
        "terms": [
          "一年內不得替別家留聲或拍片",
          "宣傳刊出半卸妝後台肖像",
          "親筆填上唯一聯名搭檔"
        ],
        "negotiation": {
          "acceptDemandsMatching": ["肖像", "校樣", "定妝照"],
          "graceDaysOnAccept": 1,
          "refusalNote": "華光影片社回話：價與期都不改，第三日夜裡為限。"
        },
      }
    ],
    "bills": [
      {
        "id": "qianzhuang-due",
        "label": "錢莊月息與屋租",
        "amountYuan": 24,
        "dueDay": 3,
        "creditor": "錢莊先生與房東"
      }
    ]
  },
  "occupationDuties": {
    "歌女": [
      { "part": "入夜", "sceneName": "長三堂子花廳", "duty": true, "note": "唱堂會、接局" }
    ],
    "記者": [
      { "part": "深宵", "sceneName": "報館茶室", "duty": true, "note": "趕稿、盯付梓" }
    ],
    "班主": [
      { "part": "日午", "sceneName": "後台妝閣", "duty": true, "note": "坐鎮、理事、發落排戲" },
      { "part": "晡時", "sceneName": "後台妝閣", "duty": true }
    ]
  }
} as SeasonFrame;
}
