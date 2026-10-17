import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { distanceMetres as metresBetween } from './geo';
import { captureFix, FIX_ACCURACY, toFixSample, type Coords } from './location';
import {
  isPlausibleTrackFix,
  meanFix,
  STOP_GOOD_ACCURACY_M,
  STOP_MAX_ACCURACY_M,
  STOP_MAX_SPREAD_M,
  trackDistanceMetres,
  type CapturedFix,
  type FixSample,
} from './track';

/**
 * Records the path a contributor actually travels.
 *
 * This is the counterpart to drawing on a map at home: the phone samples the
 * position while the person walks, cycles or drives, and the result is the road
 * they took rather than their guess at it.
 *
 * Two things happen at once:
 *
 * - **the track** — every reading that survives `isPlausibleTrackFix`, which is
 *   the line that gets saved and later snapped to roads;
 * - **the stop buffer** — a short rolling window of recent readings, so that a
 *   "mark this stop" tap can be averaged out of readings the device has already
 *   taken instead of opening a second GPS subscription for every tap.
 */

/** A reading at least this far from the last one becomes a new track point. */
const TRACK_DISTANCE_INTERVAL_M = 10;

/** …and at most this often, which bounds the work on a long drive (Android). */
const TRACK_TIME_INTERVAL_MS = 3000;

/** Readings kept for averaging a stop: ~16 × (up to) 3 s. */
const STOP_BUFFER_CAPACITY = 16;

/** Readings from the last few seconds are the ones that describe "here". */
const STOP_BUFFER_WINDOW_MS = 8000;

/** Averaging fewer readings than this is not worth calling an average. */
const STOP_BUFFER_MIN_SAMPLES = 3;

const TRACK_OPTIONS: Location.LocationOptions = {
  accuracy: FIX_ACCURACY,
  distanceInterval: TRACK_DISTANCE_INTERVAL_M,
  timeInterval: TRACK_TIME_INTERVAL_MS,
};

/**
 * How a captured stop turned out.
 *
 * - `ok` — accurate enough to trust as the stop.
 * - `rough` — accepted, but the fix was weak enough that the point may be off.
 * - `weak` — refused; the device could not see the sky well enough.
 * - `moving` — refused; the readings span too much ground, so the contributor
 *   never actually stopped.
 * - `unavailable` — refused; no location at all (permission or services off).
 */
export type StopStatus = 'ok' | 'rough' | 'weak' | 'moving' | 'unavailable';

export type StopCapture = {
  status: StopStatus;
  /** Present for `ok` and `rough`; the other statuses carry a rejected attempt. */
  fix: CapturedFix | null;
};

export type PathRecorder = {
  recording: boolean;
  /** Accepted track points, oldest first. */
  points: FixSample[];
  error: string | null;
  /**
   * Start a fresh track. `seed` is where the contributor was standing when they
   * pressed the button — the watch can take several seconds to produce its first
   * reading, and the trip must still start at the rank, not halfway down the road.
   */
  start: (seed?: Coords | null) => Promise<void>;
  /** Resume the watch on the track already recorded, without clearing it. */
  resume: () => Promise<void>;
  stop: () => void;
  clear: () => void;
  /** Drop the most recent track point (undo for a stray reading). */
  removeLast: () => void;
  /**
   * Add an averaged fix to the track by hand. Used when a contributor marks
   * stops without recording: the stops are then the points of the path.
   */
  addPoint: (fix: CapturedFix) => void;
  /**
   * Adopt a stored track so an existing path can be edited. The timestamps are
   * spread across the recorded duration, which keeps the stats unchanged when
   * the path is saved again.
   */
  loadVertices: (
    vertices: [number, number][],
    timing: { startedAt: number; durationSeconds: number },
  ) => void;
  /** Average the recent readings into a stop position, applying the quality gates. */
  markStop: () => Promise<StopCapture>;
  distanceMetres: number;
  durationSeconds: number;
};

