/**
 * Saga-soul override seam — the observatory counterpart to event-planner's
 * `setFramingOverride`. The tick loop reaches the POV writer (pov-core → runner
 * characterWorker.runOnce) through many layers, so rather than thread a soul
 * argument through all of them, an experiment installs a process-level override
 * here before running ticks; pov-core reads it and passes it as `input.sagaSoul`.
 *
 * runner merges it OVER the chain-derived Tier-1 soul (`{...chainSoul, ...sagaSoul}`),
 * so an experiment can tilt prose colour (`toneRegister`) and closeness
 * (`emotionalStance`) without those living on chain. Default null ⇒ production and
 * any non-opted-in run are byte-identical to before.
 */
import type { SagaSoul } from '@endless-story/runner';

let _override: SagaSoul | null = null;

/** Install (or clear with null) the saga soul the next POV chapters should use. */
export function setSagaSoulOverride(soul: SagaSoul | null): void {
    _override = soul;
}

/** The currently installed override, or null when none (the common case). */
export function getSagaSoulOverride(): SagaSoul | null {
    return _override;
}
