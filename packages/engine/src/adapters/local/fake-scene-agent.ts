/**
 * FakeSceneAgent — a deterministic, prompt-free SceneAgentPort for smoke tests.
 * No LLM, no keys. Beats echo the driving want; address/leave fire on a stable
 * hash so a run is reproducible. Genesis hands each character a small spread of
 * wants (one love-layer aimed at a castmate, one ambition, one daily) so the
 * routing, want-decay and night-anchor machinery all exercise. Aftermath grows a
 * tiny successor; ripples stay quiet; weave/episode stitch the material lines.
 *
 * It exists to prove the WIRING (the mechanism runs end-to-end and survives a
 * restart) — not to read as story. Swap in RunnerSceneAgent for real prose.
 */

import type * as Runner from '@endless-story/runner';
import type {
    AudienceReactionInput,
    ChooseActionInput,
    ChooseActionResult,
    GenesisWant,
    PovReflectInput,
    PovSceneInput,
    JudgeEstablishedInput,
    ReviewSceneInput,
    ReviewSceneReply,
    RippleJudgeDelta,
    SceneAgentPort,
    SelfModelConsolidateInput,
    SelfModelConsolidateReply,
} from '../../ports.ts';
import type { RegenerateWantInput, RewriteLedgerInput, RewriteReply, RewriteSpawn } from '../../core/want-rewrite.ts';

/** Stable string hash (FNV-1a) — reproducible pseudo-randomness. */
function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

export class FakeSceneAgent implements SceneAgentPort {
    async actBeat(input: Runner.characterAgent.ActBeatInput): Promise<Runner.characterAgent.BeatResult> {
        const h = hash(`${input.name}|${input.want.desc}|${input.sceneLog.length}`);
        const others = input.others ?? [];
        const addressed = others.length && h % 2 === 0 ? others[h % others.length].name : undefined;
        // Rare leave: drops out of the scene (the loop removes them from present).
        const move = h % 7 === 0 ? '別處' : undefined;
        const near = input.privateAlone ? '挨得近了些' : input.isPrivate ? '壓著聲' : '當著眾人';
        return {
            beat: `${near}，${input.name}繞著「${input.want.desc}」打轉${addressed ? `，看向${addressed}` : ''}`,
            inner: input.want.desc,
            addressed,
            move,
        };
    }

    async judgeWantResolved(
        input: Runner.characterAgent.JudgeResolveInput,
    ): Promise<Runner.characterAgent.ResolveVerdict> {
        // A love/yearning want ("挨近") never settles from public crumbs — it stays
        // hungry until (and often through) a private night scene, which is what
        // keeps the 床戲 path alive to reach the tryst. Everything else: ~1/3 of
        // judged (edge+) wants resolve, leaving standing 懸念 alive.
        if (/挨近/.test(input.wantDesc)) return { resolved: false };
        const resolved = hash(`${input.name}|${input.wantDesc}|${input.beats.length}`) % 3 === 0;
        return resolved ? { resolved: true, note: `${input.name}把「${input.wantDesc}」做了個了斷` } : { resolved: false };
    }

    async deriveGenesisWants(input: Runner.characterAgent.DeriveWantsInput): Promise<GenesisWant[]> {
        const cast = input.castNames ?? [];
        const idx = cast.indexOf(input.name);
        const target = cast.length > 1 ? cast[(Math.max(0, idx) + 1) % cast.length] : undefined;
        const wants: GenesisWant[] = [
            {
                layer: '愛',
                desc: `想多挨近${target ?? '心上的人'}一些`,
                target,
                weight: 0.8,
                sat: 0.3,
                // Low enough that a few daytime beats bring it to 'edge' by night,
                // so a ripe love want intrudes into a private home and a 床戲 tryst
                // reliably forms (the night-scene path the wiring must exercise).
                resistance: 3,
                why: 'fake: love thread aimed at a castmate',
            },
            {
                layer: '志向',
                desc: '想在台上站到最亮處',
                weight: 0.6,
                sat: 0.3,
                resistance: 4,
                why: 'fake: ambition',
            },
            {
                layer: '日常',
                desc: '想睡個囫圇覺',
                weight: 0.3,
                sat: 0.4,
                resistance: 2,
                why: 'fake: daily',
            },
        ];
        return wants;
    }

    async deriveAftermathWant(input: Runner.characterAgent.AftermathInput): Promise<GenesisWant | null> {
        return {
            layer: '餘波',
            desc: `了結「${input.resolvedDesc}」之後，心裡空了一塊`,
            weight: 0.5,
            sat: 0.25,
            resistance: 4,
            why: 'fake: aftermath',
        };
    }

