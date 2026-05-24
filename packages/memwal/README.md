# @endless-story/memwal

Vendored fork of [`@mysten-incubation/memwal`](https://github.com/MystenLabs/MemWal)
`MemWalManual` client, patched to use our `endless_story::character` SEAL
access policy instead of the upstream `memwal::account::seal_approve`
(owner/delegate) model.

## Vendor source

- Upstream tag: `@mysten-incubation/memwal@0.0.4`
- Files copied from `packages/sdk/src/`: `manual.ts`, `utils.ts`, `types.ts`
- `index.ts` mirrors upstream `manual-entry.ts` (manual-mode export only —
  account / AI entry points are not vendored)

## Why fork instead of wrapping

`MemWalManual` hard-codes the `seal_approve` target and the SEAL id layout
inside private methods (`sealEncrypt` / the recall loop's `tx.moveCall`).
Neither is reachable via config or subclass — patching the file is the only
option. See `docs/memwal_sdk_patch.md` (parent repo) for the spec.

## Changes against upstream

| Scope | Status | File | What |
|-------|--------|------|------|
| B1 | done | — | Vendor v0.0.4 sources as-is, build clean |
| B2 | done | `src/manual.ts`, `src/types.ts` | `sealEncrypt` id layout → `nsHex + bcs(characterId)`; add `characterId` to config |
| B3 | done | `src/manual.ts`, `src/types.ts` | `recallManual` moveCall → `character::seal_approve_control`/`_owner`; add `controlCapId`/`ownerCapId` to config (exactly one); constructor enforces |
| B4 | pending | new files | Adapter wrappers (`SagaMemoryClient` / `OwnerAuditClient`) |
