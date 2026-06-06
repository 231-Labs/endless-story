// Walrus 寫入 — 走容器內 `walrus` CLI(store / extend / delete / status / wallet)。
// 同一顆錢包既 store 又 extend ⇒ 鏈上 Blob object ownership 永遠一致(避開 publisher 子錢包模糊)。
//
// dev-local fallback:未設 `WALRUS_CLI` 時,把 bytes 落地到 DATA_DIR/asset-blobs/、偽造
// blobId/suiObjectId/endEpoch,讓服務 *離線可跑*(本機開發 + type-check;不需裝 walrus)。
//
// ⚠️ CLI 旗標名稱與 --json 輸出形狀依 walrus 版本而異。下面的 args 與 parse* 是合理預設,
//    Phase 0 在 VPS 上對「實際安裝的 walrus 版本」校一次即可(parse* 已做防禦式多鍵嘗試)。
//    校驗點:`walrus store <file> --epochs N [--deletable] --json`、`walrus extend`、
//    `walrus delete`、`walrus info --json`、global `--context <name>`。

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = process.env.WALRUS_CLI?.trim(); // e.g. "walrus"; unset → dev-local mock
const CONTEXT = process.env.WALRUS_CONTEXT?.trim(); // walrus client config context (optional)

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
    const out = await this.run(["extend", "--blob-obj-id", suiObjectId, "--epochs", String(epochs), "--json"]);
    return parseEndEpoch(out) ?? 0;
  }

  /** Delete a (deletable) blob to reclaim storage. */
  async delete(suiObjectId: string): Promise<void> {
    if (this.local) return;
    await this.run(["delete", "--blob-obj-id", suiObjectId, "--yes"]);
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

  /** Publisher wallet SUI + WAL balance (for the dashboard low-water warning). */
  async wallet(): Promise<WalletBalance> {
    if (this.local) return { sui: 999, wal: 999 };
    try {
      return parseWallet(await this.run(["info", "--json"]));
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
        if (code === 0) resolve(stdout);
        else reject(new Error(`walrus ${args[0]} exited ${code}: ${stderr.slice(0, 400)}`));
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

function blobObjectOf(j: Record<string, unknown>): Record<string, unknown> {
  const created = j.newlyCreated as Record<string, unknown> | undefined;
  const certified = j.alreadyCertified as Record<string, unknown> | undefined;
  const obj =
    (created?.blobObject as Record<string, unknown> | undefined) ??
    (j.blobObject as Record<string, unknown> | undefined) ??
    certified ??
    j;
  return obj ?? {};
}

function parseStore(out: string): StoreResult {
  const obj = blobObjectOf(asJson(out));
  const blobId = String(pick(obj, "blobId", "blob_id") ?? "");
  const suiObjectId = String(pick(obj, "id", "blobObjectId", "objectId", "object_id") ?? "");
  const storage = (pick(obj, "storage") as Record<string, unknown> | undefined) ?? {};
  const endEpoch = num(pick(storage, "endEpoch", "end_epoch") ?? pick(obj, "endEpoch", "end_epoch"));
  if (!blobId) throw new Error(`walrus store: no blobId in output: ${out.slice(0, 300)}`);
  return { blobId, suiObjectId, endEpoch };
}

function parseEndEpoch(out: string): number | null {
  const obj = blobObjectOf(asJson(out));
  const storage = (pick(obj, "storage") as Record<string, unknown> | undefined) ?? {};
  const e = num(pick(storage, "endEpoch", "end_epoch") ?? pick(obj, "endEpoch", "end_epoch"));
  return e > 0 ? e : null;
}

function parseCurrentEpoch(out: string): number | null {
  const j = asJson(out);
  const e = num(pick(j, "epoch", "currentEpoch", "current_epoch"));
  return e > 0 ? e : null;
}

function parseWallet(out: string): WalletBalance {
  const j = asJson(out);
  const sui = pick(j, "sui", "suiBalance", "sui_balance");
  const wal = pick(j, "wal", "walBalance", "wal_balance");
  return {
    sui: sui == null ? null : num(sui),
    wal: wal == null ? null : num(wal),
  };
}
