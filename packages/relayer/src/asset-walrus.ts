// Walrus writes — via the in-container `walrus` CLI (store / extend / delete / status /
// wallet). One wallet does both store and extend, so on-chain Blob object ownership stays
// consistent (avoids publisher sub-wallet ambiguity).
//
// dev-local fallback: when `WALRUS_CLI` is unset, write bytes to DATA_DIR/asset-blobs/ and
// fake blobId/suiObjectId/endEpoch so the service runs offline (local dev + type-check; no
// walrus install needed).
//
// ⚠️ CLI flag names and --json output shapes vary by walrus version. The args and parse*
//    below are reasonable defaults; calibrate once against the actually-installed walrus
//    version on the VPS (parse* already tries multiple keys defensively). Check:
//    `walrus store <file> --epochs N [--deletable] --json`, `walrus extend`,
//    `walrus delete`, `walrus info --json`, global `--context <name>`.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = process.env.WALRUS_CLI?.trim(); // e.g. "walrus"; unset → dev-local mock
const CONTEXT = process.env.WALRUS_CONTEXT?.trim(); // walrus client config context (optional)
const NETWORK = process.env.WALRUS_NETWORK?.trim() ?? "testnet";
// JSON-RPC is deprecated (sunset 2026-07-31); balances go over GraphQL now —
// raw fetch keeps this package dependency-free (same pattern as the indexer's
// event migration). Override with SUI_GRAPHQL_URL when self-hosting.
const SUI_GRAPHQL =
  process.env.SUI_GRAPHQL_URL?.trim() ??
  (NETWORK === "mainnet"
    ? "https://graphql.mainnet.sui.io/graphql"
    : "https://graphql.testnet.sui.io/graphql");

export interface StoreResult {
  blobId: string;
  suiObjectId: string;
  endEpoch: number;
}

export interface WalletBalance {
  sui: number | null;
  wal: number | null;
}

export class AssetWalrus {
  readonly local: boolean;
  private blobDir: string;

  constructor(dataDir: string) {
    this.local = !CLI;
    this.blobDir = join(dataDir, "asset-blobs");
    if (this.local) mkdirSync(this.blobDir, { recursive: true });
  }

  /** Upload bytes; return blobId + the on-chain Blob object id + endEpoch. */
  async store(bytes: Uint8Array, epochs: number, deletable: boolean): Promise<StoreResult> {
    if (this.local) {
      const blobId = "local-" + createHash("sha256").update(bytes).digest("hex").slice(0, 48);
      writeFileSync(join(this.blobDir, blobId), bytes);
      return { blobId, suiObjectId: "0xlocal_" + blobId.slice(6, 30), endEpoch: 1 + epochs };
    }
    const tmp = join(tmpdir(), `asset-${randomUUID()}`);
    writeFileSync(tmp, bytes);
    try {
      const args = ["store", tmp, "--epochs", String(epochs), "--json"];
      if (deletable) args.push("--deletable");
      return parseStore(await this.run(args));
    } finally {
      try {
        rmSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Extend a blob's lifetime by `epochs`; return the new endEpoch, or 0 if not parseable
   * (caller then falls back to `oldEndEpoch + epochs`). dev-local returns 0 so the additive
   * fallback applies — the mock doesn't track per-blob state.
   */
  async extend(suiObjectId: string, epochs: number): Promise<number> {
    if (this.local) return 0;
    // CLI: `walrus extend --blob-obj-id <id> --epochs-extended <n>` (no --json → parse fails →
    // caller uses additive fallback oldEndEpoch+epochs, which is exactly right for extend-by-N).
    const out = await this.run(["extend", "--blob-obj-id", suiObjectId, "--epochs-extended", String(epochs)]);
    return parseEndEpoch(out) ?? 0;
  }

  /** Delete a (deletable) blob to reclaim storage. CLI deletes by blobId via `--blob-ids`. */
  async delete(blobId: string): Promise<void> {
    if (this.local) return;
    await this.run(["delete", "--blob-ids", blobId, "--yes"]);
  }

  /** Current Walrus epoch — for to-expiry math. null if unavailable. */
  async currentEpoch(): Promise<number | null> {
    if (this.local) return 1;
    try {
      return parseCurrentEpoch(await this.run(["info", "--json"]));
    } catch {
      return null;
    }
  }

  /**
   * Publisher wallet SUI + WAL balance (for the dashboard low-water warning).
   * `walrus info` carries NO balance — read the wallet address from the sui client
   * config and ask the Sui GraphQL RPC (JSON-RPC `suix_getAllBalances` is sunset).
   * Balances are in MIST (9 decimals).
   */
  async wallet(): Promise<WalletBalance> {
    if (this.local) return { sui: 999, wal: 999 };
    const addr = walletAddress();
    if (!addr) return { sui: null, wal: null };
    try {
      const query =
        "query($a:SuiAddress!){address(address:$a){balances{nodes{coinType{repr}totalBalance}}}}";
      const res = await fetch(SUI_GRAPHQL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { a: addr } }),
        signal: AbortSignal.timeout(8000),
      });
      const j = (await res.json()) as {
        data?: {
          address?: { balances?: { nodes?: Array<{ coinType?: { repr?: string }; totalBalance?: string }> } };
        };
      };
      let sui: number | null = null;
      let wal: number | null = null;
      for (const b of j.data?.address?.balances?.nodes ?? []) {
        const amt = num(b.totalBalance) / 1e9;
        if (b.coinType?.repr?.endsWith("::sui::SUI")) sui = amt;
        else if (b.coinType?.repr?.endsWith("::wal::WAL")) wal = amt;
      }
      // the result omits coins with zero balance → present address, absent coin = 0
      return { sui: sui ?? 0, wal: wal ?? 0 };
    } catch {
      return { sui: null, wal: null };
    }
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const cli = CLI ?? "walrus";
      const ctx = CONTEXT ? ["--context", CONTEXT] : [];
      const child = spawn(cli, [...ctx, ...args], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve(stdout);
        // walrus prints transaction-execution errors (e.g. EResourceBounds on an expired
        // blob) to STDOUT while stderr only carries the "build older than 30 days" banner —
        // include both streams or the real failure reason is invisible.
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join(" | ").slice(0, 500);
        reject(new Error(`walrus ${args[0]} exited ${code}: ${detail}`));
      });
    });
  }
}

