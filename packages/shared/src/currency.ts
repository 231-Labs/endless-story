/**
 * ENDLESS coin constants — single source of truth.
 *
 * Decimals MUST match `currency.move` (`new_currency_with_otw(witness, 6, …)`):
 * 6, stablecoin-style. 1 ENDLESS = 1_000_000 base units. If you change this,
 * you are redeploying the coin — update the contract first, never just here.
 */
export const ENDLESS_DECIMALS = 6;

/** Base units per 1 ENDLESS (10^ENDLESS_DECIMALS). */
export const ENDLESS_BASE_UNITS = 1_000_000n;
