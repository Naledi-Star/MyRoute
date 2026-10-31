import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { labelledEndpoints } from '../src/lib/geo.ts';

/** A short hop: ~0.1° of longitude at Gaborone's latitude is far enough. */
const LINE = [
  [25.9, -24.65],
  [25.91, -24.66],
  [25.92, -24.67],
];

const labels = (points) => points.map((point) => point.label);

describe('labelledEndpoints', () => {
  it('labels the start and end when no stops were recorded', () => {
    const points = labelledEndpoints(LINE);

    assert.deepEqual(labels(points), ['Start', 'End']);
    assert.deepEqual([points[0].longitude, points[0].latitude], LINE[0]);
    assert.deepEqual([points[1].longitude, points[1].latitude], LINE[2]);
  });

  it('keeps stops in the middle as the bonus between A and B', () => {
    const stop = {
      id: 'stop-1',
      label: 'Station',
      latitude: -24.66,
      longitude: 25.91,
      accuracy: 12,
      capturedAt: 1000,
    };

    const points = labelledEndpoints(LINE, [stop]);

    assert.deepEqual(labels(points), ['Start', 'Station', 'End']);
    assert.equal(points[1].id, 'stop-1');
    assert.equal(points[1].accuracy, 12, 'the stop keeps its own data');
  });

  it('uses a stop sitting on the start instead of adding a second label', () => {
    const stopAtStart = {
      id: 'stop-rank',
      label: 'Block 8 rank',
      latitude: LINE[0][1],
      longitude: LINE[0][0],
      accuracy: 5,
      capturedAt: 500,
    };

    const points = labelledEndpoints(LINE, [stopAtStart]);

    assert.deepEqual(labels(points), ['Block 8 rank', 'End']);
  });

  it('labels one point as a start but never invents an end', () => {
    assert.deepEqual(labels(labelledEndpoints([LINE[0]])), ['Start']);
  });

  it('returns nothing for an empty line', () => {
    assert.deepEqual(labelledEndpoints([], []), []);
    assert.deepEqual(labelledEndpoints([], [{ id: 'x', label: 'A', latitude: 0, longitude: 0, accuracy: null, capturedAt: 0 }]), [
      { id: 'x', label: 'A', latitude: 0, longitude: 0, accuracy: null, capturedAt: 0 },
    ]);
  });

  it('still gives a loop two labels', () => {
    const loop = [LINE[0], LINE[1], [LINE[0][0] + 0.00001, LINE[0][1]]];

    assert.deepEqual(labels(labelledEndpoints(loop)), ['Start', 'End']);
  });

  it('leaves stored stops untouched when a path has no line yet', () => {
    const stop = {
      id: 'stop-2',
      label: 'Mall',
      latitude: -24.66,
      longitude: 25.91,
      accuracy: null,
      capturedAt: 1,
    };

    assert.deepEqual(labels(labelledEndpoints([], [stop])), ['Mall']);
  });
});
