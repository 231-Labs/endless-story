'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';

/**
 * Minimal error boundary so a single failed asset (missing/expired Walrus blob,
 * bad GLB) degrades to a placeholder instead of blanking the whole canvas.
 * Used around `GlbProp` / `ScrollQuad`, which throw on load failure.
 */
export class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