    async judgeRipples(_input: Runner.characterAgent.RippleJudgeInput): Promise<RippleJudgeDelta[]> {
        return [];
    }

    async weaveTickChapter(input: Runner.sceneRecord.WeaveTickInput): Promise<string | null> {
        if (input.lines.length === 0) return null;
        return `【${input.clock}】（假織回）\n${input.lines.join('\n')}`;
    }

    async composeEpisode(input: Runner.eventChapter.ComposeEpisodeInput): Promise<string | null> {
        if (input.materialLines.length === 0) return null;
        return `## 第${input.day}日　假回目\n\n${input.materialLines.join('\n')}`;
    }

    /**
     * Chapter-level self-check / repair (fix #2) — a deterministic PASS-THROUGH: it
     * returns the woven chapter UNCHANGED. It exists to prove the review is wired
     * end-to-end after every weave; swap in RunnerSceneAgent for a real repair pass.
     */
    async reviewChapter(input: Runner.sceneRecord.ReviewChapterInput): Promise<Runner.sceneRecord.ReviewChapterReply | null> {
        return { chapter: input.chapter };
    }

    /**
     * Structured open-action — a deterministic self-tagged stub (fix #1: the LLM
     * tags its own kind; the engine routes off the tag, never regex on prose).
     * Kinds are pinned per role so a fragment/cast/rehearsal spread is guaranteed:
     * the 班主 proposes, the 花旦 composes (the 添唱詞 case the emergence test
     * mis-read), a rival joins + rehearses, the 小生 seeks a person (feeds the
     * night tryst), the patron keeps to personal business.
     */
    async chooseAction(input: ChooseActionInput): Promise<ChooseActionResult> {
        const play = !!input.playSummary;
        const loveTarget =
            input.wants.find((w) => /愛|情/.test(w.layer) && w.target)?.target ??
            input.castNames.find((n) => n !== input.name);
        const parity = hash(`${input.name}|${input.sharedLog.length}`) % 2;

        // Pre-play: exactly one initiator; the rest live their own beats.
        if (!play) {
            if (input.name === '沈雪笙')
                return { kind: 'propose_play', prose: `我把封了十五年的樟木戲箱開了一條縫，這一季，春雪社要排一齣自己的新戲，趕在年底會串之前。` };
            if (input.name === '蘇映雪')
                return { kind: 'compose', prose: `我在本子空白處提筆，替生旦對手戲添了一句唱詞。` };
            if (input.name === '柳生春' && loveTarget)
                return { kind: 'seek_person', target: loveTarget, prose: `我尋了個空，去找${loveTarget}說幾句話。` };
            return { kind: 'personal', prose: `我自個兒在廊下練了會兒功，理著心裡的事。` };
        }

        // Play in progress: pinned roles, with a little parity variation.
        switch (input.name) {
            case '沈雪笙':
                return { kind: 'rehearse', prose: `我盯著這一折的台步，親自帶著走了一遍。` };
            case '蘇映雪':
                return { kind: 'compose', prose: `我又給新戲添了一段戲文，生旦的那段對唱。` };
            case '江聞鶴':
                return parity === 0
                    ? { kind: 'join_play', prose: `這齣新戲，算我江聞鶴一個，小生我來搭。` }
                    : { kind: 'rehearse', prose: `我把這折的身段又走了一趟，求個準。` };
            case '連翹':
                return { kind: 'rehearse', prose: `我紮上靠旗，把這折武戲的槍花走實了一遍。` };
            case '柳生春':
                return loveTarget
                    ? { kind: 'seek_person', target: loveTarget, prose: `我去尋${loveTarget}，想與TA對對這段生旦戲。` }
                    : { kind: 'rehearse', prose: `我對著空戲台走了一遍生角的步子。` };
            case '金鳳':
                return parity === 0
                    ? { kind: 'seek_person', target: '柳生春', prose: `我遣人去請柳生春過來一趟。` }
                    : { kind: 'personal', prose: `我在寓所裡理著堂子的帳，等一個人。` };
            default:
                return { kind: 'personal', prose: `我在包廂裡看著這一切，心裡自有盤算。` };
        }
    }

    /**
     * Living-want self-rewrite (fix #2) — deterministic scene-scoped stub. Always
     * mutates the character's first live want (desc only; scalars stay engine-
     * owned) so the mechanism visibly fires; other wants are kept. The caller
     * hands only this character's own wants + the one scene text, so no
     * cross-character state can leak in.
     */
    async rewriteWantLedger(input: RewriteLedgerInput): Promise<RewriteReply> {
        if (input.wants.length === 0) return { decisions: [] };
        const decisions = input.wants.map((w, i) =>
            i === 0
                ? {
                      id: w.id,
                      action: 'mutate' as const,
                      newDesc: `${w.desc.slice(0, 12)}·經這場又深了些`.slice(0, 30),
                      note: 'fake: this scene deepened it',
                  }
                : { id: w.id, action: 'keep' as const },
        );
        return { decisions };
    }

