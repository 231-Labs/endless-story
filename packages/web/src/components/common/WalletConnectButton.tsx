'use client';

/**
 * Client-only wrapper around dapp-kit's `ConnectButton`.
 *
 * The new dapp-kit connect UI is a lit web component that touches `window` /
 * `document` at render time, so it cannot be server-rendered — Next's prerender
 * of any page whose layout includes it (e.g. the header) would throw
 * `ReferenceError: window is not defined`. `dynamic(..., { ssr: false })` defers
 * the import + render to the browser. `DAppKitProvider` itself is SSR-safe, so
 * only the button needs this treatment.
 */

import dynamic from 'next/dynamic';

export const WalletConnectButton = dynamic(
  () => import('@mysten/dapp-kit-react/ui').then((m) => m.ConnectButton),
  { ssr: false },
);
