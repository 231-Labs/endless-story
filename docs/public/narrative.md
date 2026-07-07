# Narrative engine

Endless Story does not ask one model to write a novel from beginning to end. It runs a world in small, inspectable steps. A Director shapes the conditions; Character agents decide how to respond.

## Two kinds of agency

| Director | Character |
|---|---|
| Watches the Saga as a whole | Sees only the situation available to that character |
| Opens or retires dramatic opportunities | Forms plans, moves, speaks, helps, refuses, and plays event actions |
| Adjusts pacing and scarce resources | Interprets events through private memory and relationships |
| Publishes the objective gazette | Produces a subjective point-of-view chapter |

The boundary is simple: the Director may arrange a difficult situation, but it may not decide what a character thinks or does inside it.

## One world tick

A normal tick runs the following sequence:

1. **Advance** narrative time.
2. **Perceive** the current scene, nearby cast, active events, recent outcomes, and relevant public signals.
3. **Plan** from the perceived situation and recalled memory.
4. **Move** toward a place or person that matters to the plan.
5. **Socialize** through observation, conversation, or deliberate silence.
6. **Ask** when a character in need opens a request to a solvent peer in the same scene.
7. **Give** when a solvent character decides whether to help.
8. **Settle** wages, costs, accepted gifts, and survival in the process-local economy adapter — before event play, not after.
9. **Act** by choosing from the actions available in an open event.
10. **Publish** character POV chapters, resolved event chapters, and an objective Saga gazette.
11. **Reflect** by consolidating recent experience into longer-lived memory (sleep consolidation runs at night).

Between move and social play, the default path also derives dramatic tension, may open or continue event-spine conflicts, and lets the Director introduce scarce resources when pacing calls for it. Perception, the event spine, and Director-created scarce resources are enabled in the current default tick path. Parallel events, attention coupling, LLM-written framing, and rival-gravity movement remain opt-in controls.

## Events that actually end

The event spine gives a conflict an identity that can survive across ticks:

<div class="formula">open → act → linger → resolve → publish</div>

Characters play one on-chain action round. Reactions and POV material may continue to accumulate before resolution. At the end, the engine can transfer a contested Resource, close the event, and compile the collected voices into one chapter.

If resource settlement fails, the event can still close without a transfer. This failure isolation prevents one malformed proposal or RPC failure from freezing the world loop.

## The Showrunner

The Showrunner is a slower Director heartbeat. It reads the roster, recent gazettes, current tension, and its compact arc plan. It can repair missing character assets, introduce or retire a source of tension, push a public beat, or mount a full troupe production.

It operates under explicit tool and model-call budgets. Doing nothing is a valid choice when the story needs room to breathe.

## From event to publication

- **POV chapters** are subjective and tied to a character.
- **Event chapters** weave several POVs around one resolved event.
- **Gazettes** report public Saga history from the Director side.
- **Stills and productions** reuse character profiles, relationships, and memory to keep later media consistent with the world that produced it.

Published content is anchored on-chain and stored on Walrus. The reader-facing feed reconstructs chapters from commitments and blobs rather than treating mock data as the primary source.

---

Implementation: the tick loop in [`packages/web`](https://github.com/231-Labs/endless-story/tree/main/packages/web), character services in [`packages/runner`](https://github.com/231-Labs/endless-story/tree/main/packages/runner), and the production pipeline in [`packages/troupe`](https://github.com/231-Labs/endless-story/tree/main/packages/troupe).
