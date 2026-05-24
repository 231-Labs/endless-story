/**
 * Phase 1+ bootstrap entry — stub.
 *
 * Once world/saga/scene/character modules are migrated (Phase 1.2–1.5),
 * this script:
 *   1. Reads packageId from contract-ids.ts
 *   2. Loads story seed JSON
 *   3. PTB: create World → create Saga → anchor Scenes → mint Characters
 *   4. Transfer AdminCap to runner address
 *   5. Re-writes contract-ids.ts with full snapshot
 *
 * Phase 0: this script exits with a hint to use deploy.ts.
 */
console.error(
  'bootstrap.ts is a Phase 1+ entry point. The Move modules it bootstraps\n' +
    '(world, saga, scene) have not migrated yet. For Phase 0 publish, use:\n' +
    '  pnpm --filter @endless-story/cli deploy --env <network>',
);
process.exit(2);
