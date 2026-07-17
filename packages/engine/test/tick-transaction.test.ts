import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TickFilesystemTransaction } from '../src/tick-transaction.ts';

function write(root: string, relative: string, value: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
}

test('interrupted tick restores every authoritative store on next startup', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'es-txn-'));
    write(out, 'state/world.json', 'world-before');
    write(out, 'memory/recall.json', 'memory-before');
    write(out, 'sessions/c0.json', 'session-before');
    write(out, 'archive/old.md', 'archive-before');

    const firstProcess = new TickFilesystemTransaction(out);
    firstProcess.begin(12);
    write(out, 'state/world.json', 'world-partial');
    write(out, 'memory/recall.json', 'memory-partial');
    write(out, 'sessions/c0.json', 'session-partial');
    write(out, 'archive/partial.md', 'ghost event');

    const restartedProcess = new TickFilesystemTransaction(out);
    assert.equal(restartedProcess.recoverInterrupted(), 12);
    assert.equal(fs.readFileSync(path.join(out, 'state/world.json'), 'utf8'), 'world-before');
    assert.equal(fs.readFileSync(path.join(out, 'memory/recall.json'), 'utf8'), 'memory-before');
    assert.equal(fs.readFileSync(path.join(out, 'sessions/c0.json'), 'utf8'), 'session-before');
    assert.equal(fs.existsSync(path.join(out, 'archive/partial.md')), false);
    assert.equal(fs.existsSync(path.join(out, '.tick-transaction')), false);
    fs.rmSync(out, { recursive: true, force: true });
});

test('committed tick keeps its writes and removes the recovery marker', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'es-txn-commit-'));
    write(out, 'state/world.json', 'before');
    const txn = new TickFilesystemTransaction(out);
    txn.begin(3);
    write(out, 'state/world.json', 'after');
    txn.commit();
    assert.equal(fs.readFileSync(path.join(out, 'state/world.json'), 'utf8'), 'after');
    assert.equal(new TickFilesystemTransaction(out).recoverInterrupted(), null);
    fs.rmSync(out, { recursive: true, force: true });
});
