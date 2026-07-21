#!/usr/bin/env python3
"""
Chamber-piece generator — derives two minimal 2-hander presets from the
spring-snow canon so a single character (柳安春) can be run against two different
partners under an OTHERWISE-identical seed. The point is a controlled comparison:
hold the identity block (skills / secret / memories / description) byte-identical,
vary only who is in the room, and see whether the same character behaves
differently. Pure data — the engine is untouched.

Emits:
  packages/cli/scripts/stories/spring-snow-chamber-jin.json   (柳安春 × 金鳳)
  packages/cli/scripts/stories/spring-snow-chamber-su.json    (柳安春 × 蘇映雪)
  packages/cli/scripts/seasons/spring-snow-chamber-jin.json   (frame: 金鳳寓所)
  packages/cli/scripts/seasons/spring-snow-chamber-su.json     (frame: 二樓書寓)
"""
import json, copy, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "packages/cli/scripts/stories/spring-snow.json"
STORIES = ROOT / "packages/cli/scripts/stories"
SEASONS = ROOT / "packages/cli/scripts/seasons"

src = json.loads(SRC.read_text(encoding="utf-8"))
cast_by_name = {c["name"]: c for c in src["founding_cast"]}


def block(name):
    return copy.deepcopy(cast_by_name[name])


def views_between(names):
    s = set(names)
    return [copy.deepcopy(v) for v in src.get("relationship_views", [])
            if v["from"] in s and v["to"] in s]


def make_preset(pid, label, partner, venue):
    """柳's identity block is copied verbatim; only her STAGE (work_scene) moves to
    the venue so she and the partner open the day in the same room. Everything that
    makes her HER — skills, secret, memories, description — is byte-identical to the
    other chamber and to canon."""
    liu = block("柳安春")
    par = block(partner)
    # Both open the day in the chamber (roster starts at work_scene); 柳 keeps her
    # canon home so only the stage differs, never who she is.
    liu["work_scene"] = venue
    par["work_scene"] = venue
    par["home_scene"] = venue
    return {
        "id": pid,
        "label": label,
        "world": src["world"],
        "world_rules": src["world_rules"],
        "locations": src["locations"],
        "saga": src.get("saga"),
        "saga_attributes": src.get("saga_attributes"),
        "card_weight_rules": src.get("card_weight_rules"),
        "drama_resources": src.get("drama_resources"),
        "scenes": src["scenes"],
        "founding_cast": [liu, par],
        "relationship_views": views_between(["柳安春", partner]),
    }


def make_frame(fid, title, venue, partner):
    return {
        "id": fid,
        "title": title,
        "openingScene": venue,
        "centralQuestion": f"這一夜，屋裡只有她們兩個。積在心裡沒說開的話、身子還記得的舊事、拖著沒算的那筆帳——沒有旁人、沒有戲要趕，這一晚，她與{partner}會怎麼過？",
        "incitingIncident": "戲散了，燈也熄了大半條街。這一夜哪兒都不必去，就這一間屋、這一個人。",
        "deadline": "天亮之前，這一夜是她們自己的。天光一透，各人又是各人的日子。",
        "stakes": [
            "有些話一旦說開就收不回，有些話再不說也就爛在心裡了。",
            "身子比嘴誠實，可身子記得的，未必是心裡認的。",
        ],
        "publicFacts": [
            "這一夜屋裡只她們兩人，門外沒有別人。",
        ],
    }


def write(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


write(STORIES / "spring-snow-chamber-jin.json",
      make_preset("spring-snow-chamber-jin", "室內劇 · 柳安春與金鳳的一夜", "金鳳", "金鳳寓所"))
write(STORIES / "spring-snow-chamber-su.json",
      make_preset("spring-snow-chamber-su", "室內劇 · 柳安春與蘇映雪的一夜", "蘇映雪", "二樓書寓"))
write(SEASONS / "spring-snow-chamber-jin.json",
      make_frame("spring-snow-chamber-jin", "一夜 · 會樂里", "金鳳寓所", "金鳳"))
write(SEASONS / "spring-snow-chamber-su.json",
      make_frame("spring-snow-chamber-su", "一夜 · 二樓書寓", "二樓書寓", "蘇映雪"))

# Proof the two 柳 blocks are identity-identical (only work_scene differs).
a = json.loads((STORIES / "spring-snow-chamber-jin.json").read_text(encoding="utf-8"))["founding_cast"][0]
b = json.loads((STORIES / "spring-snow-chamber-su.json").read_text(encoding="utf-8"))["founding_cast"][0]
diff = [k for k in a if a[k] != b.get(k)]
print("柳 block differs only on:", diff, "(expected: ['work_scene'])")
