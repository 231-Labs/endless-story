# @endless-story/engine

A standalone, **local-first** narrative engine: the verified want-engine loop
(see `RUNNER_V2`) running with **no chain, no Walrus/Seal, no Next.js**. It
promotes the proven harness form — fake chain + real (or fake) LLM + local
memory — to be the engine proper, with infrastructure behind pluggable ports.

The engine **stages situations and resolves collisions; it never scripts a
character's choice** (RUNNER_V2 §7). All LLM authorship goes through one port;
the loop itself is deterministic orchestration.

## What M0 covers

- **Pure narrative core** (relocated here from `web/lib/chain`, single source of
  truth): the want engine (`core/want-core`), scene interaction loop
  (`core/scene-loop`), turn routing (`core/scene-routing`), actor fatigue
  (`core/actor-fatigue`) and the night-placement math (`core/spatial-routing`).
- **WorldState** with full JSON `snapshot(dir)` / `restore(dir)` every tick —
  cast (persona/secret/state vector), scenes (privacy), roster, home/work
  anchors, want ledger, directed relationship edges, world clock and the
  day-accumulator. This kills the volatile in-process-Map failure mode diagnosed
  in production (CHARACTER_LIFECYCLE §6iii): a restart continues.
- **Tick pipeline** (`tick.ts`): advance clock → genesis wants grown from the
  **full self** (persona + secret + saga premise — not the stripped description
  that starved production) → day dispersal to work anchors / night routing home +
  want-driven pursuit → per-scene `runSceneLoop` self-assembled from persona +
  secret + recalled memories + state line → aftermath / ripples → weave tick 回 →
  day-end episode → archive everything → snapshot.
- **Local adapters**: `FakeSceneAgent` (deterministic, prompt-free),
  `RunnerSceneAgent` (real LLM via `@endless-story/runner`), `LocalRecall`
  (embed + cosine, real OpenAI embeddings or deterministic hash, JSON-backed),
  `FileArchive` (markdown per artifact), `LocalClock`.
- **Preset loader + CLI**: load a story preset, seed genesis memories, run N
  ticks, resumable.

Every port is **loud on failure** — an adapter that cannot do its job throws;
the loop never swallows a port error into a silent empty result.

## Port map

| Port | M0 adapter | M2 swap |
|---|---|---|
| `SceneAgentPort` (actBeat/judgeWantResolved + genesis/aftermath/ripples/weave/episode) | `FakeSceneAgent` · `RunnerSceneAgent` | — |
| `RecallPort` (remember/recall by kind+day+importance) | `LocalRecall` (JSON + embeddings) | MemWal adapter |
| `ArchivePort` (手卷 / 織回 / 日終 / POV) | `FileArchive` (markdown) | chain commitment + Walrus |
| `ClockPort` | `LocalClock` | — |
| EconomyLedger | *(deferred)* | economy slots |

`SceneAgentPort` extends the scene-loop's injectable `SceneAgent` with the
surrounding authorship the pipeline drives itself, so exactly two adapters cover
the whole LLM surface and the smoke runs with zero LLM.

## Run it

```bash
# default = FakeSceneAgent + deterministic embeddings (no creds needed)
pnpm --filter @endless-story/engine engine -- run --preset spring-snow --ticks 8 --out ./run

# real LLM (needs a text-provider key; real embeddings if OPENAI_API_KEY set)
pnpm --filter @endless-story/engine engine -- run --preset spring-snow --ticks 8 --out ./run --real-llm
```

A run is resumable: if `<out>/state/world.json` exists it is restored and
continued. Artifacts land in `<out>/archive/` (`d<day>-t<tick>-<kind>-…md`),
memory in `<out>/memory/recall.json`, the world in `<out>/state/world.json`.

```bash
pnpm --filter @endless-story/engine test          # unit + integration smoke
pnpm --filter @endless-story/engine type-check
```

## Architecture rules

- May depend on `@endless-story/shared`, `@endless-story/llm`,
  `@endless-story/runner`. **Never** imports `packages/web`, Next.js, or
  `@mysten/sui`.
- The pure narrative modules live here now; `packages/web` imports them from
  `@endless-story/engine/core/*`.
- The main barrel is node-clean (no eager runner `.js` graph); `RunnerSceneAgent`
  lives at `@endless-story/engine/adapters/runner` and is loaded only by the CLI
  under `tsx`.

## Deferred

- **M1** — per-beat scene closure (resolve / leave / stall); night-window
  consolidation (sleep compression × relationship-evolve × self-reflect ×
  autobiographical L2 promotion, per CHARACTER_LIFECYCLE §3–4); centrality thread
  selection; first-person POV serial prose.
- **M2** — chain Archive adapter (commitment / event), MemWal Recall adapter,
  Seal, economy ledger, image pipeline.
- **M3** — death → distill → reincarnate; plasticity curve.