export function usePathRecorder(): PathRecorder {
  const [points, setPoints] = useState<FixSample[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pointsRef = useRef<FixSample[]>([]);
  const bufferRef = useRef<FixSample[]>([]);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  const stop = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    setRecording(false);
  }, []);

  /**
   * Add a captured fix to the line.
   *
   * Captured stops are part of the path — the device's own readings between
   * them are the rest of it — so this inserts by capture time. A stop named
   * while the combi keeps moving therefore lands where it was measured, not at
   * the end of the line. A reading that repeats a spot already in the line is
   * ignored: the stop marker still exists, but the geometry does not double back.
   */
  const addPoint = useCallback((fix: CapturedFix) => {
    const sample: FixSample = {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      capturedAt: fix.capturedAt,
    };
    const current = pointsRef.current;
    const repeated = current.some(
      (point) =>
        Math.abs(point.capturedAt - sample.capturedAt) < 15_000 &&
        metresBetween(point, sample) < 3,
    );
    if (repeated) {
      return;
    }

    let index = current.length;
    while (index > 0 && current[index - 1].capturedAt > sample.capturedAt) {
      index -= 1;
    }
    const next = [...current.slice(0, index), sample, ...current.slice(index)];
    pointsRef.current = next;
    setPoints(next);
  }, []);

  /**
   * Open the GPS watch.
   *
   * `keep` is what tells a resume apart from a new recording: resuming carries
   * on where the track stopped, a new recording replaces it. A new recording is
   * seeded with the position the contributor was standing at, so the line starts
   * at the rank even if the first watch reading is slow to arrive.
   */
  const beginWatch = useCallback(async (seed: Coords | null, keep: boolean) => {
    if (subscription.current) {
      return;
    }
    setError(null);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setError('Location services are turned off on this device.');
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission is needed to record a path.');
        return;
      }

      let seeded: FixSample | null = null;
      if (!keep) {
        seeded =
          seed != null && Number.isFinite(seed.latitude) && Number.isFinite(seed.longitude)
            ? {
                latitude: seed.latitude,
                longitude: seed.longitude,
                // The map dot reports no radius, so none is claimed here.
                accuracy: null,
                capturedAt: Date.now(),
              }
            : null;
        pointsRef.current = seeded ? [seeded] : [];
        bufferRef.current = [];
        setPoints(pointsRef.current);
      }

      subscription.current = await Location.watchPositionAsync(TRACK_OPTIONS, (update) => {
        const sample = toFixSample(update);
        bufferRef.current = [...bufferRef.current, sample].slice(-STOP_BUFFER_CAPACITY);

        if (!isPlausibleTrackFix(sample, pointsRef.current[pointsRef.current.length - 1])) {
          return;
        }
        const next = [...pointsRef.current, sample];
        pointsRef.current = next;
        setPoints(next);
      });
      setRecording(true);

      // The watch only reports once somebody moves (or the platform decides to),
      // so the place the contributor started from would otherwise be missing.
      // When the map had no position to hand over, a short averaged reading is
      // taken in the background and becomes the first point of the line.
      if (!keep && !seeded) {
        void captureFix({ windowMs: 4000, minSamples: 2 }).then((startFix) => {
          if (startFix && pointsRef.current.length === 0) {
            addPoint(startFix);
          }
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start recording.');
    }
  }, [addPoint]);

  const start = useCallback(
    (seed?: Coords | null) => beginWatch(seed ?? null, false),
    [beginWatch],
  );
  const resume = useCallback(() => beginWatch(null, true), [beginWatch]);

  // Leaving the screen (or losing the app) must not leave the GPS running.
  useEffect(
    () => () => {
      subscription.current?.remove();
      subscription.current = null;
    },
    [],
  );

  const clear = useCallback(() => {
    pointsRef.current = [];
    setPoints([]);
  }, []);

  const removeLast = useCallback(() => {
    const next = pointsRef.current.slice(0, -1);
    pointsRef.current = next;
    setPoints(next);
  }, []);

  const loadVertices = useCallback(
    (vertices: [number, number][], timing: { startedAt: number; durationSeconds: number }) => {
      const stepMs =
        vertices.length > 1 ? (timing.durationSeconds * 1000) / (vertices.length - 1) : 0;
      const loaded: FixSample[] = vertices.map(([longitude, latitude], index) => ({
        latitude,
        longitude,
        // A stored track has no per-point accuracy left; the stops that came
        // with it still carry theirs.
        accuracy: null,
        capturedAt: timing.startedAt + index * stepMs,
      }));
      pointsRef.current = loaded;
      bufferRef.current = [];
      setPoints(loaded);
    },
    [],
  );

  const markStop = useCallback(async (): Promise<StopCapture> => {
    // Prefer the readings already in hand: while recording, the device has just
    // produced several of them, and none of them cost anything extra.
    const now = Date.now();
    const buffered = bufferRef.current.filter(
      (sample) => now - sample.capturedAt <= STOP_BUFFER_WINDOW_MS,
    );
    const average = buffered.length >= STOP_BUFFER_MIN_SAMPLES ? meanFix(buffered) : null;
    // A buffered average that spans too much ground usually means the readings
    // were taken while the vehicle was still moving — the last few seconds
    // before it stopped. A fresh capture measured from now is taken instead of
    // refusing the stop: the contributor has arrived, the buffer has not caught
    // up yet.
    const fix =
      average && average.spreadMetres <= STOP_MAX_SPREAD_M ? average : await captureFix();

    if (!fix) {
      return { status: 'unavailable', fix: null };
    }
    if (fix.spreadMetres > STOP_MAX_SPREAD_M) {
      return { status: 'moving', fix };
    }
    if (fix.accuracy != null && fix.accuracy > STOP_MAX_ACCURACY_M) {
      return { status: 'weak', fix };
    }
    const rough = fix.accuracy == null || fix.accuracy > STOP_GOOD_ACCURACY_M;
    return { status: rough ? 'rough' : 'ok', fix };
  }, []);

  const distanceMetres = useMemo(() => trackDistanceMetres(points), [points]);
  const durationSeconds = useMemo(() => {
    if (points.length < 2) {
      return 0;
    }
    return Math.max(0, (points[points.length - 1].capturedAt - points[0].capturedAt) / 1000);
  }, [points]);

  return {
    recording,
    points,
    error,
    start,
    resume,
    stop,
    clear,
    removeLast,
    addPoint,
    loadVertices,
    markStop,
    distanceMetres,
    durationSeconds,
  };
}