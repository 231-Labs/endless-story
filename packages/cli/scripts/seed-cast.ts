/**
 * Seed a minimal contesting cast for the drama-engine demo.
 *
 * Directly mints named genesis characters into the saga's first scene via the
 * StorytellerCap — NO voucher / recruit flow (admin IS the storyteller, this is
 * the authority's short path, not a bypass). 孟雲屏 is the named star at the
 * centre; 小生-side performers contend for the capacity-1 partnership slot that
 * `bootstrap` seeded. Public `role:*` tags are affirmed through BudgetEvent
 * outcomes so drama/default POV can consume identity from chain state.
 *
 * Usage:
 *   pnpm --filter @endless-story/cli run seed-cast -- --env testnet
 *   pnpm --filter @endless-story/cli run seed-cast -- --env testnet --only 孟雲屏
 *
 * Flags:
 *   --env devnet|testnet|mainnet|localnet  (required, must match deployment)
 */
import { Transaction } from '@mysten/sui/transactions';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  ENDLESS_STORY_DEPLOYMENT,
  makeSuiClient,
  tx as endlessTx,
  type SuiNetwork,
} from '@endless-story/sdk';
import type { SuiClient } from '@endless-story/sdk/client';
import { loadKeypair } from '@endless-story/sdk/node';
import { requireFlag } from '../src/lib/flags';

const VALID: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);
const INTENT_WITNESS = 6;
const TAG_OP_KIND_ADD = 0;

interface ObjectChange { type: string; objectType?: string; objectId?: string }
function findCreated(changes: ObjectChange[], suffix: string): string[] {
  return changes
    .filter((c) => c.type === 'created' && (c.objectType ?? '').includes(suffix))
    .map((c) => c.objectId!)
    .filter(Boolean);
}

/** One performer: name, blurb, and a 4-attribute profile (deterministic, no RNG). */
interface CastSpec {
  name: string;
  description: string;
  role: string;
  gender: string;
  ageYears: number;
  attrs: { appearance: number; constitution: number; acuity: number; disposition: number };
}

const FULL_CAST: CastSpec[] = [
  {
    name: '孟雲屏',
    description: '梨園中聲名最盛的花旦名角，身段沉靜、眼風極冷，壓軸戲由他定調。誰能與他同台，誰便被全班看見；他越不表態，越使眾人心火暗起。',
    role: '花旦',
    gender: '男',
    ageYears: 28,
    attrs: { appearance: 95, constitution: 62, acuity: 90, disposition: 82 },
  },
  {
    name: '顧驚鴻',
    description: '新近冒頭的小生，眉眼鋒利、勝負心極重。孟雲屏的壓軸搭檔位一旦空出，他便視為證明自己能站上台心的試金石。',
    role: '小生',
    gender: '男',
    ageYears: 24,
    attrs: { appearance: 86, constitution: 72, acuity: 82, disposition: 64 },
  },
  {
    name: '柳生春',
    description: '當紅武小生，嗓如裂帛、身段風流。執意要與名角孟雲屏搭一齣戲，視那壓軸的搭檔位為畢生所願。',
    role: '武小生',
    gender: '男',
    ageYears: 22,
    attrs: { appearance: 88, constitution: 60, acuity: 80, disposition: 72 },
  },
  {
    name: '白牡丹',
    description: '後起之秀的花旦，明豔逼人、心氣極高。她覬覦的是班中話語權與鏡頭，不是孟雲屏的搭檔位。',
    role: '花旦',
    gender: '女',
    ageYears: 20,
    attrs: { appearance: 92, constitution: 55, acuity: 78, disposition: 68 },
  },
];

interface RoleTagParams {
  client: SuiClient;
  signer: Ed25519Keypair;
  packageId: string;
  storytellerCapId: string;
  sagaId: string;
  sceneId: string;
  characterId: string;
  name: string;
  role: string;
}

async function affirmRoleTag(params: RoleTagParams): Promise<{ eventId: string; pushDigest: string; applyDigest: string }> {
  const pushed = await pushRoleTagEvent(params);
  const applyDigest = await resolveAndApplyRoleTag({ ...params, eventId: pushed.eventId });
  return { ...pushed, applyDigest };
}

async function pushRoleTagEvent(params: RoleTagParams): Promise<{ eventId: string; pushDigest: string }> {
  const tx = new Transaction();
  const card = tx.add(
    endlessTx.event.newCardTemplate({
      id: 1,
      intent: INTENT_WITNESS,
      label: '證',
      payload: [],
    }),
  );
  const catalog = tx.makeMoveVec({
    type: `${params.packageId}::event::CardTemplate`,
    elements: [card],
  });
  tx.add(
    endlessTx.event.pushEvent({
      cap: params.storytellerCapId,
      saga: params.sagaId,
      sceneId: params.sceneId,
      title: `身份確認 · ${params.name}`,
      summary: `公開確認 ${params.name} 的行當：${params.role}`,
      scale: 1,
      catalog,
      handSize: 1n,
    }),
  );

  const res = await params.client.signAndExecuteTransaction({
    transaction: tx,
    signer: params.signer,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`push role tag event for ${params.name} failed: ${res.effects?.status?.error}`);
  }
  await params.client.waitForTransaction({ digest: res.digest });

  const eventId = findCreated((res.objectChanges ?? []) as ObjectChange[], '::event::BudgetEvent')[0];
  if (!eventId) throw new Error(`push role tag event for ${params.name} did not create a BudgetEvent`);
  return { eventId, pushDigest: res.digest };
}

