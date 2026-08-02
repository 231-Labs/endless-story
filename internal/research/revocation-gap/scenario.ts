/**
 * Minimal research seed: private rental S, owner O, tenant T (via seedHousing),
 * third party N with standing access, one public meeting place.
 * research-minimal: strictStructured=true, all B/C flags off.
 */

import { makeClock } from '../../../packages/engine/src/adapters/local/clock.ts';
import { seedHousing } from '../../../packages/engine/src/core/housing.ts';
import { newWant } from '../../../packages/engine/src/core/want-core.ts';
import { auditSeasonEconomy, type SeasonEconomyData } from '../../../packages/engine/src/core/season-economy.ts';
import { WorldState, type CastMember, type WorldStateData } from '../../../packages/engine/src/world-state.ts';
import { IDS, NAMES } from './ids.ts';

function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
  return {
    id,
    name,
    persona: `${name}——撤銷落差 pilot 的最小角色。`,
    gender: id === IDS.tenant ? '男' : '女',
    role: id === IDS.owner ? '屋主' : id === IDS.tenant ? '租客' : '親人',
    state: { fatigue: 0, hunger: 0, mood: 0 },
    coreIdentity: [],
    relationshipView: {},
    ...over,
  };
}

function acct(
  id: string,
  label: string,
  openingYuan: number,
  ownerType: 'character' | 'troupe' | 'business' = 'character',
) {
  return {
    id,
    ownerType,
    label,
    available: (BigInt(openingYuan) * 100n).toString(),
    reserved: '0',
    dailyFixedCost: '0',
    authorizedSpenderIds: [] as string[],
  };
}

function buildEconomy(): SeasonEconomyData {
  const accounts = [
    acct('market', '市面', 0, 'business'),
    acct('troupe', '班庫', 0, 'troupe'),
    acct(IDS.owner, NAMES.owner, 20),
    acct(IDS.tenant, NAMES.tenant, 10),
    acct(IDS.neighbor, NAMES.neighbor, 10),
  ];
  const accMap: Record<string, (typeof accounts)[number]> = {};
  let injected = 0n;
  for (const a of accounts) {
    accMap[a.id] = a;
    injected += BigInt(a.available) + BigInt(a.reserved);
  }
  return {
    unitLabel: '圓',
    subunitsPerUnit: 100,
    marketAccountId: 'market',
    troupeAccountId: 'troupe',
    noticeSceneName: NAMES.street,
    wages: [],
    catalog: [],
    contractObjectIds: {},
    state: {
      day: 1,
      accounts: accMap,
      ledger: [],
      injected: injected.toString(),
      settledDays: [],
    },
    contracts: {},
  };
}

/**
 * Build the shared opening world. Caller should assert canEnter for T and N.
 * Rentless lease — conservation stays trivial; auditSeasonEconomy must be [].
 */
