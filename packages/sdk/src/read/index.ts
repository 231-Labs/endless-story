/**
 * View queries — read-only on-chain data fetchers.
 *
 * One file per Move module. Each query takes a `SuiClient` + the relevant
 * object ID(s) and returns a parsed TypeScript shape (struct fields decoded).
 *
 * **Pattern:** wrap `client.getObject` / `getDynamicFields` / `multiGetObjects`
 * with type-safe decoders generated from bcs schemas.
 *
 * Phase 1 modules land here in order matching tx/.
 */

// Phase 0: nothing yet.
// export * as character from './character';
// export * as world from './world';
// export * as saga from './saga';

export const _PHASE_0_PLACEHOLDER = true as const;
