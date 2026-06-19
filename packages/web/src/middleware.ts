/**
 * Middleware — currently a stub gate for /admin/*.
 *
 * Phase 2+: enforce wallet address allowlist (e.g. only the deployment
 * address can hit /admin). For now passes everything through; the route
 * group separation is structural, auth comes when admin grows real
 * operations (deploy / runner controls).
 *
 * See the on-chain architecture contract, principles 5 + 6.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(_req: NextRequest) {
  // TODO(Phase 2): check wallet header / cookie against allowed admin addresses.
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
