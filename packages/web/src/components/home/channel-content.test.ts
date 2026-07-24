import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactsForTab, CHANNEL_ARTIFACTS, CHANNEL_SCENES, CHANNEL_TABS } from './channel-content';

test('every channel tab has editorial scene copy', () => {
  assert.deepEqual(Object.keys(CHANNEL_SCENES), CHANNEL_TABS);
});

test('category tabs only return artifacts from their own channel', () => {
  for (const tab of CHANNEL_TABS.filter((value) => value !== '此刻')) {
    const artifacts = artifactsForTab(tab);
    assert.ok(artifacts.length > 0, `${tab} should not be empty`);
    assert.ok(artifacts.every((artifact) => artifact.tab === tab));
  }
});

test('live overview is deliberately shorter than the full archive', () => {
  assert.equal(artifactsForTab('此刻').length, 3);
  assert.ok(artifactsForTab('此刻').length < CHANNEL_ARTIFACTS.length);
});
