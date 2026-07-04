/**
 * Process-level saga-soul override for experiments, installed here instead of
 * threading a soul argument through tick-loop → pov-core → runner. The runner
 * merges it over the chain-derived Tier-1 soul; null (default) keeps production
 * byte-identical.
 */
import type { SagaSoul } from '@endless-story/runner';

let _override: SagaSoul | null = null;

export function setSagaSoulOverride(soul: SagaSoul | null): void {
    _override = soul;
}

export function getSagaSoulOverride(): SagaSoul | null {
    return _override;
}
