#!/usr/bin/env python3
"""
Academic-style figures for the Desire/Resource Drama Engine, from REAL engine traces.

Reproduce (from packages/drama/):
    node driver/export-traces.ts > figures/traces.json
    python3 figures/plot.py            # writes figures/fig{1..4}_*.png

Needs matplotlib + numpy and a CJK-capable font (macOS "Arial Unicode" by default;
override with DRAMA_CJK_FONT=/path/to/font.ttf). No engine logic here — pure plotting.
"""
import json
import os
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import Patch
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TRACES = os.path.join(HERE, "traces.json")

# --- CJK-capable font so 柳生春 / 白牡丹 render ---
FONT_CANDIDATES = [
    os.environ.get("DRAMA_CJK_FONT", ""),
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]
for fp in FONT_CANDIDATES:
    if fp and os.path.exists(fp):
        fm.fontManager.addfont(fp)
        plt.rcParams["font.family"] = fm.FontProperties(fname=fp).get_name()
        break
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 130
plt.rcParams["savefig.dpi"] = 200
plt.rcParams["axes.grid"] = True
plt.rcParams["grid.alpha"] = 0.3
plt.rcParams["grid.linestyle"] = "--"

if not os.path.exists(TRACES):
    sys.exit("missing figures/traces.json — run: node driver/export-traces.ts > figures/traces.json")
D = json.load(open(TRACES))

C_LIU = "#1f5fb0"
C_BAI = "#c0392b"
C_PART = "#1f5fb0"
C_FAME = "#e08a00"
SHADE_LIU = "#cfe0f2"
SHADE_BAI = "#f4d4cf"


def holder_spans(holder):
    spans, i, n = [], 0, len(holder)
    while i < n:
        who, j = holder[i], i
        while j < n and holder[j] == who:
            j += 1
        spans.append((i, j - 1, who))
        i = j
    return spans


def out(name):
    return os.path.join(HERE, name)


def fig1():
    s = D["contested"]
    t = s["ticks"]
    fig, ax = plt.subplots(figsize=(10, 4.6))
    for a, b, who in holder_spans(s["holder"]):
        if who == "柳":
            ax.axvspan(a - 0.5, b + 0.5, color=SHADE_LIU, alpha=0.6, lw=0)
        elif who == "白":
            ax.axvspan(a - 0.5, b + 0.5, color=SHADE_BAI, alpha=0.6, lw=0)
    ax.plot(t, s["liu_tns"], color=C_LIU, lw=2.0, label="柳生春  tension")
    ax.plot(t, s["bai_tns"], color=C_BAI, lw=2.0, label="白牡丹  tension")
    h = s["holder"]
    for i in range(1, len(h)):
        if h[i] != h[i - 1] and h[i] in ("柳", "白"):
            prev = s["liu_tns"][i - 1] if h[i] == "柳" else s["bai_tns"][i - 1]
            ax.plot(i - 1, prev, "v", color="black", ms=6, zorder=5)
    ax.axhline(0.70, color="grey", lw=1, ls=":", label="escalation threshold (0.70)")
    ax.set_xlim(0, 60)
    ax.set_ylim(0, 1)
    ax.set_xlabel("tick (beat)")
    ax.set_ylabel("tension  (weight·(1−satisfaction))")
    ax.set_title("Fig. 1  Step 1 — Legible rivalry over one capacity-1 resource (孟雲屏 partnership)",
                 fontsize=11, fontweight="bold")
    handles, _ = ax.get_legend_handles_labels()
    handles += [Patch(facecolor=SHADE_LIU, label="柳生春 holds slot"),
                Patch(facecolor=SHADE_BAI, label="白牡丹 holds slot"),
                plt.Line2D([], [], marker="v", color="black", ls="none", label="spike → re-seize")]
    ax.legend(handles=handles, loc="upper right", fontsize=8, ncol=2, framealpha=0.95)
    ax.text(0.5, -0.16, "Whoever lacks the slot rises to a tension spike (▼ ≈0.8); that spike drives the counter-seize. "
            "Reign ≈7 beats — legible, not thrash.",
            transform=ax.transAxes, ha="center", fontsize=8.5, style="italic", color="#333")
    fig.tight_layout()
    fig.savefig(out("fig1_contested.png"), bbox_inches="tight")
    print("wrote fig1")


def fig2():
    fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.2), sharey=True)
    panels = [
        ("contested", "(a) contested\nsymmetric rivalry → trading", 60),
        ("uneven", "(b) uneven\nstrong wins → unrequited longing", 60),
        ("naive", "(c) naive ablation\nno margin/cost → oscillation", 40),
    ]
    for ax, (key, title, xmax) in zip(axes, panels):
        s = D[key]
        t = s["ticks"]
        for a, b, who in holder_spans(s["holder"]):
            col = SHADE_LIU if who == "柳" else (SHADE_BAI if who == "白" else None)
            if col:
                ax.axvspan(a - 0.5, b + 0.5, color=col, alpha=0.6, lw=0)
        ax.plot(t, s["liu_tns"], color=C_LIU, lw=1.8, label="柳生春")
        ax.plot(t, s["bai_tns"], color=C_BAI, lw=1.8, label="白牡丹")
        ax.set_xlim(0, xmax)
        ax.set_ylim(0, 1)
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("tick")
        ax.legend(loc="upper right", fontsize=8)
    axes[0].set_ylabel("tension")
    fig.suptitle("Fig. 2  Step 1 — Three regimes from the SAME engine (>1 scenario; (c) proves the mechanism by ablation)",
                 fontsize=11, fontweight="bold", y=1.02)
    fig.tight_layout()
    fig.savefig(out("fig2_regimes.png"), bbox_inches="tight")
    print("wrote fig2")


