# Endless Story · web (Next.js 15) — pnpm monorepo build.
#
# 這支放在 repo 根,build context = 整個 repo(才抓得到 sibling workspace 套件 + pnpm-lock)。
# Zeabur:web 服務的「根目錄」設成 **repo 根**(留空 / `/`),它就會用這支 Dockerfile。
# (其他服務 Root=packages/relayer,用各自的 Dockerfile,不受這支影響。)
#
# 驗證:本機 worktree 跑 `pnpm install --frozen-lockfile` + `pnpm --filter @endless-story/web build`
# 全綠(13/13 頁),這支就是把同樣步驟容器化。

# ──────────────────────────────────────────────────────────────────────────
# Stage 1 — move-builder: 把 Move 套件編成 bytecode dump,讓 runtime image
# **不必帶 sui 工具鏈**。後台「升級合約」鈕在容器內跑 `cli upgrade`,upgrade.ts
# 讀這份 dump(DEPLOY_BYTECODE_DUMP_PATH)+ 用 SUI_ADMIN_PRIVATE_KEY 程式化簽,
# 全程零 sui CLI。
#
# base = cmdoss/walrus(repo 既有依賴,已含 sui + walrus binaries)。要可重現的
# bytecode 就把它 pin 成固定 digest;要換編譯器版本改這行即可。
# ──────────────────────────────────────────────────────────────────────────
FROM cmdoss/walrus:latest AS move-builder
# `sui move build` fetches the Sui framework dep via git → ensure git + CA certs.
# (cmdoss/walrus is Debian-based, per the relayer Dockerfile.) If the base
# already has them this is a fast no-op.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /contracts
COPY contracts/endless_story ./endless_story
# cmdoss/walrus 映像沒有 sui client config；不先建立會觸發互動式提示、
# 污染 stdout 並讓 dump 無效。只需最小 testnet config（對齊線上部署網路）。
RUN mkdir -p /root/.sui/sui_config \
    && printf '[]\n' > /root/.sui/sui_config/sui.keystore \
    && printf '%s\n' \
        '---' \
        'keystore:' \
        '  File: /root/.sui/sui_config/sui.keystore' \
        'envs:' \
        '  - alias: testnet' \
        '    rpc: "https://fullnode.testnet.sui.io:443"' \
        '    ws: ~' \
        'active_env: testnet' \
        > /root/.sui/sui_config/client.yaml
# `--dump-bytecode-as-base64` 輸出 { modules, dependencies, digest } JSON;
# 這正是 upgrade.ts 需要的格式。test -s 確保非空(build 失敗就讓 image build 失敗)。
RUN cd endless_story \
    && sui move build -e testnet --no-tree-shaking --dump-bytecode-as-base64 > /tmp/bytecode-dump.json \
    && test -s /tmp/bytecode-dump.json

# ──────────────────────────────────────────────────────────────────────────
# Stage 2 — web runtime (Next.js)
# ──────────────────────────────────────────────────────────────────────────
FROM node:23-slim

# corepack 啟用 → 用 root package.json 的 packageManager(pnpm@10.5.2)
RUN corepack enable

WORKDIR /repo
COPY . .

# 預編譯的 bytecode dump 從 builder stage 帶進來(runtime 不需 sui)。
COPY --from=move-builder /tmp/bytecode-dump.json /repo/contracts/endless_story/bytecode-dump.json

# 整個 workspace 安裝(pnpm 從 repo 根解析 pnpm-workspace.yaml)
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* 是 build 時 inline,必須在 `next build` 之前存在。這些都是「公開、非機密」值,
# 直接在此給預設(Zeabur 若有傳同名 build arg 會覆寫)。其餘機密 env(POE/OPENAI/SUI_ADMIN/
# MEMWAL/ASSET_SERVICE_SECRET)是 runtime 讀取,由 Zeabur 在容器啟動時注入,不需 build 時。
ARG NEXT_PUBLIC_SUI_NETWORK=testnet
ARG NEXT_PUBLIC_WALRUS_AGGREGATOR=https://walrus.231labs.xyz
ENV NEXT_PUBLIC_SUI_NETWORK=$NEXT_PUBLIC_SUI_NETWORK \
    NEXT_PUBLIC_WALRUS_AGGREGATOR=$NEXT_PUBLIC_WALRUS_AGGREGATOR

RUN pnpm --filter @endless-story/web build \
    # webpack 的磁碟快取只對「下一次 build」有用，對 runtime 純屬死重（可達數百 MB）
    && rm -rf packages/web/.next/cache

WORKDIR /repo/packages/web
ENV NODE_ENV=production
# 後台「升級合約」用:upgrade.ts 讀這份 dump 取代執行時 `sui move build`(零 CLI),
# 並把升級後的 ids 寫進 runtime manifest(下面 DEPLOYMENT_MANIFEST_PATH)。
ENV DEPLOY_BYTECODE_DUMP_PATH=/repo/contracts/endless_story/bytecode-dump.json
# Runtime deployment manifest:升級後線上**免重 build** 讀到新 ids 的關鍵。
# 指向掛載的持久 volume(Zeabur 掛 /data),否則 redeploy 後 manifest 會掉、回退到
# 編譯進 bundle 的 contract-ids 種子。檔案不存在時靜默用種子(首次部署的正常狀態)。
ENV DEPLOYMENT_MANIFEST_PATH=/data/contract-ids.json
VOLUME ["/data"]
EXPOSE 3000
# next start 讀 PORT(Zeabur 注入);非 standalone,需要 .next + node_modules,兩者都在。
CMD ["pnpm", "start"]
