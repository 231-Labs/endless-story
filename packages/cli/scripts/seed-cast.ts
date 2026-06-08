/**
 * Debug-only helper for the Spring Snow drama-engine demo cast.
 *
 * Normal demo setup should NOT use this script to mint characters. Direct mint
 * bypasses the recruitment wizard's portrait / persona / setting-gallery flow,
 * leaving characters with no base image. Use `/admin/deploy` ③ seed recruitments,
 * then mint the main cast through the user-facing flow.
 *
 * This script remains as an explicit escape hatch:
 *   - `--tag-existing` applies role:* tags to same-name characters you minted
 *     through the normal flow.
 *   - `--allow-no-media` permits the old no-image direct mint path for local
 *     debugging only.
 *
 * Usage:
 *   pnpm --filter @endless-story/cli run seed-cast -- --env testnet --tag-existing
 *   pnpm --filter @endless-story/cli run seed-cast -- --env testnet --allow-no-media
 *   pnpm --filter @endless-story/cli run seed-cast -- --env testnet --allow-no-media --only <name>
 *
 * Flags:
 *   --env devnet|testnet|mainnet|localnet  (required, must match deployment)
 *   --tag-existing                         apply missing role:* tags to existing same-name cast; do not mint
 *   --allow-no-media                       debug only: mint without portrait/media assets
 */
