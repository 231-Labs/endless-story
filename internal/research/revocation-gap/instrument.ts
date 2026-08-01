/**
 * Instrumentation: wrap SceneAgentPort + patch grantAccess to observe residual
 * attempts and third-party re-admissions without changing engine enforcement.
 */

import type * as Runner from '@endless-story/runner';
import type { SceneAgentPort } from '../../../packages/engine/src/ports.ts';
import type { WorldState } from '../../../packages/engine/src/world-state.ts';
import { IDS, NAMES } from './ids.ts';
import { wantImpliesHomeAtS, type TickObservation } from './metrics.ts';

export interface InstrumentState {
  /** Move/knock proposals by T targeting S this tick. */
  attemptThisTick: boolean;
  /** grantAccess(S,T) or keyFor===S handoff to T by O/N this tick. */
  admissionThisTick: boolean;
  /** Object fetch: O/N moved an object from S into T's hands. */
  resourceFetchThisTick: boolean;
}

export function createInstrumentState(): InstrumentState {
  return {
    attemptThisTick: false,
    admissionThisTick: false,
    resourceFetchThisTick: false,
  };
}

export function resetTickFlags(state: InstrumentState): void {
  state.attemptThisTick = false;
  state.admissionThisTick = false;
  state.resourceFetchThisTick = false;
}

/** Patch world.grantAccess to flag third-party re-admission of T into S. */
export function patchGrantAccess(world: WorldState, state: InstrumentState): () => void {
  const original = world.grantAccess.bind(world);
  world.grantAccess = (sceneId: string, guestId: string, kind) => {
    if (sceneId === IDS.rental && guestId === IDS.tenant) {
      state.admissionThisTick = true;
    }
    return original(sceneId, guestId, kind);
  };
  return () => {
    world.grantAccess = original;
  };
}

/**
 * Wrap an agent so T→S move/knock proposals and key handoffs are recorded.
 * Does not alter the inner agent's decisions.
 */
export function instrumentAgent(inner: SceneAgentPort, state: InstrumentState): SceneAgentPort {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'decideMove') {
        return async (input: Runner.characterAgent.MoveDecideInput) => {
          const result = await target.decideMove(input);
          if (input.name === NAMES.tenant && result.move && result.targetSceneId === IDS.rental) {
            state.attemptThisTick = true;
          }
          return result;
        };
      }
      if (prop === 'actBeat') {
        return async (input: Runner.characterAgent.ActBeatInput) => {
          const result = await target.actBeat(input);
          if (input.name === NAMES.tenant) {
            for (const eff of result.objectEffects ?? []) {
              if (eff.objectId === IDS.key || eff.toScene === IDS.rental) {
                state.attemptThisTick = true;
              }
            }
          }
          if (input.name === NAMES.owner || input.name === NAMES.neighbor) {
            for (const eff of result.objectEffects ?? []) {
              const toTenant = eff.carrierName === NAMES.tenant;
              if (!toTenant) continue;
              if (eff.objectId === IDS.key) state.admissionThisTick = true;
              if (eff.toScene && eff.toScene !== IDS.rental) {
                state.resourceFetchThisTick = true;
                state.admissionThisTick = true;
              }
            }
          }
          return result;
        };
      }
      if (prop === 'decideAdmit') {
        const orig = target.decideAdmit;
        if (!orig) return undefined;
        return async (input: Parameters<NonNullable<SceneAgentPort['decideAdmit']>>[0]) => {
          const reply = await orig.call(target, input);
          if (
            reply?.admit === true &&
            (input.occupantName === NAMES.owner || input.occupantName === NAMES.neighbor) &&
            input.knockerName === NAMES.tenant &&
            input.sceneName === NAMES.rental
          ) {
            state.admissionThisTick = true;
          }
          return reply;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? (value as Function).bind(target) : value;
    },
  });
}

export function observeWorldTick(
  world: WorldState,
  state: InstrumentState,
  tickIndex: number,
  monitor: boolean,
): TickObservation {
  const homeRef = world.data.homeByChar[IDS.tenant] === IDS.rental;
  const wantRef = world
    .liveWantsOf(IDS.tenant)
    .some((w) => wantImpliesHomeAtS(w.desc, NAMES.rental));
  const illicit =
    !world.canEnter(IDS.tenant, IDS.rental) && world.data.roster[IDS.tenant] === IDS.rental;

  return {
    tickIndex,
    absoluteTick: world.data.clock.currentTick,
    attempt: state.attemptThisTick,
    thirdPartyAdmission: state.admissionThisTick || state.resourceFetchThisTick,
    selfReference: homeRef || wantRef,
    homeByCharRef: homeRef,
    wantHomeRef: wantRef,
    illicitPresence: monitor ? illicit : false,
  };
}
