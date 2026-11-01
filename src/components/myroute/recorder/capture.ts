import { useCallback, useEffect, useState } from 'react';

import { distanceMetres, DUPLICATE_STOP_M } from '@/lib/geo';
import type { PathWaypoint } from '@/lib/paths';
import { usePathRecorder } from '@/lib/recording';
import { addStopPhoto } from '@/lib/stop-photos';
import type { FixSample } from '@/lib/track';

/**
 * The mechanics both recorders share: the GPS track, the stops captured along
 * it, and the photos attached to those stops.
 *
 * What differs between a path and a combi route is the journey around this —
 * which is why each flow owns its own screen, its own save and its own
 * vocabulary. Nothing here decides what kind of record the line becomes.
 */

export type StopNotice = { tone: 'green' | 'amber' | 'red'; text: string } | null;

export function accuracyLabel(accuracy: number | null): string {
  return accuracy == null ? 'unknown accuracy' : `±${Math.round(accuracy)} m`;
}

function waypointFrom(fix: FixSample, label: string): PathWaypoint {
  return {
    id: `stop-${fix.capturedAt}`,
    label,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    capturedAt: fix.capturedAt,
  };
}

export function useTrackCapture() {
  const recorder = usePathRecorder();
  const [stops, setStops] = useState<PathWaypoint[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [stopNotice, setStopNotice] = useState<StopNotice>(null);
  const [justAdded, setJustAdded] = useState<PathWaypoint | null>(null);

  // The confirmation is a moment, not a mode: clear it on its own so the
  // recording screen returns to the journey without the contributor tapping.
  useEffect(() => {
    if (!justAdded) {
      return;
    }
    const timer = setTimeout(() => setJustAdded(null), 6000);
    return () => clearTimeout(timer);
  }, [justAdded]);

  /** Capture where the contributor is standing as a stop on this route. */
  const captureStop = useCallback(async () => {
    setCapturing(true);
    setStopNotice(null);
    try {
      const result = await recorder.markStop();
      const fix = result.fix;

      if (result.status === 'unavailable' || !fix) {
        setStopNotice({
          tone: 'red',
          text: 'Could not read your location. Check that location is turned on, then try again.',
        });
        return;
      }
      if (result.status === 'moving') {
        setStopNotice({ tone: 'amber', text: 'You are still moving — stop, then mark this stop.' });
        return;
      }
      if (result.status === 'weak') {
        setStopNotice({
          tone: 'red',
          text: `Weak fix (${accuracyLabel(fix.accuracy)}) — move into the open and try again.`,
        });
        return;
      }
      if (stops.some((stop) => distanceMetres(stop, fix) < DUPLICATE_STOP_M)) {
        setStopNotice({ tone: 'amber', text: 'A stop is already marked here.' });
        return;
      }

      const waypoint = waypointFrom(fix, `Stop ${stops.length + 1}`);
      recorder.addPoint(fix);
      setStops((current) => [...current, waypoint]);
      setJustAdded(waypoint);
    } finally {
      setCapturing(false);
    }
  }, [recorder, stops]);

  /** Rename a stop. Start/End generated from the line are edited like any other. */
  const setLabel = useCallback((stopId: string, label: string) => {
    setStops((current) => {
      if (current.some((stop) => stop.id === stopId)) {
        return current.map((stop) => (stop.id === stopId ? { ...stop, label } : stop));
      }
      return current;
    });
  }, []);

  /** Stage fare (pula) from the previous stop. Optional, so blank clears it. */
  const setFare = useCallback((stopId: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const fare = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    setStops((current) =>
      current.map((stop) => (stop.id === stopId ? { ...stop, fareFromPrevious: fare } : stop)),
    );
  }, []);

  /** Attach or replace a stop's photo. Optional: it never blocks saving. */
  const attachPhoto = useCallback(async (stopId: string) => {
    const outcome = await addStopPhoto('camera', stopId);
    if (outcome.status === 'saved') {
      setStops((current) =>
        current.map((stop) => (stop.id === stopId ? { ...stop, photoUri: outcome.uri } : stop)),
      );
      setStopNotice(null);
      return;
    }
    if (outcome.status === 'failed') {
      setStopNotice({ tone: 'amber', text: outcome.message });
    }
  }, []);

  return {
    recorder,
    points: recorder.points,
    recording: recorder.recording,
    recordedMetres: recorder.distanceMetres,
    stops,
    setStops,
    capturing,
    captureStop,
    stopNotice,
    setStopNotice,
    justAdded,
    setJustAdded,
    attachPhoto,
    setLabel,
    setFare,
  };
}
