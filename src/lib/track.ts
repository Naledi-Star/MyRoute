import { distanceMetres, type LatLng } from './geo';

/**
 * Track maths for recorded paths.
 *
 * A phone never reports "the place I am standing"; it reports a point plus a
 * radius of uncertainty, and the answer jumps around inside that radius. The
 * helpers here turn that stream into something worth storing:
 *
 * - `meanFix` averages the readings that agree with each other and drops the
 *   ones that do not, which is what makes a captured stop land on the right
 *   side of the street rather than in the middle of a block.
 * - `isPlausibleTrackFix` throws away readings that would mean teleporting.
 * - `simplifyTrack` thins a few thousand readings down to the shape of the
 *   road before anything is drawn or sent to a routing engine.
 *
 * Everything in this module is pure: no Expo, no React Native, no storage.
 */

/** One raw position reading from the device. */
export type FixSample = {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in metres; `null` when the platform does not report one. */
  accuracy: number | null;
  /** When the device obtained the reading, in milliseconds since epoch. */
  capturedAt: number;
};

/** A position averaged from several readings — what a contributor can stand on. */
export type CapturedFix = {
  latitude: number;
  longitude: number;
  /**
   * Median radius of uncertainty of the readings that were averaged. Not the
   * single best reading: averaging does not make the device certain, so the
   * honest figure is the typical error of the group.
   */
  accuracy: number | null;
  capturedAt: number;
  /** How many readings went into the average after outliers were dropped. */
  samples: number;
  /** Widest gap between the averaged readings, in metres. */
  spreadMetres: number;
};

/**
 * Readings worse than this never join an average: at 100 m the device is
 * guessing from a cell tower, which is a different place, not a noisy one.
 */
const SAMPLE_REJECT_ACCURACY_M = 100;

/** Outliers sit further than this from the centre of the group. */
const CLUSTER_RADIUS_FLOOR_M = 20;

/** …and further than twice the best reading of the group. */
const CLUSTER_RADIUS_FACTOR = 2;

/** A track reading worse than this is not worth storing as part of a path. */
export const TRACK_MAX_ACCURACY_M = 50;

/** Roughly 200 km/h — faster than that is a bad reading, not a fast contributor. */
const IMPLAUSIBLE_SPEED_MS = 55;

/** Over a gap this long a speed check means nothing, so the reading is trusted. */
const SPEED_CHECK_MAX_GAP_MS = 120_000;

/** Tolerance (metres) used to thin a recorded track down to its shape. */
export const TRACK_SIMPLIFY_M = 8;

/** Tolerances used when a track is sent to the routing engine. */
export const SNAP_SIMPLIFY_M = 15;
export const SNAP_SIMPLIFY_MAX_POINTS = 100;

/** Stops closer together than this are the same stop, captured twice. */
export const DUPLICATE_STOP_M = 8;

/** Gate for a captured stop: worse than this and the point is refused. */
export const STOP_MAX_ACCURACY_M = 50;

/** Better than this is a clean fix; in between is accepted but flagged rough. */
export const STOP_GOOD_ACCURACY_M = 20;

/** Readings spread wider than this mean the contributor was still moving. */
export const STOP_MAX_SPREAD_M = 25;

