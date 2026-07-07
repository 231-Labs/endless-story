# Asset 服務(docs/narrative/ASSET_MANAGEMENT.md Service ③)的 image:walrus CLI + Node + relayer 原始碼。
# 與 MemWAL relayer 共用 package,但 entrypoint 是 assets-server.ts(獨立進程/service)。
#
# base = cmdoss/walrus:它已含 walrus + sui binaries,並依 NETWORK / SUI_KEYSTORE env 設好
# client config(見 https://hub.docker.com/r/cmdoss/walrus)。我們在上面疊 Node 來跑服務。
#
# ⚠️ Phase 0 在 Zeabur 上首次 build 時校一次:
#   1) `walrus` 是否在 PATH(`docker run ... walrus --version`)。
#   2) base image 的 client config 是否由其 entrypoint 在「啟動時」依 env 生成 —— 若是,
#      改用 Zeabur Volume 掛入 /config(client_config.yaml + keystore)、或在 CMD 前先跑其 setup。
#   3) Node 版本 ≥ 23.6(原生 TS type-stripping 需求)。

FROM cmdoss/walrus:latest

# Node 23（原生 TS：`node src/assets-server.ts`，零 npm 依賴）
# NodeSource setup 腳本適用 Debian/Ubuntu 系 base;若 base 非 apt 系,改對應安裝法。
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_23.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Zeabur「Root Directory」設成 packages/relayer ⇒ build context = 此資料夾,故 COPY src(而非
# packages/relayer/src)。若改用 repo 根當 context,請改成 `COPY packages/relayer/src ./src`。
WORKDIR /app
COPY src ./src
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# 服務組態(其餘以 Zeabur Variables 覆寫:SUI_KEYSTORE / WALRUS_NETWORK / WALRUS_CLI /
# RELAYER_SECRET / RELAYER_CORS_ORIGIN / PUBLIC_AGGREGATOR_BASE / 自動續租那組:
# RENEW_THRESHOLD_EPOCHS / RENEW_EXTEND_EPOCHS / WALLET_MIN_WAL / WALLET_MIN_SUI /
# RENEW_SWEEP_INTERVAL_MS —— 見 docs/narrative/ASSET_MANAGEMENT.md §8)
ENV DATA_DIR=/data \
    PORT=8788 \
    WALRUS_CLI=walrus \
    WALRUS_NETWORK=testnet

# /data 由 Zeabur Volume 掛載(registry + dev-local blobs);錢包 keystore/config 一併放這。
VOLUME ["/data"]
EXPOSE 8788

# 覆寫 cmdoss/walrus 的原 ENTRYPOINT(它依 MODE 分派服務、不跑我們的 app)。
# 改用我們的啟動腳本:先用 SUI_KEYSTORE + 內建 testnet/mainnet 設定備好 walrus/sui config,
# 再 exec node 起 asset server。設 ENTRYPOINT 會自動清掉 base image 的 CMD,故無殘留參數。
ENTRYPOINT ["/app/docker-entrypoint.sh"]
