# Prompt management

Status: **done** for the lab dispatch — the 240-line `buildPrompt` switch is gone; behavior
lives in a registry. Phase 3 (A/B + i18n hooks) is still optional/future.

## The problem

Each lab prompt used to be defined in **three places that had to stay in sync**:

1. **Builder fns** — `packages/llm/src/prompts/*.ts` and `packages/runner/src/services/*/prompt.ts`
   (`build*Prompt()` or `build*SystemPrompt()` + `build*UserPrompt()`, plus a `parse*`).
2. **Catalog metadata** — `packages/web/src/lib/prompt-lab/catalog.ts` (`PROMPT_LAB_CALLS`).
3. **Dispatch + parser wiring** — the ~240-line `buildPrompt` switch in `lib/actions/prompt-lab.ts`.

Adding or changing a prompt meant editing all three. That triple-bookkeeping was the real cost.

## What we are NOT doing

A single shared "prompt kernel" of merged prose. An audit found **almost no byte-identical
duplication**: the voice/format guidance recurs conceptually (e.g. the 民初 vernacular tone shows
up in the POV, reflection, and genesis prompts) but each is **locally tuned**. Merging them would
canonicalize divergent, intentionally-different prose — an unverifiable behavior change to
demo-critical prompts. We leave prompt *text* alone.

## The design: metadata (client) + behavior registry (server)

The hard constraint is the **client/server boundary**: the prompt-lab admin panel is a *client*
component that imports the catalog for the prompt list + fixtures, but the builders import `runner`
(which pulls `node:crypto`) and must stay server-only. So a prompt's two halves live apart:

- **Metadata + fixtures — client-safe — `prompt-lab/catalog.ts`.** `PROMPT_LAB_CALLS` (id, phase,
  title, kind, summary, outputShape, `defaultInput`). Pure data, no builder imports. One source.
- **Behavior — server-only — `prompt-lab/registry.ts` (+ `registry/*.ts`).** A
  `Record<PromptLabCallId, PromptBehavior>` keyed by id. One source for build/parse; replaces the switch.

```ts
// type in packages/llm/src/prompts/definition.ts
interface PromptBehavior<TInput, TOutput> {
  build(input: TInput): BuildPromptResult;          // wraps the existing builder(s) verbatim
  parse(raw: string, input: TInput): { parsed: TOutput; note?: string };  // input: char parser reattaches rolled attrs
}
```

- The behavior defs are grouped by area: `registry/recruit.ts` (llm builders), `registry/agent.ts`
  and `registry/world.ts` (runner builders), `registry/helpers.ts` (shared input-coercion / output
  parsing). The registry lives in web because only web can compose llm + runner builders with web
  config (`DEFAULT_ATTRIBUTE_SCHEMA`); llm/runner never import web or each other.
- `prompt-lab.ts` (`'use server'`) is the only importer of the registry. `buildPrompt` is now a
  lookup: `PROMPT_REGISTRY[id].build(input)`, paired with the catalog's `kind` + temperature, and
  `parseOutput = raw => PROMPT_REGISTRY[id].parse(raw, input)`.

Adding a prompt now = one catalog entry (metadata + fixture) + one registry behavior. No switch.

## Future (optional)

- **A/B** — add a `variants` map to `PromptBehavior` + a selector in the lab.
- **i18n / per-saga voice** — thread a `locale` arg through `build` (ties into the planned `next-intl`
  work). Prompt *text* edits remain out of scope unless deliberately localized.
