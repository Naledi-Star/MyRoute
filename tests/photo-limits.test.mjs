import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JPEG_QUALITY_LADDER,
  PHOTO_HARD_MAX_BYTES,
  PHOTO_MAX_EDGE_PX,
  PHOTO_TARGET_BYTES,
  describeUploadRefusal,
  isUploadableSize,
  meetsTargetSize,
  resizeDimensions,
} from '../src/lib/photo-limits.ts';

describe('photo resize target', () => {
  it('leaves a small image alone and never upscales', () => {
    assert.deepEqual(resizeDimensions(800, 600), {
      width: 800,
      height: 600,
      resized: false,
    });
    assert.deepEqual(resizeDimensions(1600, 900), {
      width: 1600,
      height: 900,
      resized: false,
    });
  });

  it('scales a landscape photo by its long edge', () => {
    const target = resizeDimensions(4000, 3000);
    assert.deepEqual(target, {
      width: PHOTO_MAX_EDGE_PX,
      height: 1200,
      resized: true,
    });
  });

  it('scales a portrait photo by its height', () => {
    const target = resizeDimensions(3024, 4032);
    assert.deepEqual(target, {
      width: 1200,
      height: PHOTO_MAX_EDGE_PX,
      resized: true,
    });
  });

  it('keeps the aspect ratio within a pixel of rounding', () => {
    const target = resizeDimensions(5000, 2813);
    const originalRatio = 5000 / 2813;
    const resizedRatio = target.width / target.height;
    assert.ok(Math.abs(originalRatio - resizedRatio) < 0.01);
  });

  it('rejects nonsense dimensions rather than producing NaN geometry', () => {
    for (const [width, height] of [
      [0, 100],
      [100, 0],
      [-5, 100],
      [Number.NaN, 100],
    ]) {
      assert.throws(() => resizeDimensions(width, height), /positive numbers/);
    }
  });
});

describe('photo size gate', () => {
  it('accepts anything between 1 byte and 1 MB', () => {
    assert.equal(isUploadableSize(1), true);
    assert.equal(isUploadableSize(PHOTO_TARGET_BYTES), true);
    assert.equal(isUploadableSize(PHOTO_HARD_MAX_BYTES), true);
  });

  it('refuses an empty, unknown or oversized file', () => {
    assert.equal(isUploadableSize(0), false);
    assert.equal(isUploadableSize(null), false);
    assert.equal(isUploadableSize(undefined), false);
    assert.equal(isUploadableSize(Number.NaN), false);
    assert.equal(isUploadableSize(PHOTO_HARD_MAX_BYTES + 1), false);
  });

  it('targets 500 KB but treats it as a goal, not the gate', () => {
    assert.equal(meetsTargetSize(PHOTO_TARGET_BYTES), true);
    assert.equal(meetsTargetSize(PHOTO_HARD_MAX_BYTES), false);
    assert.equal(isUploadableSize(PHOTO_HARD_MAX_BYTES), true);
  });

  it('has a descending quality ladder with every step in (0, 1]', () => {
    assert.ok(JPEG_QUALITY_LADDER.length >= 3);
    for (const quality of JPEG_QUALITY_LADDER) {
      assert.ok(quality > 0 && quality <= 1);
    }
    const sorted = [...JPEG_QUALITY_LADDER].sort((a, b) => b - a);
    assert.deepEqual([...JPEG_QUALITY_LADDER], sorted);
  });

  it('explains a refusal in user-facing terms', () => {
    assert.match(describeUploadRefusal(2 * 1024 * 1024), /2[0-9]{3} KB/);
    assert.match(describeUploadRefusal(null), /could not be prepared/);
  });
});
