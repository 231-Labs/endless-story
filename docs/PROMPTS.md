# Prompt management

Status: **in progress** — registry foundation landed (`persona.distill` converted as the proof slice). Rollout of the remaining prompts + lab rewire is pending.

## The problem

LLM prompts live in three layers, which is fine — but each prompt is currently defined in **three places that must stay in sync**:

1. **Builder fns** — `packages/llm/src/prompts/*.ts` and `packages/runner/src/services/*/prompt.ts`
   (`build*Prompt()` or `build*SystemPrompt()` + `build*UserPrompt()`, plus a `parse*`).
2. **Catalog metadata** — `packages/web/src/lib/prompt-lab/catalog.ts` (`PROMPT_LAB_CALLS`), hand-maintained.
3. **Dispatch + parser wiring** — the ~240-line `buildPrompt` switch in `packages/web/src/lib/actions/prompt-lab.ts`.

Adding or changing a prompt means editing all three. That triple-bookkeeping is the real cost, not "the files are scattered."

## What we are NOT doing

A single shared "prompt kernel" of merged prose. An audit found **almost no byte-identical
duplication**: the voice/format guidance recurs conceptually (e.g. the 民初 vernacular tone shows
up in the POV, reflection, and genesis prompts) but each is **locally tuned**, and the banned-imagery
list / JSON-output lines are not shared verbatim. Merging them would canonicalize divergent,
intentionally-different prose — an unverifiable behavior change to demo-critical prompts. We leave
prompt *text* alone.

## The design: a prompt registry

Define each prompt **once** as a `PromptDefinition` (type in `packages/llm/src/prompts/definition.ts`):

```ts
interface PromptDefinition<TInput, TOutput> {
  meta: PromptMeta;                       // id, phase, title, kind, summary, outputShape, …
  defaultInput: TInput;                   // lab fixture
  build(input: TInput): BuildPromptResult; // verbatim wrap of the existing builder(s)
  parse(raw: string): { parsed: TOutput; note?: string };
}
```

- Each prompt module **co-locates** its definition next to its builder/parser and exports it.
- The type lives in `llm` so `runner` modules can export definitions too (runner → llm is allowed;
  llm never imports runner).
- The **web prompt-lab assembles the registry** (`Record<PromptLabCallId, PromptDefinition>`) — web
  already imports both `llm` and `runner`, so this respects the dependency rules.
- `catalog.ts` metadata becomes **derived** from the registry (no more drift).
- The `prompt-lab.ts` switch collapses to `registry[id].build(input)` / `registry[id].parse(raw)`.

This hits all four goals without touching prompt text: DRY wiring, one discoverable registry,
`version`/`variants` hooks for A/B, and a `locale` hook for i18n / per-saga voice (ties into the
planned `next-intl` work).

## Rollout phases

- **Phase 1 — definitions.** Wrap each builder/parser in a `PromptDefinition`, co-located.
  *(`persona.distill` done as the proof slice; 16 calls remain — see `PromptLabCallId`.)*
- **Phase 2 — collapse the lab.** Registry lookup replaces the `buildPrompt` switch; `catalog.ts`
  derives from the registry. This is where the lab stops drifting.
- **Phase 3 — opt-in extras.** `meta.version` / `variants` + a lab selector (A/B); thread a `locale`
  arg through `build` (i18n / per-saga voice).
