/**
 * RunnerSceneAgent — the real-LLM SceneAgentPort. Thin wrapper over
 * `@endless-story/runner`'s character-agent + scene-record + event-chapter
 * services. Every method is a straight delegate; the runner services own the
 * prompts and validation.
 *
 * This module imports the runner package eagerly (its `.js` specifiers only load
 * under tsx / a bundler), so it lives OUTSIDE the node-clean barrel and is
 * dynamically imported by the CLI only when `--real-llm` is set.
 */

import { characterAgent, sceneRecord, eventChapter } from '@endless-story/runner';
import type { GenesisWant, RippleJudgeDelta, SceneAgentPort } from '../ports.ts';

export class RunnerSceneAgent implements SceneAgentPort {
    actBeat = characterAgent.actBeat;
    judgeWantResolved = characterAgent.judgeWantResolved;

    async deriveGenesisWants(
        input: Parameters<typeof characterAgent.deriveGenesisWants>[0],
    ): Promise<GenesisWant[]> {
        return characterAgent.deriveGenesisWants(input);
    }

    async deriveAftermathWant(
        input: Parameters<typeof characterAgent.deriveAftermathWant>[0],
    ): Promise<GenesisWant | null> {
        return characterAgent.deriveAftermathWant(input);
    }

    async judgeRipples(
        input: Parameters<typeof characterAgent.judgeRipples>[0],
    ): Promise<RippleJudgeDelta[]> {
        return characterAgent.judgeRipples(input);
    }

    async weaveTickChapter(
        input: Parameters<typeof sceneRecord.weaveTickChapter>[0],
    ): Promise<string | null> {
        return sceneRecord.weaveTickChapter(input);
    }

    async composeEpisode(
        input: Parameters<typeof eventChapter.composeEpisode>[0],
    ): Promise<string | null> {
        return eventChapter.composeEpisode(input);
    }
}
