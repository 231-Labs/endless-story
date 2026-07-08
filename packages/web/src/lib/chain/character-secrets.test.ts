import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    setCharacterSecret,
    getCharacterSecret,
    clearCharacterSecrets,
    __resetCharacterSecretCache,
} from './character-secrets.ts';

const STORE = path.join(process.cwd(), 'data', 'character-secrets.json');

/** Run against a clean store file, restoring whatever was there before. */
function withCleanStore(fn: () => void): void {
    const had = fs.existsSync(STORE) ? fs.readFileSync(STORE, 'utf-8') : null;
    try {
        fs.rmSync(STORE, { force: true });
        __resetCharacterSecretCache();
        fn();
    } finally {
        if (had !== null) fs.writeFileSync(STORE, had);
        else fs.rmSync(STORE, { force: true });
        __resetCharacterSecretCache();
    }
}

test('① round-trip — set then get returns the same secret', () => {
    withCleanStore(() => {
        setCharacterSecret('su', '她這輩子只真正給過一個人');
        assert.equal(getCharacterSecret('su'), '她這輩子只真正給過一個人');
    });
});

test('② unset character — no row, no leak from another character', () => {
    withCleanStore(() => {
        setCharacterSecret('su', 'su 的秘密');
        assert.equal(getCharacterSecret('liu'), undefined, '未種過秘密的角色不可讀到別人的');
    });
});

test('③ blank secret is a no-op — never overwrites with empty', () => {
    withCleanStore(() => {
        setCharacterSecret('su', 'su 的秘密');
        setCharacterSecret('su', '   ');
        assert.equal(getCharacterSecret('su'), 'su 的秘密', '空字串不應覆蓋既有秘密');
    });
});

test('④ clearCharacterSecrets wipes cache AND file (harness isolation)', () => {
    withCleanStore(() => {
        setCharacterSecret('su', 'a');
        setCharacterSecret('liu', 'b');
        clearCharacterSecrets();
        assert.equal(getCharacterSecret('su'), undefined);
        assert.equal(getCharacterSecret('liu'), undefined);
        // Cleared state must also survive a restart (file wiped, not just cache).
        __resetCharacterSecretCache();
        assert.equal(getCharacterSecret('su'), undefined);
    });
});

test('⑤ persists across cache reset (restart survival)', () => {
    withCleanStore(() => {
        setCharacterSecret('su', '封箱那年的那句話');
        // Simulate a server restart: drop the process cache, NOT the store file.
        __resetCharacterSecretCache();
        assert.equal(getCharacterSecret('su'), '封箱那年的那句話', '重啟後秘密必須還在');
    });
});
