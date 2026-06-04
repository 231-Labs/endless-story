// Unit tests for public-profile role fallback. Keep this node-clean: shared
// helper only, no Next/server imports.
//
//   pnpm --filter @endless-story/web test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferRoleFromText } from '../../../../shared/src/role-traits.ts';

test('inferRoleFromText resolves explicit opera roles from public profile prose', () => {
    assert.equal(inferRoleFromText('梨園中聲名最盛的花旦名角，身段沉靜。'), '花旦');
    assert.equal(inferRoleFromText('當紅武小生，嗓如裂帛、身段風流。'), '武小生');
    assert.equal(inferRoleFromText('新近冒頭的小生，眉眼鋒利。'), '小生');
    assert.equal(inferRoleFromText('後台琴師，靠耳朵吃飯。'), '樂師');
});

test('inferRoleFromText prefers specific roles before broad substrings', () => {
    assert.equal(inferRoleFromText('武小生與花旦搭戲。'), '武小生');
    assert.equal(inferRoleFromText('文小生在台口候場。'), '文小生');
    assert.equal(inferRoleFromText('刀馬旦練槍。'), '武旦');
});

test('inferRoleFromText returns undefined for untagged generic prose', () => {
    assert.equal(inferRoleFromText('一名新來的人，還沒有人知道底細。'), undefined);
    assert.equal(inferRoleFromText(undefined), undefined);
});