async function resolveAndApplyRoleTag(
  params: RoleTagParams & { eventId: string },
): Promise<string> {
  const tx = new Transaction();
  const tagOp = tx.add(
    endlessTx.event.newTagOp({
      characterId: params.characterId,
      kind: TAG_OP_KIND_ADD,
      label: `role:${params.role}`,
    }),
  );
  const tagOps = tx.makeMoveVec({
    type: `${params.packageId}::event::TagOp`,
    elements: [tagOp],
  });
  const outcomes = tx.add(endlessTx.event.outcomesWithTagOps({ tagOps }));
  tx.add(
    endlessTx.event.resolveEvent({
      cap: params.storytellerCapId,
      saga: params.sagaId,
      budgetEvent: params.eventId,
      scene: params.sceneId,
      outcomes,
    }),
  );
  tx.add(
    endlessTx.event.applyTagOp({
      cap: params.storytellerCapId,
      saga: params.sagaId,
      budgetEvent: params.eventId,
      character: params.characterId,
      opIndex: 0n,
    }),
  );

  const res = await params.client.signAndExecuteTransaction({
    transaction: tx,
    signer: params.signer,
    options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`apply role tag for ${params.name} failed: ${res.effects?.status?.error}`);
  }
  await params.client.waitForTransaction({ digest: res.digest });
  return res.digest;
}

async function main() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID.has(env)) throw new Error(`--env must be one of ${[...VALID].join(' / ')}`);

  // --only "名字" mints just that one (idempotent re-runs after a partial mint).
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;
  const CAST = only ? FULL_CAST.filter((c) => c.name === only) : FULL_CAST;
  if (only && CAST.length === 0) throw new Error(`--only "${only}" matched no cast member`);

  const d = ENDLESS_STORY_DEPLOYMENT;
  if (d.network !== env) {
    throw new Error(`contract-ids network is "${d.network}" but --env ${env}. Run bootstrap --env ${env} first.`);
  }
  if (!d.packageId || !d.sagaId || !d.sceneIds?.[0]) {
    throw new Error('deployment missing packageId / sagaId / sceneIds — run deploy + bootstrap first.');
  }

  const signer = loadKeypair();
  const admin = signer.toSuiAddress();
  const client = makeSuiClient({ network: env });
  const scene = d.sceneIds[0]; // both performers share scene 0 → they contend

  console.log('seed-cast · drama demo');
  console.log(`   env      ${env}`);
  console.log(`   saga     ${d.sagaId}`);
  console.log(`   scene    ${scene}`);
  console.log(`   admin    ${admin}\n`);

  const minted: { name: string; role: string; characterId: string; roleEventId: string }[] = [];

  for (const c of CAST) {
    const tx = new Transaction();
    const physical = tx.add(
      endlessTx.character.newPhysicalFacts({
        species: 'human',
        gender: c.gender,
        body: '勻稱',
        ageYears: c.ageYears,
      }),
    );
    const profile = tx.add(
      endlessTx.character.newCharacterProfile({
        name: c.name,
        description: c.description,
        physicalFacts: physical,
      }),
    );
    const mediaAssets = tx.makeMoveVec({ elements: [], type: `${d.packageId}::character::MediaAsset` });
    const attrPairs: [string, number][] = [
      ['appearance', c.attrs.appearance],
      ['constitution', c.attrs.constitution],
      ['acuity', c.attrs.acuity],
      ['disposition', c.attrs.disposition],
    ];
    const attrElements = attrPairs.map(([key, value]) =>
      tx.add(endlessTx.character.newAttributeValue({ key, value: BigInt(value), seed: [] })),
    );
    const attributes = tx.makeMoveVec({
      elements: attrElements,
      type: `${d.packageId}::character::AttributeValue`,
    });

    const caps = tx.add(
      endlessTx.character.mintGenesisCharacter({
        cap: d.storytellerCapId,
        saga: d.sagaId,
        world: d.worldId,
        scene,
        profile,
        mediaAssets,
        attributes,
        ownerRecipient: admin,
      }),
    );
    // mint returns (OwnerCap, ControlCap) — admin keeps both for the demo.
    tx.transferObjects([caps[0], caps[1]], admin);

    const res = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: { showEffects: true, showObjectChanges: true },
    });
    if (res.effects?.status?.status !== 'success') {
      throw new Error(`mint ${c.name} failed: ${res.effects?.status?.error}`);
    }
    // mint takes &mut Saga + &mut Scene → their versions advance. Wait for this tx to
    // finalize before the next mint, or the shared Saga/Scene/Cap object versions clash
    // ("object ... unavailable for consumption"). Serial mints, one settled at a time.
    await client.waitForTransaction({ digest: res.digest });
    const characterId = findCreated((res.objectChanges ?? []) as ObjectChange[], '::character::Character')[0];
    if (!characterId) throw new Error(`mint ${c.name} did not create a Character`);

    const roleTag = await affirmRoleTag({
      client,
      signer,
      packageId: d.packageId,
      storytellerCapId: d.storytellerCapId,
      sagaId: d.sagaId,
      sceneId: scene,
      characterId,
      name: c.name,
      role: c.role,
    });
    minted.push({ name: c.name, role: c.role, characterId, roleEventId: roleTag.eventId });
    console.log(`   ✓ ${c.name}  ${characterId}  role:${c.role}`);
  }

  console.log('\n[done] cast seeded — 孟雲屏 is present; 小生-side rivals can contend for the partnership slot.');
  console.log('   next: pnpm --filter @endless-story/cli run world-loop -- --max=3');
  console.log('   characters:');
  for (const m of minted) console.log(`     ${m.name}  ${m.characterId}  role:${m.role}  via ${m.roleEventId}`);
}

main().catch((e) => {
  console.error('[seed-cast] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
