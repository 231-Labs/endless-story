/**
 * Phase 1+ reset entry — stub.
 *
 * Once bootstrap.ts works, reset.ts will:
 *   1. Backup ~/.endless-wuxia/ (with --backup)
 *   2. Clean memories/gazette/chapters/etc. (preserve keypair + AI keys)
 *   3. Redeploy via deploy.ts
 *   4. Reseed via bootstrap.ts
 *   5. Rebuild dist + .next
 *
 * Phase 0: this script exits with a hint.
 */
console.error(
  'reset.ts is a Phase 1+ entry point. For Phase 0, just re-run:\n' +
    '  pnpm --filter @endless-story/cli deploy --env <network>',
);
process.exit(2);
