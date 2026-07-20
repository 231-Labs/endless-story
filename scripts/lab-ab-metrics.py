#!/usr/bin/env python3
"""
lab_ab_metrics.py — objective 感情 vs 營生 metrics from cinema-lab 診斷導出 (.md).

Give it one or two exports:
    python3 lab_ab_metrics.py control.md            # single arm
    python3 lab_ab_metrics.py control.md open.md     # A/B compare

It parses the structured diagnostic (header / 戲班 / 相許 / 願牆 / 場景 / 逐拍紀事)
and reports the numbers that decide the emergence question:

  · 夜間去向：獨居 vs 登門(去別人私處) vs 工作/公開   ← the death-knot metric
  · 私處二人場景（快照）                              ← intimacy venues that formed
  · 相許 establishedPairs / 願牆 prayers 數
  · 心事層 情感 vs 營生 佔比（願望結構）
  · 每拍 episode✓（情感成戲）比例
  · 情感關鍵詞在 beat「心下」中的密度（rough）
"""
import re, sys

EMO_LAYER = re.compile(r'愛|情|戀|慾|妒|怨|虧欠|牽掛|眷|相思|念|心$|懼|舊')
LIVE_LAYER = re.compile(r'生計|班務|活路|志向|志|名|錢|利|業|事務|身體|疑')
NIGHT = re.compile(r'入夜|深宵|·夜')
INTIMATE_KW = re.compile(r'舊情|舊愛|情人|枕|同衾|雲雨|一夜|眷侶|相許|恩愛|心悅|傾心|擁|吻|廝守|交代|把話說開')

def parse(md: str) -> dict:
    R = {'file': None}
    # ---- header ----
    h = re.search(r'provider (\w+) · model ([\w.\-]+)）.*?旗標 ([^；]*)；.*?第 (\d+) 日 · 第 (\d+) 拍.*?cast (\d+) · scenes (\d+) · liveWants (\d+) · events (\d+)', md, re.S)
    if h:
        R.update(provider=h[1], model=h[2], flags=h[3].strip(),
                 day=int(h[4]), tick=int(h[5]), cast=int(h[6]),
                 scenes=int(h[7]), liveWants=int(h[8]), events=int(h[9]))
    # ---- scene privacy map (from 場景 snapshot) ----
    priv = {}
    occ_snapshot = {}
    for m in re.finditer(r'-\s*s\d+\s+(.+?)（privacy (\d+)）：(.*)', md):
        name, p, rest = m[1].strip(), int(m[2]), m[3]
        priv[name] = p
        present = [] if '空' in rest else re.findall(r'[一-鿿]{2,4}', rest.replace('在場',''))
        occ_snapshot[name] = present
    R['priv'] = priv
    # ---- home map (居所：自有/租住/公處 · SceneName) ----
    home = {}   # char -> (kind, scene)
    owns = {}   # scene -> owner char (自有)
    for m in re.finditer(r'- \*\*(.+?)\*\*（.+?）.*?居所：(自有|租住|公處)\s*·\s*([^\n]+)', md, re.S):
        ch, kind, scene = m[1].strip(), m[2], m[3].strip()
        home[ch] = (kind, scene)
        if kind == '自有':
            owns[scene] = ch
    R['home'] = home
    # ---- want layers (心事：desc（layer／張力 0.61）) ----
    emo = live = 0
    for m in re.finditer(r'心事：(.+?)(?=\n\s+·|\n-|\Z)', md, re.S):
        for lm in re.finditer(r'（([^（）]*?)／張力', m[1]):
            lay = lm[1]
            if EMO_LAYER.search(lay): emo += 1
            elif LIVE_LAYER.search(lay): live += 1
    R['want_emo'], R['want_live'] = emo, live
    # ---- 相許 / 願牆 ----
    est = re.search(r'相許（establishedPairs）\s*\n+(.*?)\n#', md, re.S)
    R['establishedPairs'] = 0 if (not est or '（無）' in est[1]) else len([l for l in est[1].splitlines() if l.strip().startswith('-')])
    pray = re.search(r'願牆（recent prayers）\s*\n+(.*?)\n#', md, re.S)
    R['prayers'] = 0 if (not pray or '（無）' in pray[1]) else len([l for l in pray[1].splitlines() if l.strip().startswith('-')])
    # ---- per-tick 逐拍 ----
    ticks = re.split(r'### (第\d+日·第\d+拍（[^）]+）)', md)
    night_moves = {'solo': 0, 'visit': 0, 'work_public': 0}
    episodes = pairs_private = tick_ct = 0
    intimate_hits = beat_ct = 0
    for i in range(1, len(ticks), 2):
        label, body = ticks[i], ticks[i+1]
        tick_ct += 1
        is_night = bool(NIGHT.search(label))
        # 旗標 episode
        fl = re.search(r'旗標：.*?episode\s*(✓|✗)', body)
        if fl and fl[1] == '✓': episodes += 1
        # intimate keyword density in 心下
        for cm in re.finditer(r'（心下(.+?)）', body, re.S):
            beat_ct += 1
            if INTIMATE_KW.search(cm[1]): intimate_hits += 1
        # night destinations
        if is_night:
            mv = re.search(r'移步：(.+)', body)
            if mv:
                for step in re.split(r'[、,]', mv[1]):
                    sm = re.match(r'\s*(.+?)→\s*([^\s（]+)', step)
                    if not sm: continue
                    ch, dest = sm[1].strip(), sm[2].strip()
                    hk = home.get(ch)
                    if hk and dest == hk[1]:
                        night_moves['solo'] += 1
                    elif priv.get(dest, 0) >= 2 and owns.get(dest) and owns.get(dest) != ch:
                        night_moves['visit'] += 1     # 登門: went to someone else's private place
                    else:
                        night_moves['work_public'] += 1
        # private 2-person scene blocks in this tick (approx: scene header + speakers)
        for sm in re.finditer(r'〔([^〕·]+)(?:·私)?〕(.*?)(?=〔|\n旗標|\Z)', body, re.S):
            sc, blk = sm[1].strip(), sm[2]
            speakers = set(re.findall(r'\n\s{0,2}([一-鿿]{2,4})：', blk))
            if priv.get(sc, 0) >= 2 and len(speakers) == 2:
                pairs_private += 1
    R['night_moves'] = night_moves
    R['episodes'], R['ticks'] = episodes, tick_ct
    R['pairs_private_ticks'] = pairs_private
    R['intimate_hits'], R['beat_ct'] = intimate_hits, beat_ct
    return R