// ── defensive parsers (tolerate version drift in the --json shape) ──

function asJson(out: string): Record<string, unknown> {
  try {
    const j = JSON.parse(out);
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null) return obj[k];
  }
  return undefined;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// `walrus store --json` returns an array; each element wraps a `blobStoreResult` holding
// { newlyCreated.blobObject | alreadyCertified }. Unwrap to that inner result object.
function storeResultOf(out: string): Record<string, any> {
  let root: any;
  try {
    root = JSON.parse(out);
  } catch {
    return {};
  }
  const first = Array.isArray(root) ? root[0] : root;
  return (first?.blobStoreResult ?? first ?? {}) as Record<string, any>;
}

function blobFields(sr: Record<string, any>): StoreResult {
  const created = sr?.newlyCreated;
  const certified = sr?.alreadyCertified;
  const blobObject = created?.blobObject ?? sr?.blobObject ?? {};
  const blobId = blobObject?.blobId ?? certified?.blobId ?? "";
  const suiObjectId = blobObject?.id ?? "";
  const endEpoch = num(blobObject?.storage?.endEpoch ?? certified?.endEpoch ?? blobObject?.endEpoch ?? 0);
  return { blobId: String(blobId), suiObjectId: String(suiObjectId), endEpoch };
}

function parseStore(out: string): StoreResult {
  const f = blobFields(storeResultOf(out));
  if (!f.blobId) throw new Error(`walrus store: no blobId in output: ${out.slice(0, 400)}`);
  return f;
}

function parseEndEpoch(out: string): number | null {
  const e = blobFields(storeResultOf(out)).endEpoch;
  return e > 0 ? e : null;
}

function parseCurrentEpoch(out: string): number | null {
  const j = asJson(out);
  // `walrus info --json` nests it under epochInfo.currentEpoch (top-level fallback kept).
  const epochInfo = (pick(j, "epochInfo", "epoch_info") as Record<string, unknown> | undefined) ?? {};
  const e = num(pick(epochInfo, "currentEpoch", "current_epoch") ?? pick(j, "epoch", "currentEpoch", "current_epoch"));
  return e > 0 ? e : null;
}

/** Read the active Sui address from the sui client config the entrypoint wrote (for balance RPC). */
function walletAddress(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const yaml = readFileSync(join(home, ".sui", "sui_config", "client.yaml"), "utf8");
    const m = yaml.match(/active_address:\s*"?(0x[0-9a-fA-F]+)"?/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
