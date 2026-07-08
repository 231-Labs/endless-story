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
import type { GenesisWant, RippleJudgeDelta, SceneAgentPort } from '../../ports.ts';

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
        // Only ~1/3 of judged (edge+) wants resolve — leaves standing 懸念 alive.
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
                resistance: 5,
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
}
