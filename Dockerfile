# Endless Story · web (Next.js 15) — pnpm monorepo build.
#
# 這支放在 repo 根,build context = 整個 repo(才抓得到 sibling workspace 套件 + pnpm-lock)。
# Zeabur:web 服務的「根目錄」設成 **repo 根**(留空 / `/`),它就會用這支 Dockerfile。
# (其他服務 Root=packages/relayer,用各自的 Dockerfile,不受這支影響。)
#
# 驗證:本機 worktree 跑 `pnpm install --frozen-lockfile` + `pnpm --filter @endless-story/web build`
# 全綠(16s 編譯、13/13 頁),這支就是把同樣步驟容器化。

FROM node:23-slim

# corepack 啟用 → 用 root package.json 的 packageManager(pnpm@10.5.2)
RUN corepack enable

WORKDIR /repo
COPY . .

# 整個 workspace 安裝(pnpm 從 repo 根解析 pnpm-workspace.yaml)
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* 是 build 時 inline,必須在 `next build` 之前存在。這些都是「公開、非機密」值,
# 直接在此給預設(Zeabur 若有傳同名 build arg 會覆寫)。其餘機密 env(POE/OPENAI/SUI_ADMIN/
# MEMWAL/ASSET_SERVICE_SECRET)是 runtime 讀取,由 Zeabur 在容器啟動時注入,不需 build 時。
ARG NEXT_PUBLIC_SUI_NETWORK=testnet
ARG NEXT_PUBLIC_WALRUS_AGGREGATOR=https://walrus.231labs.xyz
ENV NEXT_PUBLIC_SUI_NETWORK=$NEXT_PUBLIC_SUI_NETWORK \
    NEXT_PUBLIC_WALRUS_AGGREGATOR=$NEXT_PUBLIC_WALRUS_AGGREGATOR

RUN pnpm --filter @endless-story/web build

WORKDIR /repo/packages/web
ENV NODE_ENV=production
EXPOSE 3000
# next start 讀 PORT(Zeabur 注入);非 standalone,需要 .next + node_modules,兩者都在。
CMD ["pnpm", "start"]
