/**
 * Currency view queries — none (no module-level user-facing object).
 *
 * The ENDLESS coin type lives as `Coin<ENDLESS>` owned objects; read those
 * via standard `client.core.getCoins({ owner, coinType })` instead.
 * Re-exported for `raw.CurrencyMinted` event parsing.
 */
import * as gen from '../generated/endless_story/currency.js';

export { gen as raw };