function usableAccuracy(sample: FixSample): boolean {
  return (
    sample.accuracy == null ||
    !Number.isFinite(sample.accuracy) ||
    sample.accuracy <= SAMPLE_REJECT_ACCURACY_M
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Average a group of readings into one position.
 *
 * The readings are filtered twice before they are averaged: once on the
 * reported accuracy, and once on how far they sit from the centre of the group.
 * Without the second pass a single cold-start reading that landed a block away
 * drags the average off the pavement even when the device claimed it was good.
 */
export function meanFix(samples: FixSample[]): CapturedFix | null {
  const candidates = samples.filter(usableAccuracy);
  if (candidates.length === 0) {
    return null;
  }

  const reported = candidates
    .map((sample) => sample.accuracy)
    .filter((accuracy): accuracy is number => accuracy != null && Number.isFinite(accuracy));
  const best = reported.length > 0 ? Math.min(...reported) : null;

  const centre = {
    latitude: median(candidates.map((sample) => sample.latitude)) ?? candidates[0].latitude,
    longitude: median(candidates.map((sample) => sample.longitude)) ?? candidates[0].longitude,
  };
  const radius =
    best == null
      ? CLUSTER_RADIUS_FLOOR_M
      : Math.max(CLUSTER_RADIUS_FLOOR_M, best * CLUSTER_RADIUS_FACTOR);

  const clustered = candidates.filter((sample) => distanceMetres(centre, sample) <= radius);
  // If the cluster pass empties the group, the device really was that scattered;
  // averaging everything is still better than reporting nothing.
  const used = clustered.length > 0 ? clustered : candidates;

  const latitude = used.reduce((total, sample) => total + sample.latitude, 0) / used.length;
  const longitude = used.reduce((total, sample) => total + sample.longitude, 0) / used.length;
  const spreadMetres = used.reduce(
    (widest, sample) => Math.max(widest, distanceMetres({ latitude, longitude }, sample)),
    0,
  );

  return {
    latitude,
    longitude,
    accuracy: median(
      used
        .map((sample) => sample.accuracy)
        .filter((accuracy): accuracy is number => accuracy != null && Number.isFinite(accuracy)),
    ),
    capturedAt: used[used.length - 1].capturedAt,
    samples: used.length,
    spreadMetres,
  };
}

/**
 * Whether a reading belongs on the track.
 *
 * Rejects readings the device itself distrusts, readings that repeat the same
 * timestamp, and readings that would mean a speed no vehicle reaches. A long
 * gap between readings makes the speed test meaningless (the phone was asleep,
 * or out of sight of the sky), so the reading is accepted instead.
 */
export function isPlausibleTrackFix(next: FixSample, previous: FixSample | undefined): boolean {
  if (!usableAccuracy(next)) {
    return false;
  }
  if (next.accuracy != null && next.accuracy > TRACK_MAX_ACCURACY_M) {
    return false;
  }
  if (!previous) {
    return true;
  }
  const elapsedMs = next.capturedAt - previous.capturedAt;
  if (elapsedMs <= 0) {
    return false;
  }
  if (elapsedMs > SPEED_CHECK_MAX_GAP_MS) {
    return true;
  }
  return distanceMetres(previous, next) / (elapsedMs / 1000) <= IMPLAUSIBLE_SPEED_MS;
}

/**
 * The line a recorded path saves: the track, with every captured stop in it.
 *
 * A stop is normally already on the track, because the recorder inserts it the
 * moment it is named. This merges anyway, for the cases where it is not: a stop
 * restored from a stored path, or a trip where the named stops are the only
 * positions the device produced. Stops are ordered by capture time, and a stop
 * that repeats a spot the track already holds does not double the line back.
 */
export function trackWithStops(
  points: FixSample[],
  stops: { latitude: number; longitude: number; capturedAt: number }[],
): FixSample[] {
  const merged = [...points];
  for (const stop of stops) {
    const sample: FixSample = {
      latitude: stop.latitude,
      longitude: stop.longitude,
      accuracy: null,
      capturedAt: stop.capturedAt,
    };
    const repeated = merged.some(
      (point) =>
        Math.abs(point.capturedAt - sample.capturedAt) < 15_000 &&
        distanceMetres(point, sample) < DUPLICATE_STOP_M / 2,
    );
    if (repeated) {
      continue;
    }
    let index = merged.length;
    while (index > 0 && merged[index - 1].capturedAt > sample.capturedAt) {
      index -= 1;
    }
    merged.splice(index, 0, sample);
  }
  return merged;
}

/** Total length of a track in metres. */
export function trackDistanceMetres(points: LatLng[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMetres(points[index - 1], points[index]);
  }
  return total;
}

/** Local flat projection, accurate enough over the length of one track segment. */
function project(point: LatLng, origin: LatLng): { x: number; y: number } {
  const metresPerDegreeLat = 110574;
  const metresPerDegreeLng = 111320 * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * metresPerDegreeLng,
    y: (point.latitude - origin.latitude) * metresPerDegreeLat,
  };
}

/** Perpendicular distance from `point` to the segment `start`–`end`, in metres. */
function perpendicularMetres(point: LatLng, start: LatLng, end: LatLng): number {
  const projectedPoint = project(point, start);
  const projectedEnd = project(end, start);
  const length = Math.hypot(projectedEnd.x, projectedEnd.y);
  if (length === 0) {
    return Math.hypot(projectedPoint.x, projectedPoint.y);
  }
  // |cross product| / |segment| is the distance from the point to the line.
  return Math.abs(projectedEnd.x * projectedPoint.y - projectedEnd.y * projectedPoint.x) / length;
}

function douglasPeucker<T extends LatLng>(points: T[], toleranceMetres: number): T[] {
  if (points.length < 3) {
    return points;
  }
  const start = points[0];
  const end = points[points.length - 1];

  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularMetres(points[index], start, end);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }

  // Every point is within tolerance, so the straight line between the ends is
  // a faithful stand-in for the whole section.
  if (farthestDistance <= toleranceMetres) {
    return [start, end];
  }

  const left = douglasPeucker(points.slice(0, farthestIndex + 1), toleranceMetres);
  const right = douglasPeucker(points.slice(farthestIndex), toleranceMetres);
  return [...left.slice(0, -1), ...right];
}

/**
 * Thin a recorded track while keeping its shape.
 *
 * The public OSRM instance used for road snapping accepts only a limited number
 * of coordinates per request, and the recorded track is far longer than that.
 * Starting from a tolerance and widening it until the result fits is simpler
 * than truncating, and it degrades gracefully: a very long drive keeps its
 * corners and loses the noise.
 */
export function simplifyTrack<T extends LatLng>(
  points: T[],
  toleranceMetres: number,
  maxPoints = SNAP_SIMPLIFY_MAX_POINTS,
): T[] {
  if (points.length <= 2) {
    return points;
  }
  let tolerance = Math.max(1, toleranceMetres);
  let kept = douglasPeucker(points, tolerance);
  while (kept.length > maxPoints && tolerance < 5000) {
    tolerance *= 2;
    kept = douglasPeucker(points, tolerance);
  }
  return kept;
}
