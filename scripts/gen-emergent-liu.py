#!/usr/bin/env python3
"""
柳安春 · 記事不記論 —— an emergent-self-model variant that changes ONE character's
seed only. Canon spring-snow writes 柳's VERDICT into her `secret` and her two
relationship_views ("金鳳才是真的，師姐那是夢不是日子"), so who she "chooses" is
decided before a single beat plays. This variant STRIPS the verdict and leaves only
EVENTS + present MANNER + an honestly-unresolved conclusion, so the nightly
`consolidateSelfModel` pass (runs under relationshipFallback, already always used)
builds her view of each woman FROM WHAT ACTUALLY HAPPENS in the run — the conclusion
becomes a function of the run, not of the seed.

Also enriches 柳's persona per art-direction (she was reading flat): 風流瀟灑 sharpened,
邪媚 toward 金鳳 / 反差聽話 toward 蘇映雪 made explicit, an ARTIST-FIRST core (she cares
about the craft above romance), and plain kindness.

ONLY 柳's block changes. 金鳳/蘇映雪 (their blocks AND their views of 柳) stay canon as
the control. Everything else — scenes, other cast, rules — is byte-identical to canon.

Emits:
  packages/cli/scripts/stories/spring-snow-emergent-liu.json
Run it in a real-work season (spring-snow-market) so the love-triangle competes with
her craft/livelihood for tick-time — that is where "who wins" becomes genuinely open.
"""
import json, copy, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "packages/cli/scripts/stories/spring-snow.json"
STORIES = ROOT / "packages/cli/scripts/stories"

# ── 柳's enriched persona (always-shown). 風流瀟灑 + 邪媚/聽話 contrast + ARTIST-FIRST
#    + kindness. Physical description kept verbatim from canon. ────────────────────
DESCRIPTION = (
    "春雪社當紅小生（坤生，女兒身扮小生）。生得清俊中性、骨相秀致：眉目英朗清潤、鼻樑秀挺、"
    "下頷柔和、頸線纖細，一眼看得出是女子，卻自有一段瀟灑英氣——如越劇小生陳麗君般清儒雅致的"
    "女兒身扮相，英氣只在眉眼神采、不在骨架。台上一柄摺扇便撩動滿堂春水，台下是霞飛路出了名的"
    "風流人物：瀟灑不羈、笑意鬆鬆，撩人於無形又像從不上心。可她心裡最認的其實不是這些兒女情長"
    "——是戲：一句腔、一個身段、一道水袖，半分不肯將就，寧可少睡也要把一折戲磨到自己認可。"
    "她為人極軟極善，見不得人真受苦，落難的同行常不聲不響替人補上戲份錢，虧了自己也不聲張。"
    "她待兩個舊人各是一副面孔：對金鳳，她邪媚裡裹著真溫柔，逗她撩她卻也真心疼她，兩個人你來"
    "我往、針尖對麥芒，越鬥越是棋逢敵手；獨獨對師姐蘇映雪，是打小就養成的聽話與體貼——師姐皺"
    "一下眉她就收手，散了戲替她拎包、擋酒、記著她的冷暖，送到家門口才肯走。人前她總是一身滿不"
    "在乎的漂亮，笑得像什麼都不往心裡去。"
)

# ── 柳's inner secret (always-shown) with the VERDICT REMOVED. Keeps the events and
#    the genuinely-unresolved tension; elevates the art-over-love core as her deepest
#    truth. No "金鳳才是真的 / 師姐那是夢不是日子" — that is hers to conclude. ──────────
SECRET = (
    "外人都當她風流無心，只她自己知道，這兩個女人她一個都沒真放下——也一直沒敢認清，哪個對自己"
    "到底算什麼。師姐是十七歲的初夜、十年沒醒的一縷念想，那一夜給了她身子的頭一遭，天一亮師姐卻"
    "轉了臉；金鳳是她垮掉時把她拽進屋、一樣樣教會她這身子門道的人，那幾年他們日日廝守。到底哪一個"
    "才是她的真心、哪一個只是舊夢，她自己也分不清、更不敢分——她只清楚是她自己先鬆的手，紅了以後"
    "把金鳳從『那個人』過成了『其中一個』，繞著會樂里走，欠著一句沒說出口的交代；也躲著師姐那雙"
    "曾經天亮就轉開的眼。她心裡那根真正的刺其實不在情上——師父臨終那句『戲比天大』她嘴上沒懂，"
    "身子卻早信了：她怕的從不是沒人愛，是哪天上海發現她其實不夠好。兒女情長於她像水袖一甩就散，"
    "唯獨這方台子，她半分不敢輕慢。"
)

