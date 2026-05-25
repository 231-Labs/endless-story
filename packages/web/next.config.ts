import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages that ship TS source (no build step) — Next must
  // transpile them via SWC instead of treating them as pre-built modules.
  transpilePackages: [
    '@endless-story/shared',
    '@endless-story/sdk',
    '@endless-story/llm',
    '@endless-story/memwal',
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
