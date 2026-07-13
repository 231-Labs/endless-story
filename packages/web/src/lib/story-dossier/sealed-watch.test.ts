import assert from 'node:assert/strict';
import test from 'node:test';
import type { EpistemicProvenanceManifest } from '@endless-story/shared/types';
import { nightTuberoseManifest } from './night-tuberose.ts';
import { sealedWatchManifest } from './sealed-watch.ts';
import { borrowedLineManifest } from './borrowed-line.ts';

function assertManifestAnchors(manifest: EpistemicProvenanceManifest) {
  const evidenceIds = new Set(manifest.evidence.map((item) => item.id));
  const claimIds = new Set<string>();

  for (const perspective of manifest.perspectives) {
    const perspectiveClaims = new Set(perspective.claims.map((claim) => claim.id));

    for (const claim of perspective.claims) {
      assert.equal(claimIds.has(claim.id), false, `duplicate claim ${claim.id}`);
      claimIds.add(claim.id);
      assert.ok(claim.evidenceRefs.length > 0, `${claim.id} is unanchored`);
      for (const ref of claim.evidenceRefs) {
        assert.ok(evidenceIds.has(ref), `${claim.id} cites missing evidence ${ref}`);
      }
    }

    for (const passage of perspective.passages) {
      for (const claimId of passage.claimIds) {
        assert.ok(perspectiveClaims.has(claimId), `${passage.id} cites missing claim ${claimId}`);
      }
    }
  }
}

test('sealed-watch manifest keeps every claim anchored to known evidence', () => {
  assert.equal(sealedWatchManifest.perspectives.length, 3);
  assertManifestAnchors(sealedWatchManifest);
});

test('night-tuberose manifest keeps every claim anchored to known evidence', () => {
  assert.equal(nightTuberoseManifest.perspectives.length, 2);
  assertManifestAnchors(nightTuberoseManifest);
});

test('borrowed-line manifest keeps every claim anchored to known evidence', () => {
  assert.equal(borrowedLineManifest.perspectives.length, 4);
  assertManifestAnchors(borrowedLineManifest);
});
