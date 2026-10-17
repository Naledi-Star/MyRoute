import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { GABORONE_VIEW } from '@/constants/map';
import { meanFix, type CapturedFix, type FixSample } from './track';

export type Coords = { latitude: number; longitude: number };

export type LocationPermissionState = 'undetermined' | 'granted' | 'denied';

/**
 * The device position is plotted on the map, so every fix is requested at the
 * highest accuracy the platform offers. The cheaper `Balanced` level resolves
 * faster but is only good to a few hundred metres (a cell/Wi-Fi fix), which is
 * why the "you are here" dot used to land on the wrong street.
 */
export const FIX_ACCURACY = Location.Accuracy.Highest;

/** Watch settings: accurate fixes, but never chattier than 5 m / 5 s. */
const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: FIX_ACCURACY,
  distanceInterval: 5,
  timeInterval: 5000,
};

/** A cached fix older than this is too stale to show as the current position. */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;

/** How long a stop capture listens for readings before averaging what it has. */
const CAPTURE_WINDOW_MS = 6000;

/** Readings needed before a capture is even considered. */
const CAPTURE_MIN_SAMPLES = 3;

/** A capture stops early once an average this good is available. */
const CAPTURE_GOOD_ACCURACY_M = 15;

/** Raw readings arrive at roughly this rate while capturing (Android floor). */
const CAPTURE_SAMPLE_INTERVAL_MS = 500;

/** Turn a platform position into a plain reading the track helpers understand. */
export function toFixSample(position: Location.LocationObject): FixSample {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    capturedAt: position.timestamp,
  };
}

/**
 * Take one averaged, high-accuracy position — the "I am standing here" fix.
 *
 * A single reading is a point with a radius: ask twice from the same spot and
 * the answer can differ by tens of metres. This listens for a few seconds and
 * hands the readings to `meanFix`, which averages the ones that agree. It stops
 * as soon as an accurate enough average is available, so a good fix is quick and
 * a bad one spends the full window trying.
 *
 * Returns `null` when the permission is missing or nothing usable arrived.
 */
export async function captureFix({
  windowMs = CAPTURE_WINDOW_MS,
  minSamples = CAPTURE_MIN_SAMPLES,
  accuracyGoal = CAPTURE_GOOD_ACCURACY_M,
}: { windowMs?: number; minSamples?: number; accuracyGoal?: number } = {}): Promise<CapturedFix | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return null;
    }

    const samples: FixSample[] = [];
    let settle = () => {};
    const finished = new Promise<void>((resolve) => {
      settle = resolve;
    });

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: FIX_ACCURACY,
        distanceInterval: 0,
        timeInterval: CAPTURE_SAMPLE_INTERVAL_MS,
      },
      (update) => {
        const sample = toFixSample(update);
        samples.push(sample);
        const average = meanFix(samples);
        if (
          samples.length >= minSamples &&
          average?.accuracy != null &&
          average.accuracy <= accuracyGoal
        ) {
          settle();
        }
      },
    );

    const timer = setTimeout(settle, windowMs);
    try {
      await finished;
    } finally {
      clearTimeout(timer);
      subscription.remove();
    }

    return meanFix(samples);
  } catch {
    return null;
  }
}

/** Until the device reports a fix, the app falls back to the Gaborone reference point. */
export const FALLBACK_ORIGIN: Coords = {
  latitude: GABORONE_VIEW.center[1],
  longitude: GABORONE_VIEW.center[0],
};

/** The device position when we have one, otherwise the reference point. */
export function originFrom(coords: Coords | null): Coords {
  return coords ?? FALLBACK_ORIGIN;
}

/** One-shot read of the current position, without subscribing to updates. */
export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return null;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: FIX_ACCURACY });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    // A fresh, accurate fix needs a clear view of the sky. Fall back to the last
    // cached fix rather than reporting no position at all.
    try {
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      });
      return cached
        ? { latitude: cached.coords.latitude, longitude: cached.coords.longitude }
        : null;
    } catch {
      return null;
    }
  }
}

export type DeviceLocation = {
  /** Latest known position, or `null` until the first fix arrives. */
  coords: Coords | null;
  permission: LocationPermissionState;
  error: string | null;
  /** Requests permission (if needed) and starts watching the position. */
  start: () => Promise<void>;
  /**
   * Stops the watch. Used when something else takes over the GPS for a while —
   * a path recording, for instance — so the device is not running two
   * high-accuracy subscriptions at once.
   */
  stop: () => void;
  /** Latest position, or the Gaborone reference point. */
  origin: Coords;
};

/**
 * Tracks the device position with `expo-location`.
 *
 * The watch is deliberately foreground-only: the map screens need the current
 * position to plot "my location" and to use as a route origin, and background
 * location needs extra permissions and a native rebuild that this phase does not
 * require. If permission is denied (or location services are off) the hook keeps
 * reporting the Gaborone reference point so the rest of the app still works.
 */
export function useDeviceLocation({ auto = false }: { auto?: boolean } = {}): DeviceLocation {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permission, setPermission] = useState<LocationPermissionState>('undetermined');
  const [error, setError] = useState<string | null>(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const starting = useRef(false);
  const hasFix = useRef(false);

  const apply = useCallback((position: Location.LocationObject) => {
    hasFix.current = true;
    setCoords({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  }, []);

  const start = useCallback(async () => {
    if (starting.current) {
      return;
    }
    starting.current = true;
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setError('Location services are turned off on this device.');
        return;
      }

      const response = await Location.requestForegroundPermissionsAsync();
      if (response.status !== 'granted') {
        setPermission('denied');
        setError(
          'Location permission was denied. Allow it in Settings to see your exact position.',
        );
        return;
      }
      setPermission('granted');
      setError(null);

      // Start with whatever the device already knows so the dot (and the camera
      // that follows it) appears immediately instead of after the first fix.
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      });
      if (cached) {
        apply(cached);
      }

      subscription.current?.remove();
      subscription.current = await Location.watchPositionAsync(WATCH_OPTIONS, apply);

      // Then settle on a fresh, high-accuracy fix for the exact coordinates.
      apply(await Location.getCurrentPositionAsync({ accuracy: FIX_ACCURACY }));
    } catch (err) {
      // Only a failure with nothing on screen is worth reporting: the one-shot
      // request above can time out while the watch is already delivering fixes.
      if (!hasFix.current) {
        setError(err instanceof Error ? err.message : 'Could not read your location.');
      }
    } finally {
      starting.current = false;
    }
  }, [apply]);

  useEffect(() => {
    let active = true;
    if (auto) {
      // Defer out of the effect body so the state updates happen after the effect
      // has finished running, rather than triggering a cascading render.
      Promise.resolve().then(() => {
        if (active) {
          void start();
        }
      });
    }
    return () => {
      active = false;
      subscription.current?.remove();
      subscription.current = null;
    };
  }, [auto, start]);

  const stop = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
  }, []);

  return {
    coords,
    permission,
    error,
    start,
    stop,
    origin: originFrom(coords),
  };
}
