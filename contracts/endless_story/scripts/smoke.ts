/**
 * Smoke test for `endless_story::character` on devnet.
 *
 * 走完整託管生命週期，驗證 epoch 撤銷機制鏈上行為跟 Move 測試一致：
 *   1. mint character + share + transfer OwnerCap
 *   2. issue ControlCap A（epoch=1）
 *   3. reassign_saga → issue ControlCap B（epoch=2，character.control_epoch=2）
 *   4. 讀回各物件欄位驗證 capA epoch=1 已 stale、capB epoch=2 為當前。
 *
 * 自動從 ~/.sui/sui_config 載 active address keypair。
 */
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PACKAGE_ID =
  '0xf33b108c88639da40b92b89a441daded94e8bfbad4b2502fa8fe330b2bc8ad4c';
const FULLNODE_URL = 'https://fullnode.devnet.sui.io:443';
const MAX_ATTEMPTS = 5;

function loadActiveKeypair(): Ed25519Keypair {
  const home = homedir();
  const clientYaml = readFileSync(
    join(home, '.sui/sui_config/client.yaml'),
    'utf-8',
  );
  const match = clientYaml.match(
    /^active_address:\s*['"]?(0x[0-9a-fA-F]+)['"]?$/m,
  );
  if (!match) throw new Error('client.yaml: active_address not found');
  const activeAddress = match[1];

  const keystore: string[] = JSON.parse(
    readFileSync(join(home, '.sui/sui_config/sui.keystore'), 'utf-8'),
  );
  for (const encoded of keystore) {
    const bytes = fromBase64(encoded);
    // sui.keystore 每筆是 base64([scheme_byte, ...32-byte secret_key])
    // ed25519 scheme = 0x00
    if (bytes[0] !== 0) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (kp.getPublicKey().toSuiAddress() === activeAddress) {
      console.log(`[smoke] active keypair: ${activeAddress}`);
      return kp;
    }
  }
  throw new Error(`No ed25519 keypair found for ${activeAddress}`);
}

async function execWithRetry(
  client: SuiClient,
  keypair: Ed25519Keypair,
  txBuilder: () => Transaction,
  label: string,
) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const tx = txBuilder();
      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });
      if (result.effects?.status.status !== 'success') {
        throw new Error(
          `Execution status: ${JSON.stringify(result.effects?.status)}`,
        );
      }
      await client.waitForTransaction({ digest: result.digest });
      console.log(`[${label}] ✓ ${result.digest}`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        `[${label}] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg.slice(0, 180)}`,
      );
      if (attempt === MAX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('unreachable');
}

function findCreated(
  result: Awaited<ReturnType<SuiClient['signAndExecuteTransaction']>>,
  typeSuffix: string,
): string | undefined {
  return result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType.endsWith(typeSuffix),
  )?.objectId;
}

async function readField(
  client: SuiClient,
  id: string,
  field: string,
): Promise<string> {
  const obj = await client.getObject({ id, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== 'moveObject') {
    throw new Error(`Object ${id} has no readable content`);
  }
  return String((content.fields as Record<string, unknown>)[field]);
}

async function main() {
  const keypair = loadActiveKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: FULLNODE_URL });

  // ---- 1. mint character + share + transfer ownerCap ----
  const res1 = await execWithRetry(
    client,
    keypair,
    () => {
      const tx = new Transaction();
      const [character, ownerCap] = tx.moveCall({
        target: `${PACKAGE_ID}::character::mint_character`,
      });
      tx.moveCall({
        target: `${PACKAGE_ID}::character::share`,
        arguments: [character],
      });
      tx.transferObjects([ownerCap], sender);
      return tx;
    },
    'mint',
  );

  const characterId = findCreated(res1, '::character::Character');
  const ownerCapId = findCreated(res1, '::character::OwnerCap');
  if (!characterId || !ownerCapId) {
    throw new Error('Could not find created Character / OwnerCap');
  }
  console.log(`  characterId = ${characterId}`);
  console.log(`  ownerCapId  = ${ownerCapId}`);

  const epoch1 = await readField(client, characterId, 'control_epoch');
  console.log(`  character.control_epoch = ${epoch1}`);
  if (epoch1 !== '1') throw new Error(`Expected epoch=1 got ${epoch1}`);

  // ---- 2. issue ControlCap A ----
  const res2 = await execWithRetry(
    client,
    keypair,
    () => {
      const tx = new Transaction();
      const cap = tx.moveCall({
        target: `${PACKAGE_ID}::character::issue_control_cap`,
        arguments: [tx.object(characterId), tx.object(ownerCapId)],
      });
      tx.transferObjects([cap], sender);
      return tx;
    },
    'issue',
  );

  const capAId = findCreated(res2, '::character::ControlCap');
  if (!capAId) throw new Error('No ControlCap created in issue tx');
  console.log(`  capA = ${capAId}`);

  const capAEpoch = await readField(client, capAId, 'epoch');
  console.log(`  capA.epoch = ${capAEpoch}`);
  if (capAEpoch !== '1') throw new Error(`Expected capA.epoch=1 got ${capAEpoch}`);

  // ---- 3. reassign saga → new cap B ----
  const res3 = await execWithRetry(
    client,
    keypair,
    () => {
      const tx = new Transaction();
      const cap = tx.moveCall({
        target: `${PACKAGE_ID}::character::reassign_saga`,
        arguments: [tx.object(characterId), tx.object(ownerCapId)],
      });
      tx.transferObjects([cap], sender);
      return tx;
    },
    'reassign',
  );

  const capBId = findCreated(res3, '::character::ControlCap');
  if (!capBId) throw new Error('No ControlCap created in reassign tx');
  console.log(`  capB = ${capBId}`);

  // ---- 4. verify post-reassign state ----
  const epoch2 = await readField(client, characterId, 'control_epoch');
  console.log(`  character.control_epoch after reassign = ${epoch2}`);
  if (epoch2 !== '2') throw new Error(`Expected epoch=2 got ${epoch2}`);

  const capAEpochAfter = await readField(client, capAId, 'epoch');
  console.log(`  capA.epoch (after reassign, expect 1 = stale) = ${capAEpochAfter}`);
  if (capAEpochAfter !== '1') {
    throw new Error('capA.epoch should remain 1 after reassign');
  }

  const capBEpoch = await readField(client, capBId, 'epoch');
  console.log(`  capB.epoch (expect 2 = current) = ${capBEpoch}`);
  if (capBEpoch !== '2') {
    throw new Error(`Expected capB.epoch=2 got ${capBEpoch}`);
  }

  console.log(`
✅ Smoke checks passed.
   character          ${characterId}  control_epoch=2
   ownerCap (current) ${ownerCapId}
   capA (stale)       ${capAId}        epoch=1
   capB (current)     ${capBId}        epoch=2

   Scope 3 SEAL approve will reject capA (ENoAccess) and accept capB.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
