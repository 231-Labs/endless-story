/**
 * Seed a minimal contesting cast for the drama-engine demo.
 *
 * Directly mints named genesis characters into the saga's first scene via the
 * StorytellerCap — NO voucher / recruit flow (admin IS the storyteller, this is
 * the authority's short path, not a bypass). Two performers in ONE scene so they
 * contend for the capacity-1 孟雲屏 partnership slot that `bootstrap` seeded:
 * `defaultDesiresForCast` then auto-derives a "want the slot" desire for each
 * (capacity 1 < cast 2 → contested), and the tick-loop drama phase lights up.
 *
 * Usage:
 *   pnpm --filter @endless-story/cli run seed-cast --env testnet
 *
 * Flags:
 *   --env devnet|testnet|mainnet|localnet  (required, must match deployment)
 */
import { Transaction } from '@mysten/sui/transactions';
import {
  ENDLESS_STORY_DEPLOYMENT,
  makeSuiClient,
  tx as endlessTx,
  type SuiNetwork,
} from '@endless-story/sdk';
import { loadKeypair } from '@endless-story/sdk/node';
import { requireFlag } from '../src/lib/flags';

const VALID: ReadonlySet<SuiNetwork> = new Set(['devnet', 'testnet', 'mainnet', 'localnet']);

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
  gender: string;
  ageYears: number;
  attrs: { appearance: number; constitution: number; acuity: number; disposition: number };
}

const FULL_CAST: CastSpec[] = [
  {
    name: '柳生春',
    description: '當紅青衣，嗓如裂帛、身段風流。執意要與名角孟雲屏搭一齣戲，視那壓軸的搭檔位為畢生所願。',
    gender: '男',
    ageYears: 22,
    attrs: { appearance: 88, constitution: 60, acuity: 80, disposition: 72 },
  },
  {
    name: '白牡丹',
    description: '後起之秀的花旦，明豔逼人、心氣極高。同樣覬覦與孟雲屏同台的機會，不甘屈居人後。',
    gender: '女',
    ageYears: 20,
    attrs: { appearance: 92, constitution: 55, acuity: 78, disposition: 68 },
  },
];

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

  const minted: { name: string; characterId: string }[] = [];

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
    minted.push({ name: c.name, characterId });
    console.log(`   ✓ ${c.name}  ${characterId}`);
  }

  console.log('\n[done] cast seeded — both in scene 0, contending for the 孟雲屏 partnership slot.');
  console.log('   next: pnpm --filter @endless-story/cli run world-loop --env ' + env + ' -- --max-ticks 3');
  console.log('   characters:');
  for (const m of minted) console.log(`     ${m.name}  ${m.characterId}`);
}

main().catch((e) => {
  console.error('[seed-cast] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