export function buildScenarioWorld(): WorldState {
  const owner = member(IDS.owner, NAMES.owner, {
    relationshipView: {
      [IDS.tenant]: `向我租了「${NAMES.rental}」的住戶，有正契可出入。`,
      [IDS.neighbor]: '家裡親人，也拿過廂房的備用鑰匙。',
    },
  });
  const tenant = member(IDS.tenant, NAMES.tenant, {
    relationshipView: {
      [IDS.owner]: `我向「${NAMES.owner}」租住「${NAMES.rental}」，那是我的住處。`,
      [IDS.neighbor]: `「${NAMES.neighbor}」也常來「${NAMES.rental}」。`,
    },
    plan: `守住「${NAMES.rental}」這處住處，把日子過穩。`,
  });
  const neighbor = member(IDS.neighbor, NAMES.neighbor, {
    relationshipView: {
      [IDS.tenant]: `住在「${NAMES.rental}」的租客，我認得他住處。`,
      [IDS.owner]: '家人；廂房是他家產業。',
    },
  });

  const base: WorldStateData = {
    sagaId: 'revocation-gap-pilot',
    sagaPremise: '撤銷落差先導：私宅、租約、鑰匙、第三人放行。',
    cast: [owner, tenant, neighbor],
    scenes: [
      { id: IDS.street, name: NAMES.street, privacyLevel: 1, description: '眾人可會面的街口。' },
      { id: IDS.rental, name: NAMES.rental, privacyLevel: 3, description: '一處私密廂房。' },
      { id: IDS.ownerHome, name: NAMES.ownerHome, privacyLevel: 3, description: '屋主自住的主宅。' },
    ],
    // Warm-up co-presence: all three start on the public street so Fake/LLM can
    // accumulate social memory; T's night home remains the rental via homeByChar.
    roster: {
      [IDS.owner]: IDS.street,
      [IDS.tenant]: IDS.street,
      [IDS.neighbor]: IDS.street,
    },
    homeByChar: {
      [IDS.owner]: IDS.ownerHome,
      [IDS.tenant]: IDS.rental,
      [IDS.neighbor]: IDS.street,
    },
    workByChar: {
      [IDS.owner]: IDS.street,
      [IDS.tenant]: IDS.street,
      [IDS.neighbor]: IDS.street,
    },
    wants: [
      newWant({
        characterId: IDS.tenant,
        layer: '住處',
        desc: `守住我在「${NAMES.rental}」的日子，那是我的住處。`,
        weight: 0.7,
        sat: 0.3,
        resistance: 2,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
        semanticTags: ['affection'],
      }),
      newWant({
        characterId: IDS.tenant,
        layer: '愛',
        desc: `還想與「${NAMES.owner}」把租住的事說清楚。`,
        target: IDS.owner,
        weight: 0.55,
        sat: 0.35,
        resistance: 2,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
        semanticTags: ['affection'],
      }),
      newWant({
        characterId: IDS.owner,
        layer: '事務',
        desc: '把產業與人情打理好。',
        weight: 0.4,
        sat: 0.5,
        resistance: 2,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
      }),
      newWant({
        characterId: IDS.neighbor,
        layer: '親情',
        desc: `照看「${NAMES.owner}」家裡的廂房與租客。`,
        target: IDS.tenant,
        weight: 0.45,
        sat: 0.4,
        resistance: 2,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
        semanticTags: ['affection'],
      }),
    ],
    edges: {
      [IDS.owner]: {
        [IDS.tenant]: { tone: '主客', weight: 0.5 },
        [IDS.neighbor]: { tone: '親人', weight: 0.8 },
      },
      [IDS.tenant]: {
        [IDS.owner]: { tone: '房東', weight: 0.5 },
        [IDS.neighbor]: { tone: '相識', weight: 0.4 },
      },
      [IDS.neighbor]: {
        [IDS.owner]: { tone: '親人', weight: 0.8 },
        [IDS.tenant]: { tone: '租客', weight: 0.4 },
      },
    },
    bonds: [],
    establishedPairs: [],
    clock: makeClock(6, 0),
    lastMovedTickByChar: {},
    dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
    contestedResources: [],
    objects: [],
    economy: buildEconomy(),
    strictStructured: true,
    accessSeeded: true,
    // B/C flags deliberately absent (research-minimal).
  };

  const world = new WorldState(base);

  seedHousing(world, [
    { sceneName: NAMES.ownerHome, ownerNames: [NAMES.owner] },
    {
      sceneName: NAMES.rental,
      ownerNames: [NAMES.owner],
      lease: {
        tenantName: NAMES.tenant,
        keyObjectId: IDS.key,
        keyLabel: `${NAMES.rental}的門鑰`,
      },
    },
  ]);

  // N: legitimate relation to S — standing use-right + known spare (no second object;
  // ledger standing is enough for canEnter(N,S) === true).
  world.grantAccess(IDS.rental, IDS.neighbor, 'standing');

  const leaks = auditSeasonEconomy(world);
  if (leaks.length) {
    throw new Error(`[revocation-gap] economy does not conserve at seed: ${leaks.join('; ')}`);
  }
  if (!world.canEnter(IDS.tenant, IDS.rental)) {
    throw new Error('[revocation-gap] tenant must canEnter(S) after seedHousing');
  }
  if (!world.canEnter(IDS.neighbor, IDS.rental)) {
    throw new Error('[revocation-gap] neighbor must canEnter(S) after standing grant');
  }
  if (world.data.homeByChar[IDS.tenant] !== IDS.rental) {
    throw new Error('[revocation-gap] homeByChar[T] must be S');
  }
  if (!world.data.leases?.[IDS.rental] || world.data.leases[IDS.rental].tenantId !== IDS.tenant) {
    throw new Error('[revocation-gap] leases[S] must name tenant T');
  }
  const key = world.objectById(IDS.key);
  if (!key || key.keyFor !== IDS.rental || key.carriedBy !== IDS.tenant) {
    throw new Error('[revocation-gap] physical key must be carried by T and keyFor S');
  }

  return world;
}

/** Deep-clone world data for an in-memory checkpoint (no disk). */
export function cloneWorld(world: WorldState): WorldState {
  return new WorldState(structuredClone(world.data));
}