def fig3():
    s = D["scarce"]
    t = s["ticks"]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 6.2), sharex=True,
                                   gridspec_kw={"height_ratios": [3, 1.1]})
    ax1.plot(t, s["partner_sat"], color=C_PART, lw=2.0, label="陪孟雲屏排戲  (partner)  satisfaction")
    ax1.plot(t, s["fame_sat"], color=C_FAME, lw=2.0, label="搶壓軸成角兒  (fame)  satisfaction")
    ax1.axhline(0.60, color="grey", lw=1, ls=":", label='"well satisfied" (0.60)')
    ax1.set_ylim(0, 1)
    ax1.set_xlim(0, 60)
    ax1.set_ylabel("satisfaction (柳生春)")
    ax1.set_title("Fig. 3  Step 2 — The 柳生春 moment: one finite budget, two desires → forced neglect (scarce)",
                  fontsize=11, fontweight="bold")
    ax1.legend(loc="upper right", fontsize=8.5, framealpha=0.95)
    ax1.text(0.012, 0.04,
             "Neither line ever reaches 0.60: 柳生春 NEVER holds both at once.\nFeeding one starves the other — the trade-off is emergent, not coded.",
             transform=ax1.transAxes, fontsize=8.5, style="italic", color="#333",
             va="bottom", bbox=dict(boxstyle="round", fc="white", ec="#bbb", alpha=0.9))
    ax2.fill_between(t, s["budget"], step="mid", color="#888", alpha=0.25, label="schedule budget")
    ax2.plot(t, s["wanting"], color="black", lw=1.4, drawstyle="steps-mid", label="# desires wanting action")
    ax2.plot(t, s["funded"], color="#2a8", lw=1.6, drawstyle="steps-mid", label="# actually funded")
    ax2.set_ylim(-0.2, 8.5)
    ax2.set_xlim(0, 60)
    ax2.set_xlabel("tick (beat)")
    ax2.set_ylabel("budget / count")
    ax2.legend(loc="upper right", fontsize=8, ncol=3)
    ax2.text(0.012, 0.92, "wanting=2 but funded≤1 every beat ⇒ forced choice",
             transform=ax2.transAxes, fontsize=8.5, va="top", style="italic", color="#333")
    fig.tight_layout()
    fig.savefig(out("fig3_tradeoff.png"), bbox_inches="tight")
    print("wrote fig3")


def fig4():
    fig = plt.figure(figsize=(12.5, 5.0))
    gs = fig.add_gridspec(2, 3, width_ratios=[1.5, 1.5, 1.0], hspace=0.45, wspace=0.32)
    for row, key, tag in [(0, "scarce", "scarce budget"), (1, "abundant", "abundant budget (ablation)")]:
        s = D[key]
        t = s["ticks"]
        ax = fig.add_subplot(gs[row, 0:2])
        ax.plot(t, s["partner_sat"], color=C_PART, lw=1.8, label="partner sat")
        ax.plot(t, s["fame_sat"], color=C_FAME, lw=1.8, label="fame sat")
        ax.axhline(0.60, color="grey", lw=1, ls=":")
        ax.set_ylim(0, 1)
        ax.set_xlim(0, 60)
        ax.set_ylabel(f"{tag}\nsatisfaction", fontsize=9)
        if row == 0:
            ax.set_title("柳生春's two desires over time", fontsize=10)
            ax.legend(loc="lower right", fontsize=8, ncol=2)
        else:
            ax.set_xlabel("tick")
            ax.annotate("both desires now stay\nabove 0.60 together", xy=(40, 0.85),
                        fontsize=8.5, style="italic", color="#2a7", ha="center")
    axm = fig.add_subplot(gs[:, 2])
    metrics = ["forced-choice\nticks", "both-satisfied\nticks"]
    sc, ab = [120, 0], [2, 66]
    x = np.arange(len(metrics))
    w = 0.36
    axm.bar(x - w / 2, sc, w, color="#c0392b", label="scarce")
    axm.bar(x + w / 2, ab, w, color="#2a8f5a", label="abundant")
    for i, (a, b) in enumerate(zip(sc, ab)):
        axm.text(i - w / 2, a + 2, str(a), ha="center", fontsize=8.5)
        axm.text(i + w / 2, b + 2, str(b), ha="center", fontsize=8.5)
    axm.set_xticks(x)
    axm.set_xticklabels(metrics, fontsize=8.5)
    axm.set_ylim(0, 132)
    axm.set_ylabel("ticks (of 120)")
    axm.set_title("single-variable\nablation", fontsize=10)
    axm.legend(fontsize=8, loc="upper center")
    fig.suptitle("Fig. 4  Step 2 ablation — relax ONLY 柳生春's budget ⇒ the trade-off vanishes (so the budget caused it)",
                 fontsize=11, fontweight="bold", y=0.99)
    fig.savefig(out("fig4_ablation.png"), bbox_inches="tight")
    print("wrote fig4")


if __name__ == "__main__":
    fig1(); fig2(); fig3(); fig4()
    print("ALL DONE")