import { Transaction } from '@mysten/sui/transactions';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  ENDLESS_STORY_DEPLOYMENT,
  makeSuiClient,
  read,
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
    name: '溫照棠',
    description: '春雪社台柱花旦，一折悲戲能唱出亮色，也懂得把沉默賣成滿座屏息。她厭惡被當成苦命招牌，真正想守住的是女班自己定價、自己選搭檔的權利。',
    role: '花旦',
    gender: '女',
    ageYears: 27,
    attrs: { appearance: 94, constitution: 64, acuity: 88, disposition: 84 },
  },
  {
    name: '陸明漪',
    description: '春雪社坤生，女扮少年郎時眉眼清亮，台下又懂新式合同與報紙語氣。她想接住溫照棠下一折戲，也想證明坤生不是上海噱頭。',
    role: '坤生 / 小生',
    gender: '女',
    ageYears: 24,
    attrs: { appearance: 88, constitution: 70, acuity: 86, disposition: 70 },
  },
  {
    name: '江鴻笙',
    description: '外班客座乾生，從大世界男班戲台轉來，嗓子穩、台步老辣，嘴上說不信女班小生能撐大本戲，心裡卻知道春雪社的台口比他想像得難站。',
    role: '客座乾生 / 男小生',
    gender: '男',
    ageYears: 26,
    attrs: { appearance: 84, constitution: 76, acuity: 78, disposition: 62 },
  },
  {
    name: '沈照夜',
    description: '春雪社刀馬旦，京班武場出身，穿靠使槍時像把整座雲錦台劈亮。她不是逞勇的打女，越是熱鬧武場，越藏著她不肯說的舊傷。',
    role: '刀馬旦 / 武旦',
    gender: '女',
    ageYears: 25,
    attrs: { appearance: 86, constitution: 88, acuity: 74, disposition: 76 },
  },
  {
    name: '何晚舟',
    description: '春雪社主胡高手，不上台卻掌全台呼吸。一弓能托住溫照棠失音，一個停頓也能讓刀馬旦翻身前的空氣忽然發緊。',
    role: '主胡高手',
    gender: '女',
    ageYears: 31,
    attrs: { appearance: 72, constitution: 68, acuity: 92, disposition: 80 },
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

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function characterName(row: unknown): string | null {
  return ((row as { json?: { profile?: { name?: string } } })?.json?.profile?.name) ?? null;
}

function characterTags(row: unknown): string[] {
  const tags = (row as { json?: { tags?: Array<{ label?: string }> } })?.json?.tags ?? [];
  return tags.map((t) => t.label).filter((t): t is string => Boolean(t));
}

async function tagExistingCast(params: {
  client: SuiClient;
  signer: Ed25519Keypair;
  packageId: string;
  storytellerCapId: string;
  sagaId: string;
  sceneId: string;
  cast: CastSpec[];
}): Promise<void> {
  const listed = await read.character.listMintedCharacters(params.client, params.packageId, {
    sagaId: params.sagaId,
  });
  const rows = listed.summaries.map((summary, index) => ({
    characterId: summary.characterId,
    row: listed.characters[index],
  }));

  let applied = 0;
  for (const spec of params.cast) {
    const matches = rows.filter(({ row }) => characterName(row) === spec.name);
    if (matches.length === 0) {
      console.warn(`   ! ${spec.name}: no existing character found`);
      continue;
    }
    for (const match of matches) {
      const want = `role:${spec.role}`;
      if (characterTags(match.row).includes(want)) {
        console.log(`   · ${spec.name}  ${match.characterId} already ${want}`);
        continue;
      }
      const roleTag = await affirmRoleTag({
        client: params.client,
        signer: params.signer,
        packageId: params.packageId,
        storytellerCapId: params.storytellerCapId,
        sagaId: params.sagaId,
        sceneId: params.sceneId,
        characterId: match.characterId,
        name: spec.name,
        role: spec.role,
      });
      applied += 1;
      console.log(`   ✓ ${spec.name}  ${match.characterId}  ${want} via ${roleTag.eventId}`);
    }
  }
  console.log(`\n[done] existing cast role tags applied: ${applied}`);
}

async function main() {
  const env = requireFlag('--env') as SuiNetwork;
  if (!VALID.has(env)) throw new Error(`--env must be one of ${[...VALID].join(' / ')}`);

  // --only "<name>" mints just that one (idempotent re-runs after a partial mint).
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;
  const tagExisting = hasFlag('--tag-existing');
  const allowNoMedia = hasFlag('--allow-no-media');
  const CAST = only ? FULL_CAST.filter((c) => c.name === only) : FULL_CAST;
  if (only && CAST.length === 0) throw new Error(`--only "${only}" matched no cast member`);

  const d = ENDLESS_STORY_DEPLOYMENT;
  if (d.network !== env) {
    throw new Error(`contract-ids network is "${d.network}" but --env ${env}. Run bootstrap --env ${env} first.`);
  }
  if (!d.packageId || !d.sagaId || !d.sceneIds?.[0]) {
    throw new Error('deployment missing packageId / sagaId / sceneIds — run deploy + bootstrap first.');
  }

  if (!tagExisting && !allowNoMedia) {
    console.log('[seed-cast] direct mint disabled by default.');
    console.log('   Reason: direct genesis mint has empty mediaAssets and bypasses portrait/persona/setting-gallery generation.');
    console.log('   Use `/admin/deploy` ③ seed 職缺, then mint cast through the normal recruitment wizard.');
    console.log('   After normal mint, run this only if needed:');
    console.log('     pnpm --filter @endless-story/cli run seed-cast -- --env <env> --tag-existing');
    console.log('   Debug escape hatch for no-image mints: add --allow-no-media');
    return;
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

  if (tagExisting) {
    await tagExistingCast({
      client,
      signer,
      packageId: d.packageId,
      storytellerCapId: d.storytellerCapId,
      sagaId: d.sagaId,
      sceneId: scene,
      cast: CAST,
    });
    return;
  }

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

  console.log('\n[done] cast seeded — 溫照棠 is present; 小生-side rivals can contend for the partnership slot.');
  console.log('   next: pnpm --filter @endless-story/cli run world-loop -- --max=3');
  console.log('   characters:');
  for (const m of minted) console.log(`     ${m.name}  ${m.characterId}  role:${m.role}  via ${m.roleEventId}`);
}

main().catch((e) => {
  console.error('[seed-cast] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