    async audienceReaction(input: AudienceReactionInput): Promise<string | null> {
        return `【${input.audienceName}】（假體驗·暖度${input.warmth.toFixed(2)}）看罷這場，心裡自有滋味。`;
    }

    /**
     * Nightly want REGENERATION — deterministic stub proving the mechanism fires with
     * NO artificial floor. A just-resolved want seeds a successor; a character left with
     * NO live wants gets one from ambient world/lifecycle pressure; a character who still
     * has live wants and hasn't just resolved anything gets nothing (null). Swap in
     * RunnerSceneAgent for real, character-owned regeneration.
     */
    async regenerateWant(input: RegenerateWantInput): Promise<RewriteSpawn | null> {
        if (input.liveWants.length >= 4) return null;
        if (input.justResolved.length > 0) {
            return { desc: `了了「${input.justResolved[0].slice(0, 8)}」，這口氣往後往哪擱`.slice(0, 30), layer: '續' };
        }
        if (input.liveWants.length === 0) {
            return { desc: '這一季又過了，時候不等人，總得替自己掙點什麼', layer: '世' };
        }
        return null;
    }

    /**
     * Scene self-check / repair (fix #3) — a deterministic PASS-THROUGH: it returns
     * the input beats UNCHANGED (same names, order, count, inner). It exists to prove
     * the review is wired end-to-end; swap in RunnerSceneAgent for a real repair pass.
     */
    async reviewScene(input: ReviewSceneInput): Promise<ReviewSceneReply | null> {
        return { beats: input.beats.map((b) => ({ name: b.name, text: b.text, inner: b.inner })) };
    }

    /**
     * POV daily reflection (fix #5) — a deterministic first-person one-liner built
     * from the character's day + hottest want, so the subjective layer is exercised
     * end-to-end without an LLM. Swap in RunnerSceneAgent for real subjective prose.
     */
    /** Deterministic milestone stub: promoted only when BOTH views carry an
     *  explicit mutual marker (相許/已是彼此) — mechanical, no LLM. */
    async judgeEstablished(input: JudgeEstablishedInput): Promise<boolean> {
        const re = /相許|已是彼此|交了心|不退了/;
        return re.test(input.aView ?? '') && re.test(input.bView ?? '');
    }

    /** Deterministic POV-scene stub: proves the wiring (name + beat count), no LLM. */
    async povScene(input: PovSceneInput): Promise<string | null> {
        if (!input.beats.length) return null;
        return `${input.name}眼中的這一場（${input.venue}，${input.beats.length}拍）：我把方才每一下都記著。`;
    }

    async povReflect(input: PovReflectInput): Promise<string | null> {
        const hot = input.wants[0]?.desc;
        const stir = input.todayText.trim() ? '今日這一遭，我心裡自有計較' : '今日晃了一天，沒個要緊事';
        return `（第${input.day}日·我）${stir}${hot ? `，心裡還惦著「${hot}」` : ''}。`;
    }

    /**
     * Nightly self-model consolidation — a deterministic OVERWRITE stub. For each
     * person dealt with today it returns ONE new first-person view that REPLACES
     * the old one (latest-wins; the caller overwrites the map entry). A settled
     * relationship (a want aimed at that person closed today) flips the line to a
     * "兩清/了結" view — the headline proof that a changed relationship supersedes
     * the stale line instead of accumulating beside it. Occasionally distills a
     * durable identity insight (§2.52), deterministic on the day parity.
     */
    async consolidateSelfModel(input: SelfModelConsolidateInput): Promise<SelfModelConsolidateReply> {
        // The view is the line AFTER the name (selfModelBlock renders `名：view`),
        // so it must NOT repeat the name. A settled relationship flips to a 兩清 line.
        const relationshipViews = input.interactions.map((it) => ({
            otherId: it.otherId,
            view: it.resolvedWithThem
                ? '話說開了，那樁舊帳這一日了結，兩清了'
                : '這一日又照過面，心裡對TA更定了幾分',
        }));
        // A durable identity insight lands on ~1 night in 3 (day parity), only if
        // there was real interaction — mirrors §2.52 reflection landing rarely.
        const identityInsight =
            input.interactions.length > 0 && input.day % 3 === 0
                ? `我漸漸認了：擔子越重，越要把人放在戲前頭`.slice(0, 30)
                : undefined;
        return { relationshipViews, identityInsight };
    }
}
