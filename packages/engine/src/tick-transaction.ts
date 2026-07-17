/**
 * Filesystem transaction for one engine tick.
 *
 * `runTick` intentionally spans several durable adapters (world snapshot,
 * character sessions, recall and archive). Until those adapters share a real
 * database transaction, the local runner takes a before-image of every
 * authoritative store. A clean tick removes the before-image; an exception,
 * SIGINT, crash or later restart restores it before any adapter is opened.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const TXN_DIR = '.tick-transaction';
const MARKER = 'active.json';
const BACKUP = 'before';
const AUTHORITATIVE_STORES = ['state', 'memory', 'sessions', 'archive'] as const;

interface TransactionMarker {
    version: 1;
    tick: number;
    startedAt: string;
    existed: Record<string, boolean>;
}

function copyDirectory(source: string, destination: string): void {
    fs.cpSync(source, destination, { recursive: true, force: true });
}

export class TickFilesystemTransaction {
    private active = false;
    private readonly outDir: string;

    constructor(outDir: string) {
        this.outDir = outDir;
    }

    private get txnDir(): string {
        return path.join(this.outDir, TXN_DIR);
    }

    private get markerFile(): string {
        return path.join(this.txnDir, MARKER);
    }

    /** Recover a tick that died before commit. Call before opening adapters. */
    recoverInterrupted(): number | null {
        if (!fs.existsSync(this.markerFile)) return null;
        const marker = JSON.parse(fs.readFileSync(this.markerFile, 'utf8')) as TransactionMarker;
        this.restore(marker);
        return marker.tick;
    }

    begin(tick: number): void {
        if (this.active) throw new Error('tick transaction already active');
        if (fs.existsSync(this.markerFile)) {
            throw new Error('interrupted tick transaction must be recovered before begin');
        }
        fs.mkdirSync(path.join(this.txnDir, BACKUP), { recursive: true });
        const existed: Record<string, boolean> = {};
        for (const store of AUTHORITATIVE_STORES) {
            const source = path.join(this.outDir, store);
            existed[store] = fs.existsSync(source);
            if (existed[store]) copyDirectory(source, path.join(this.txnDir, BACKUP, store));
        }
        const marker: TransactionMarker = {
            version: 1,
            tick,
            startedAt: new Date().toISOString(),
            existed,
        };
        const temp = `${this.markerFile}.tmp`;
        fs.writeFileSync(temp, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temp, this.markerFile);
        this.active = true;
    }

    commit(): void {
        if (!this.active) throw new Error('no active tick transaction');
        fs.rmSync(this.txnDir, { recursive: true, force: true });
        this.active = false;
    }

    rollback(): void {
        if (!fs.existsSync(this.markerFile)) {
            this.active = false;
            return;
        }
        const marker = JSON.parse(fs.readFileSync(this.markerFile, 'utf8')) as TransactionMarker;
        this.restore(marker);
    }

    private restore(marker: TransactionMarker): void {
        for (const store of AUTHORITATIVE_STORES) {
            const destination = path.join(this.outDir, store);
            fs.rmSync(destination, { recursive: true, force: true });
            if (marker.existed[store]) {
                const source = path.join(this.txnDir, BACKUP, store);
                if (!fs.existsSync(source)) throw new Error(`tick transaction backup missing: ${store}`);
                copyDirectory(source, destination);
            }
        }
        fs.rmSync(this.txnDir, { recursive: true, force: true });
        this.active = false;
    }
}
