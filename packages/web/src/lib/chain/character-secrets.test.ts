import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setCharacterSecret, getCharacterSecret, clearCharacterSecrets } from './character-secrets.ts';

test('① round-trip — set then get returns the same secret', () => {
    clearCharacterSecrets();
    setCharacterSecret('su', '她這輩子只真正給過一個人');
    assert.equal(getCharacterSecret('su'), '她這輩子只真正給過一個人');
});

test('② unset character — no row, no leak from another character', () => {
    clearCharacterSecrets();
    setCharacterSecret('su', 'su 的秘密');
    assert.equal(getCharacterSecret('liu'), undefined, '未種過秘密的角色不可讀到別人的');
});

test('③ blank secret is a no-op — never overwrites with empty', () => {
    clearCharacterSecrets();
    setCharacterSecret('su', 'su 的秘密');
    setCharacterSecret('su', '   ');
    assert.equal(getCharacterSecret('su'), 'su 的秘密', '空字串不應覆蓋既有秘密');
});

test('④ clearCharacterSecrets wipes every row (harness isolation)', () => {
    setCharacterSecret('su', 'a');
    setCharacterSecret('liu', 'b');
    clearCharacterSecrets();
    assert.equal(getCharacterSecret('su'), undefined);
    assert.equal(getCharacterSecret('liu'), undefined);
});