def show(R):
    print(f"  provider/model : {R.get('provider')}/{R.get('model')}")
    print(f"  旗標           : {R.get('flags')}")
    print(f"  進度           : 第{R.get('day')}日·第{R.get('tick')}拍 · cast {R.get('cast')} · liveWants {R.get('liveWants')}")
    nm = R['night_moves']; tot = sum(nm.values()) or 1
    print(f"  夜間去向        : 獨居 {nm['solo']} · 登門(去別人私處) {nm['visit']} · 工作/公開 {nm['work_public']}"
          f"   → 登門率 {nm['visit']/tot*100:.0f}%")
    print(f"  私處二人場景    : {R['pairs_private_ticks']} 拍次")
    print(f"  相許 / 願牆     : {R['establishedPairs']} / {R['prayers']}")
    we, wl = R['want_emo'], R['want_live']; wt = (we+wl) or 1
    print(f"  心事層 情感:營生 : {we}:{wl}  （情感佔 {we/wt*100:.0f}%）")
    print(f"  episode✓ 比例   : {R['episodes']}/{R['ticks']} 拍")
    print(f"  情感詞密度(心下): {R['intimate_hits']}/{R['beat_ct']} beats"
          f"  ({(R['intimate_hits']/(R['beat_ct'] or 1))*100:.0f}%)")



# ── 敘事質感 (prose quality) ─────────────────────────────────────────────────
import collections

def prose_quality(md: str) -> dict:
    """Formulaic-prose metrics from the 逐拍紀事: repeated action imagery,
    numeric echo, template uniformity."""
    # per-character beat action texts (the part before 心下)
    beats = re.findall(r'\n\s{0,2}([一-鿿]{2,4})：(.+?)(?=（心下|\n)', md)
    by_char = collections.defaultdict(list)
    for name, txt in beats:
        if name in ('移步', '世界', '旗標'):
            continue  # 非角色行
        by_char[name].append(txt)
    # repeated 5-gram imagery WITHIN a character across different beats
    rep = collections.Counter()
    for name, txts in by_char.items():
        grams = collections.Counter()
        for t in txts:
            seen = set()
            for i in range(0, max(0, len(t) - 5)):
                g = t[i:i+5]
                if re.fullmatch(r'[一-鿿]{5}', g) and g not in seen:
                    grams[g] += 1
                    seen.add(g)
        for g, n in grams.items():
            if n >= 3:
                rep[f'{name}「{g}…」'] = n
    # numeric echo: monetary figures repeated verbatim across the whole 卷
    nums = collections.Counter(re.findall(r'[一二三四五六七八九十百千]+圓[一二三四五六七八九十半分]*', md))
    echo = {k: v for k, v in nums.items() if v >= 4}
    total_beats = len(beats)
    return {'beats': total_beats, 'repeated_imagery': rep.most_common(8), 'numeric_echo': sorted(echo.items(), key=lambda x: -x[1])[:8]}

def show_prose(md: str) -> None:
    q = prose_quality(md)
    print(f"  〔敘事質感〕beats {q['beats']}")
    if q['repeated_imagery']:
        print('  重複意象（同角色 ≥3 拍重演同一動作片語）:')
        for k, n in q['repeated_imagery']:
            print(f'    · {k} ×{n}')
    else:
        print('  重複意象: 無（≥3 次門檻下乾淨）')
    if q['numeric_echo']:
        print('  數字回聲（同一銀錢數字全卷 ≥4 次覆誦）:')
        for k, n in q['numeric_echo']:
            print(f'    · {k} ×{n}')


def main():
    files = sys.argv[1:]
    if not files:
        print("usage: python3 lab_ab_metrics.py <arm1.md> [arm2.md]"); return
    arms = []
    for f in files:
        R = parse(open(f, encoding='utf-8').read()); R['file'] = f
        arms.append(R)
    for R in arms:
        print(f"\n═══ {R['file']} ═══")
        show(R)
        show_prose(open(R['file'], encoding='utf-8').read())
    if len(arms) == 2:
        a, b = arms
        print("\n═══ Δ (arm2 − arm1) ═══")
        va = a['night_moves']['visit']; vb = b['night_moves']['visit']
        print(f"  登門(去別人私處)  : {va} → {vb}   ({'+' if vb>=va else ''}{vb-va})")
        print(f"  私處二人場景拍次   : {a['pairs_private_ticks']} → {b['pairs_private_ticks']}")
        print(f"  相許 establishedPairs: {a['establishedPairs']} → {b['establishedPairs']}")
        ea = a['episodes']/(a['ticks'] or 1); eb = b['episodes']/(b['ticks'] or 1)
        print(f"  episode✓ 比例      : {ea*100:.0f}% → {eb*100:.0f}%")
        print("\n  判讀：登門率↑、私處二人場景↑、相許↑ ⇒ 命題是主因（開放即平衡）；")
        print("        若三者仍≈0 ⇒ 引擎 scaffolding 是主因（需登門修好那道解鎖）。")

if __name__ == '__main__':
    main()