# ── 柳's two relationship views: EVENTS + MANNER, tentative conclusion. No verdict. ──
VIEW_TO_JIN = (
    "金鳳是我垮掉那年把我拽進會樂里、頭一個接住我的人。那幾年我日日宿在她屋裡，這身子的門道是她"
    "一樣樣教會的——跟她在一處我最放得開，邪媚裡裹著真心疼她；她也不是好惹的，一張利嘴針尖對麥芒，"
    "我逗她一句她還我三句，越鬥越覺著棋逢敵手，這樣的來回我竟是歡喜的。紅了以後我戲約多、人也飄了，"
    "親手把她從天天見過成隔三差五，如今繞著那條弄堂走。我欠她一句沒說出口的交代。至於那幾年算不算"
    "我的真心、還是只是垮時抓的一根浮木——我自己也還沒認。"
)
VIEW_TO_SU = (
    "師姐是我十七歲頭一回同台唱《驚夢》就越了線的人，我的初夜給了她；可打從進科班起我就一直跟在她"
    "身後，對她的聽話與體貼是打小養成的——一身風流到她這半條街全收了，她皺一下眉我就收手，記著她"
    "的冷暖、替她拎包擋酒。那一夜天亮她卻轉了臉，沒幾日當著我交了旁人。除夕空台她說第三道水袖只唱"
    "給我，我當了真，這些年場場盯著那道袖。她到底是我放不下的真人，還是我十年沒醒的一場舊夢——"
    "我供著她，卻也不敢碰、不敢認。"
)


def main():
    src = json.loads(SRC.read_text(encoding="utf-8"))
    out = copy.deepcopy(src)
    out["id"] = "spring-snow-emergent-liu"
    out["label"] = "柳安春 · 記事不記論（讓她自己認）"

    # Swap ONLY 柳's founding_cast block fields (description + secret); keep everything
    # else about her — skills, memories, attributes, scenes — verbatim.
    liu = next(c for c in out["founding_cast"] if c["name"] == "柳安春")
    liu["description"] = DESCRIPTION
    liu["secret"] = SECRET

    # Swap ONLY 柳's two outgoing views. 金→柳 and 蘇→柳 stay canon (the control).
    for v in out.get("relationship_views", []):
        if v["from"] == "柳安春" and v["to"] == "金鳳":
            v["view"] = VIEW_TO_JIN
        elif v["from"] == "柳安春" and v["to"] == "蘇映雪":
            v["view"] = VIEW_TO_SU

    path = STORIES / "spring-snow-emergent-liu.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT))

    # Prove ONLY 柳's block + 柳's two views differ from canon; all else byte-identical.
    def cast_of(p):
        return {c["name"]: c for c in p["founding_cast"]}
    a, b = cast_of(src), cast_of(out)
    changed_chars = [n for n in a if a[n] != b[n]]
    liu_fields = [k for k in a["柳安春"] if a["柳安春"][k] != b["柳安春"][k]]
    other_scenes_same = src["scenes"] == out["scenes"]
    views_changed = [
        (v["from"], v["to"]) for vs, vo in zip(src["relationship_views"], out["relationship_views"])
        for v in [vo] if vs != vo
    ]
    print("changed characters:", changed_chars, "(expected: ['柳安春'])")
    print("柳 fields changed:", liu_fields, "(expected: ['description', 'secret'])")
    print("relationship_views changed:", views_changed, "(expected: 柳→金, 柳→蘇)")
    print("all scenes byte-identical:", other_scenes_same)


if __name__ == "__main__":
    main()
