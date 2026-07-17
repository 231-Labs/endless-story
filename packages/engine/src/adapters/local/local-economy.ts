/**
 * LocalEconomy — the local-first EconomyPort. All rules live in the pure core
 * (core/season-economy.ts over @endless-story/economy); this adapter only names
 * the seam a future chain-settlement adapter would replace. Character reasoning
 * and world rules never change with the adapter (handoff: the Sui adapter swaps
 * persistence/settlement boundaries only).
 */

import {
    auditSeasonEconomy,
    commitEconomyCommand,
    economyPerceptFor,
    settleSeasonDay,
    type CommitEconomyCommandRequest,
    type EconomyCommandOutcome,
    type EconomyPort,
    type SeasonDaySettleReport,
    type SettleSeasonDayRequest,
} from '../../core/season-economy.ts';
import type { WorldState } from '../../world-state.ts';

export class LocalEconomy implements EconomyPort {
    commitCommand(world: WorldState, req: CommitEconomyCommandRequest): EconomyCommandOutcome {
        return commitEconomyCommand(world, req);
    }

    settleDay(world: WorldState, req: SettleSeasonDayRequest): SeasonDaySettleReport {
        return settleSeasonDay(world, req);
    }

    projectFor(world: WorldState, characterId: string, sceneId?: string): string | undefined {
        return economyPerceptFor(world, characterId, sceneId);
    }

    audit(world: WorldState): string[] {
        return auditSeasonEconomy(world);
    }
}
