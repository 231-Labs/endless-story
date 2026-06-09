#!/bin/sh
# Asset 服務啟動腳本(docs/WALRUS_ASSETS.md Service ③)。
#
# 為什麼有這支:base image cmdoss/walrus 的原 ENTRYPOINT 會依 MODE 分派服務、不跑我們的 app,
# 我們已覆寫它 —— 但連帶跳過了它的 walrus/sui config 自動生成。這支腳本在起 node 前,自己用
# SUI_KEYSTORE + 內建的 testnet/mainnet 設定把 walrus client config 與 sui 錢包備好,讓容器內的
# `walrus store/extend/delete/get-wal` 可用。設定每次開機從 env 重建(keystore 不持久化)。
#
# 驗證過(本機 walrus 1.41 / sui 1.72):import → switch → 寫 config → `walrus list-blobs` 全綠。
# 不用 `set -e`:就算錢包設定失敗,服務仍要起得來(/health、manifest 不需錢包)。

# ── Service 分流:同一 Dockerfile 跑兩個服務(asset / MemWAL relayer)──
# SERVICE=memwal → MemWAL relayer(記憶 recall/remember;零依賴 node:http,不需 walrus CLI/錢包,
#                  記憶 blob 上傳走 WALRUS_PUBLISHER_URL 的 HTTP publisher)。
# 其他(未設)→ asset 服務(下方備 walrus/sui config 後起 assets-server.ts)。
if [ "$SERVICE" = "memwal" ] || [ "$SERVICE" = "relayer" ]; then
  echo "[entrypoint] starting MemWAL relayer (server.ts)"
  exec node /app/src/server.ts
fi

NETWORK="${WALRUS_NETWORK:-testnet}"
export HOME="${HOME:-/root}"
SUI_DIR="$HOME/.sui/sui_config"
WALRUS_DIR="$HOME/.config/walrus"
mkdir -p "$SUI_DIR" "$WALRUS_DIR"

# ── Sui 錢包設定 ──
cat > "$SUI_DIR/client.yaml" <<EOF
---
keystore:
  File: $SUI_DIR/sui.keystore
envs:
  - alias: testnet
    rpc: "https://fullnode.testnet.sui.io:443"
    ws: ~
  - alias: mainnet
    rpc: "https://fullnode.mainnet.sui.io:443"
    ws: ~
active_env: $NETWORK
EOF
printf '[]' > "$SUI_DIR/sui.keystore"   # 每次開機全新 keystore,再從 env 匯入(import 才不會撞重複)

if [ -n "$SUI_KEYSTORE" ]; then
  ADDR=$(sui keytool import "$SUI_KEYSTORE" ed25519 --json 2>/dev/null | grep -oiE '0x[0-9a-f]{64}' | head -1)
  if [ -n "$ADDR" ]; then
    sui client switch --address "$ADDR" >/dev/null 2>&1
    echo "[entrypoint] sui wallet ready: $ADDR (env=$NETWORK)"
  else
    echo "[entrypoint] WARN: SUI_KEYSTORE 匯入失敗 — 上傳/續租會失敗(/health、manifest 仍可用)"
  fi
else
  echo "[entrypoint] WARN: 未設 SUI_KEYSTORE — 上傳/get-wal 會失敗(/health、manifest 仍可用)"
fi

# ── Walrus client config(baked;testnet + mainnet 兩個 context,以 WALRUS_NETWORK 選預設)──
cat > "$WALRUS_DIR/client_config.yaml" <<EOF
contexts:
  mainnet:
    system_object: 0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2
    staking_object: 0x10b9d30c28448939ce6c4d6c6e0ffce4a7f8a4ada8248bdad09ef8b70e4a3904
    subsidies_object: 0xb606eb177899edc2130c93bf65985af7ec959a2755dc126c953755e59324209e
    exchange_objects: []
    wallet_config:
      path: $SUI_DIR/client.yaml
      active_env: mainnet
  testnet:
    system_object: 0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af
    staking_object: 0xbe46180321c30aab2f8b3501e24048377287fa708018a5b7c2792b35fe339ee3
    subsidies_object: 0xda799d85db0429765c8291c594d334349ef5bc09220e79ad397b30106161a0af
    exchange_objects:
      - 0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073
      - 0x19825121c52080bb1073662231cfea5c0e4d905fd13e95f21e9a018f2ef41862
      - 0x83b454e524c71f30803f4d6c302a86fb6a39e96cdfb873c2d1e93bc1c26a3bc5
      - 0x8d63209cf8589ce7aef8f262437163c67577ed09f3e636a9d8e0813843fb8bf1
    wallet_config:
      path: $SUI_DIR/client.yaml
      active_env: testnet
default_context: $NETWORK
EOF
echo "[entrypoint] walrus config 已寫入(default_context=$NETWORK);啟動 asset server"

exec node /app/src/assets-server.ts
