import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LabDialogProvider } from '@/components/lab/LabDialog';

/**
 * Cinema-lab (片場) — fully off-chain, server-side experiment stage.
 * Own chrome per page (the run stage is full-viewport); this layout scopes
 * metadata, the paper background, and the in-house dialog system.
 */

export const metadata: Metadata = {
    title: '片場 · Cinema Lab',
    description: '完全鏈下的世界引擎實驗場：即時手卷、事件卷宗、版本分卷。',
    robots: { index: false, follow: false },
};

export default function LabLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-dvh bg-canvas text-ink">
            <LabDialogProvider>{children}</LabDialogProvider>
        </div>
    );
}
