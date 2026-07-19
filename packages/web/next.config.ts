import * as path from 'node:path';
import type { NextConfig } from 'next';

// Walrus aggregator hosts whose images go through next/image optimization
// (resize + webp)。自架 aggregator 由 NEXT_PUBLIC_WALRUS_AGGREGATOR 帶入。
const walrusRemotePatterns: { protocol: 'https'; hostname: string }[] = [
  { protocol: 'https', hostname: 'aggregator.walrus-testnet.walrus.space' },
  { protocol: 'https', hostname: 'aggregator.walrus.space' },
];
try {
  const selfHosted = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  if (selfHosted) {
    walrusRemotePatterns.push({ protocol: 'https', hostname: new URL(selfHosted).hostname });
  }
} catch {
  /* malformed env → 只用公共 aggregator */
}

const nextConfig: NextConfig = {
  // Standalone output (NEXT_STANDALONE=1, used by Dockerfile.cinema-lab)
  // traces only the files the server needs — the lab image drops ~1GB → ~200MB.
  // The full image (Dockerfile) keeps plain `next start`: the admin cockpit
  // spawns `pnpm --filter @endless-story/cli run …`, which needs the workspace.
  ...(process.env.NEXT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // Monorepo: trace from the repo root so workspace deps land in .next/standalone.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  images: {
    remotePatterns: walrusRemotePatterns,
  },
  // The Postgres driver (used server-side by the event store via
  // @endless-story/indexer/pg in instrumentation) must not be bundled.
  serverExternalPackages: ['pg'],
  // Workspace packages that ship TS source (no build step) — Next must
  // transpile them via SWC instead of treating them as pre-built modules.
  transpilePackages: [
    '@endless-story/indexer',
    '@endless-story/shared',
    '@endless-story/sdk',
    '@endless-story/chamber-3d',
    '@endless-story/llm',
    '@endless-story/memwal',
    '@endless-story/drama',
    '@endless-story/economy',
    '@endless-story/engine',
    '@endless-story/runner',
    '@endless-story/troupe',
  ],
  webpack: (config) => {
    // ESM TS imports use `.js` suffix per moduleResolution: 'Bundler'.
    // Tell webpack to resolve those back to .ts/.tsx sources inside our
    // transpiled workspace packages.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
