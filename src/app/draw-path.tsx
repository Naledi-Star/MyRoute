import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker, MapRoute } from '@/components/myroute/map-types';
import { AppText } from '@/components/myroute/text';
import {
  PrimaryButton,
  RoundButton,
  SecondaryButton,
  Segmented,
  SheetHandle,
  Tap,
  TextField,
  TopBar,
} from '@/components/myroute/ui';
import { DEFAULT_MAP_STYLE } from '@/constants/map';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { submitPath } from '@/lib/api';
import { distanceMetres, formatDistance } from '@/lib/geo';
import { useDeviceLocation } from '@/lib/location';
import { addPath, loadPaths, snapVertices, type PathWaypoint, type SavedPath } from '@/lib/paths';
import { usePathRecorder } from '@/lib/recording';
import { formatDuration, type TravelProfile } from '@/lib/routing';
import { addStopPhoto } from '@/lib/stop-photos';
import {
  DUPLICATE_STOP_M,
  SNAP_SIMPLIFY_M,
  STOP_GOOD_ACCURACY_M,
  simplifyTrack,
  trackWithStops,
  type CapturedFix,
} from '@/lib/track';

const PROFILE_LABELS: Record<TravelProfile, string> = {
  car: 'Car',
  bike: 'Bike',
  foot: 'Walk',
};

const PROFILE_ORDER: TravelProfile[] = ['car', 'bike', 'foot'];

const MODE_LABELS: Record<CaptureMode, string> = {
  record: 'Record',
  draw: 'Draw',
};

const MODE_ORDER: CaptureMode[] = ['record', 'draw'];

/**
 * How a path is built:
 * - `record` — the phone traces the road while the contributor travels it, and
 *   stops are captured on the ground with their real coordinates.
 * - `draw` — the original flow, tapping the map to place points by hand.
 */
type CaptureMode = 'record' | 'draw';

/**
 * A captured position waiting to be named. The stop is not stored until the
 * contributor either names it or accepts the suggested name, so a mistyped or
 * unwanted capture can be thrown away instead of polluting the path.
 */
type PendingStop = {
  fix: CapturedFix;
  /** Pre-filled name, e.g. "Start" or "Stop 3". */
  suggestedLabel: string;
  /** Set when an existing stop is being renamed or re-photographed. */
  id: string | null;
};

/** Accuracy label for a captured stop, e.g. "±6 m". */
function accuracyLabel(accuracy: number | null): string {
  return accuracy == null ? 'unknown accuracy' : `±${Math.round(accuracy)} m`;
}

export default function DrawPathScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: editingId } = useLocalSearchParams<{ id?: string }>();

  const [mode, setMode] = useState<CaptureMode>('record');
  // Hand-placed points live here; a recorded track lives in the recorder, which
  // stays the single source of truth for what the device actually saw.
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [stops, setStops] = useState<PathWaypoint[]>([]);
  const [stopNotice, setStopNotice] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(
    null,
  );
  const [capturing, setCapturing] = useState(false);
  const [pendingStop, setPendingStop] = useState<PendingStop | null>(null);
  const [stopName, setStopName] = useState('');
  const [stopPhotoUri, setStopPhotoUri] = useState<string | null>(null);
  const [stopFare, setStopFare] = useState('');
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [combiMode, setCombiMode] = useState(false);
  const [combiName, setCombiName] = useState('');
  const [combiRank, setCombiRank] = useState('');
  const [profile, setProfile] = useState<TravelProfile>('foot');
  const [snapped, setSnapped] = useState<MapRoute | null>(null);
  const [snapInfo, setSnapInfo] = useState<{ distanceMetres: number; durationSeconds: number } | null>(
    null,
  );
  const [snapping, setSnapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SavedPath | null>(null);
  const [focusedOnMe, setFocusedOnMe] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(300);

  const recorder = usePathRecorder();
  const { height: windowHeight } = useWindowDimensions();
  const {
    recording,
    points,
    distanceMetres: recordedMetres,
    durationSeconds: recordedSeconds,
    loadVertices,
  } = recorder;

  // The map's own dot. While recording, the recorder already has a high-accuracy
  // watch running, so this one is paused rather than run alongside it.
  const { coords, start: startLocation, stop: stopLocation } = useDeviceLocation({ auto: false });
  useEffect(() => {
    if (recording) {
      stopLocation();
      return;
    }
    void startLocation();
  }, [recording, startLocation, stopLocation]);

  // Opened from the Saved tab: load that path so it can be edited and re-snapped.
  useEffect(() => {
    if (!editingId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const existing = (await loadPaths()).find((path) => path.id === editingId);
      if (cancelled || !existing) {
        return;
      }
      setEditing(existing);
      setMode(existing.source === 'recorded' ? 'record' : 'draw');
      if (existing.source === 'recorded') {
        loadVertices(existing.vertices, {
          startedAt: existing.createdAt,
          durationSeconds: existing.durationSeconds,
        });
      } else {
        setDrawVertices(existing.vertices);
      }
      setStops(existing.waypoints ?? []);
      setProfile(existing.profile);
      setName(existing.name);
      setSnapped(
        existing.snapped ? { coordinates: existing.coordinates, color: Palette.blue } : null,
      );
      setSnapInfo(
        existing.distanceMetres || existing.durationSeconds
          ? {
              distanceMetres: existing.distanceMetres,
              durationSeconds: existing.durationSeconds,
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the id and the stable loader only: re-running this
    // on every recorded point would reload the path mid-recording.
  }, [editingId, loadVertices]);

  /**
   * The line this screen will save.
   *
   * The recorded track already contains every captured stop (the recorder
   * inserts them by time), and every stop is merged in anyway: the coordinates
   * collected on the way are the road, the stops are the named points on it, and
   * neither may be lost because the other happened to exist. A trip with few
   * watch readings and two marked stops is still a complete path.
   */
  const geometry = useMemo<[number, number][]>(() => {
    if (mode === 'draw') {
      return drawVertices;
    }
    return trackWithStops(recorder.points, stops).map(
      (point) => [point.longitude, point.latitude] as [number, number],
    );
  }, [drawVertices, mode, recorder.points, stops]);

  const shownError = error ?? recorder.error;

  const resetResult = useCallback(() => {
    setSnapped(null);
    setSnapInfo(null);
    setStopNotice(null);
  }, []);

  const addVertex = useCallback(
    (point: { latitude: number; longitude: number }) => {
      resetResult();
      setError(null);
      setDrawVertices((current) => [...current, [point.longitude, point.latitude]]);
    },
    [resetResult],
  );

  const clear = useCallback(() => {
    resetResult();
    recorder.clear();
    setDrawVertices([]);
    setStops([]);
    setPendingStop(null);
    setStopPhotoUri(null);
  }, [recorder, resetResult]);

  const stopRecording = useCallback(() => {
    recorder.stop();
    setStopNotice(
      recorder.points.length > 1
        ? {
            tone: 'green',
            text: `Recording stopped after ${formatDistance(recordedMetres)}. Add any stops you passed, then save below.`,
          }
        : null,
    );
  }, [recordedMetres, recorder]);

  const undo = useCallback(() => {
    resetResult();
    if (pendingStop) {
      // A capture that has not been named yet is the most recent thing to undo.
      setPendingStop(null);
      setStopPhotoUri(null);
      return;
    }
    if (mode === 'draw') {
      setDrawVertices((current) => current.slice(0, -1));
      return;
    }
    const lastStop = stops[stops.length - 1];
    const lastPoint = recorder.points[recorder.points.length - 1];
    if (lastStop && (!lastPoint || lastStop.capturedAt >= lastPoint.capturedAt)) {
      setStops((current) => current.slice(0, -1));
      return;
    }
    recorder.removeLast();
  }, [mode, pendingStop, recorder, resetResult, stops]);

  const switchMode = useCallback(
    (next: CaptureMode) => {
      if (next === mode) {
        return;
      }
      // Each mode builds its own line, so switching starts from a clean slate
      // instead of mixing a recorded track with hand-placed points.
      recorder.stop();
      recorder.clear();
      setDrawVertices([]);
      setStops([]);
      setPendingStop(null);
      setStopPhotoUri(null);
      setFocusedOnMe(false);
      resetResult();
      setError(null);
      setMode(next);
    },
    [mode, recorder, resetResult],
  );

  const toggleRecording = useCallback(() => {
    if (recording) {
      stopRecording();
      return;
    }
    setStopNotice(null);
    setError(null);
    // The dot on the map is the position the contributor is standing at, which
    // is where this trip starts — not wherever the GPS happens to report first.
    void recorder.start(coords);
  }, [coords, recorder, recording, stopRecording]);

  const markStop = useCallback(async () => {
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
        setStopNotice({
          tone: 'amber',
          text: 'You are still moving — stop, then mark this stop.',
        });
        return;
      }
      if (result.status === 'weak') {
        setStopNotice({
          tone: 'red',
          text: `Weak fix (${accuracyLabel(fix.accuracy)}) — not saved. Move into the open and try again.`,
        });
        return;
      }

      const previous = stops[stops.length - 1];
      if (previous && !recording && distanceMetres(previous, fix) < DUPLICATE_STOP_M) {
        setStopNotice({
          tone: 'amber',
          text: `${accuracyLabel(fix.accuracy)} — same place as "${previous.label}", so it was not added.`,
        });
        return;
      }

      // Hold the fix while it is named: the stop, and the photo that goes with
      // it, are only stored once the contributor accepts them.
      const suggestedLabel = stops.length === 0 ? 'Start' : `Stop ${stops.length + 1}`;
      setPendingStop({ fix, suggestedLabel, id: null });
      setStopName(suggestedLabel);
      setStopPhotoUri(null);
      setStopFare('');
      setStopNotice({
        tone: result.status === 'ok' ? 'green' : 'amber',
        text:
          result.status === 'ok'
            ? `${accuracyLabel(fix.accuracy)} — name this stop.`
            : `Rough fix (${accuracyLabel(fix.accuracy)}) — name it, and expect this point to be loose.`,
      });
    } finally {
      setCapturing(false);
    }
  }, [recorder, recording, stops]);

  /** Store the stop being named, adding or updating it in place. */
  const confirmStop = useCallback(() => {
    const pending = pendingStop;
    if (!pending) {
      return;
    }
    const label = stopName.trim() || pending.suggestedLabel;
    const parsedFare = stopFare.trim().length > 0 ? Number(stopFare.replace(',', '.')) : null;
    const fare = parsedFare != null && Number.isFinite(parsedFare) && parsedFare >= 0 ? parsedFare : null;
    const waypoint: PathWaypoint = {
      id: pending.id ?? `stop-${pending.fix.capturedAt}`,
      label,
      latitude: pending.fix.latitude,
      longitude: pending.fix.longitude,
      accuracy: pending.fix.accuracy,
      capturedAt: pending.fix.capturedAt,
      ...(stopPhotoUri ? { photoUri: stopPhotoUri } : {}),
      ...(combiMode && fare != null ? { fareFromPrevious: fare } : {}),
    };

    // Every captured stop is a point on the line, recording or not: that is what
    // makes "start, stop, stop, save" a complete path even if the watch was
    // sparse between the stops.
    if (!pending.id) {
      recorder.addPoint(pending.fix);
    }

    setStops((current) =>
      pending.id
        ? current.map((stop) => (stop.id === pending.id ? waypoint : stop))
        : [...current, waypoint],
    );
    setPendingStop(null);
    setStopPhotoUri(null);
    resetResult();
    setStopNotice({
      tone: 'green',
      text: `${label} saved at ${accuracyLabel(pending.fix.accuracy)}${
        waypoint.photoUri ? ' with a photo' : ''
      }.`,
    });
  }, [combiMode, pendingStop, recorder, resetResult, stopFare, stopName, stopPhotoUri]);

  const discardStop = useCallback(() => {
    setPendingStop(null);
    setStopPhotoUri(null);
    setStopNotice(null);
  }, []);

  /** Rename a stored stop, or add a photo to it. */
  const editStop = useCallback((stop: PathWaypoint) => {
    setPendingStop({
      fix: {
        latitude: stop.latitude,
        longitude: stop.longitude,
        accuracy: stop.accuracy,
        capturedAt: stop.capturedAt,
        samples: 0,
        spreadMetres: 0,
      },
      suggestedLabel: stop.label,
      id: stop.id,
    });
    setStopName(stop.label);
    setStopPhotoUri(stop.photoUri ?? null);
    setStopFare(stop.fareFromPrevious != null ? String(stop.fareFromPrevious) : '');
    setStopNotice(null);
  }, []);

  const chooseStopPhoto = useCallback(
    async (source: 'camera' | 'library') => {
      const pending = pendingStop;
      if (!pending) {
        return;
      }
      setAddingPhoto(true);
      try {
        const outcome = await addStopPhoto(
          source,
          pending.id ?? `stop-${pending.fix.capturedAt}`,
        );
        if (outcome.status === 'saved') {
          setStopPhotoUri(outcome.uri);
          setStopNotice(null);
        } else if (outcome.status === 'failed') {
          setStopNotice({ tone: 'red', text: outcome.message });
        }
      } finally {
        setAddingPhoto(false);
      }
    },
    [pendingStop],
  );

  const snap = useCallback(async () => {
    if (geometry.length < 2) {
      setError('Add at least two points before snapping.');
      return;
    }
    setSnapping(true);
    setError(null);
    try {
      // A recorded track has far more points than the routing engine accepts in
      // one request, so it is thinned to its shape first.
      const source =
        mode === 'record' && points.length > 2
          ? simplifyTrack(points, SNAP_SIMPLIFY_M).map(
              (point) => [point.longitude, point.latitude] as [number, number],
            )
          : geometry;
      const result = await snapVertices(source, profile);
      setSnapped({ coordinates: result.coordinates, color: Palette.blue });
      setSnapInfo({ distanceMetres: result.distanceMetres, durationSeconds: result.durationSeconds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not snap to roads.');
    } finally {
      setSnapping(false);
    }
  }, [geometry, mode, points, profile]);

  const save = useCallback(async () => {
    if (geometry.length < 2) {
      setError(
        mode === 'record'
          ? 'Add one more stop, or record a little further, before saving.'
          : 'A path needs at least two points.',
      );
      return;
    }
    if (combiMode && (mode !== 'record' || stops.length < 2)) {
      setError('A combi route needs at least two named stops, recorded on the ground.');
      return;
    }
    if (combiMode && !combiName.trim() && !name.trim()) {
      setError('Give the combi route a name, for example Block 8 Route 4.');
      return;
    }
    setSaving(true);
    try {
      const coordinates = snapped?.coordinates ?? geometry;
      const recordedStats =
        mode === 'record'
          ? { distanceMetres: recordedMetres, durationSeconds: recordedSeconds }
          : { distanceMetres: 0, durationSeconds: 0 };
      const saved = await addPath({
        // Keep the same record when editing so the path is updated, not duplicated.
        ...(editing ? { id: editing.id, createdAt: editing.createdAt, status: editing.status } : {}),
        name: name.trim() || `Path ${new Date().toLocaleDateString()}`,
        profile,
        vertices: geometry,
        waypoints: mode === 'record' ? stops : [],
        source: mode === 'record' ? 'recorded' : 'drawn',
        kind: combiMode ? 'combi' : 'path',
        ...(combiMode
          ? { combiName: combiName.trim() || name.trim(), rank: combiRank.trim() }
          : {}),
        coordinates,
        snapped: snapped != null,
        distanceMetres: snapInfo?.distanceMetres ?? recordedStats.distanceMetres,
        durationSeconds: snapInfo?.durationSeconds ?? recordedStats.durationSeconds,
      });
      const created = saved[0];
      if (created) {
        const synced = await submitPath(created);
        if (synced !== created) {
          await addPath(synced);
        }
      }
      router.navigate('/saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the path.');
    } finally {
      setSaving(false);
    }
  }, [
    combiMode,
    combiName,
    combiRank,
    editing,
    geometry,
    mode,
    name,
    profile,
    recordedMetres,
    recordedSeconds,
    router,
    snapInfo,
    snapped,
    stops,
  ]);

  const preview = useMemo<MapRoute | undefined>(() => {
    if (snapped) {
      return snapped;
    }
    if (geometry.length < 2) {
      return undefined;
    }
    return { coordinates: geometry, color: Palette.green };
  }, [geometry, snapped]);

  const markers = useMemo<MapMarker[]>(() => {
    if (mode === 'record') {
      // One pin per captured stop, not per track point: a recorded line can hold
      // hundreds of them and the map should stay readable. The place Start was
      // pressed is a pin of its own, so before any stop has been named the trip
      // still shows where it began.
      const pins: MapMarker[] = [];
      const start = recorder.points[0];
      const startCoveredByStop =
        start != null && stops.some((stop) => distanceMetres(stop, start) < DUPLICATE_STOP_M);
      if (start && !startCoveredByStop) {
        pins.push({
          id: 'track-start',
          latitude: start.latitude,
          longitude: start.longitude,
          label: 'Start',
          tone: 'green',
          kind: 'destination',
        });
      }
      stops.forEach((stop) => {
        pins.push({
          id: stop.id,
          latitude: stop.latitude,
          longitude: stop.longitude,
          label: stop.label,
          tone:
            stop.accuracy != null && stop.accuracy > STOP_GOOD_ACCURACY_M
              ? 'amber'
              : stop.label === 'Start'
                ? 'green'
                : 'blue',
          kind: 'destination',
        });
      });
      return pins;
    }
    return drawVertices.map((coordinate, index) => ({
      id: `vertex-${index}`,
      latitude: coordinate[1],
      longitude: coordinate[0],
      label: `${index + 1}`,
      tone: index === 0 ? 'green' : 'blue',
      kind: 'destination' as const,
    }));
  }, [drawVertices, mode, recorder.points, stops]);

  // While recording, the freshest position comes from the recorder's own watch.
  const lastPoint = points[points.length - 1];
  const liveLocation = recording && lastPoint ? lastPoint : coords;

  const measureSheet = (event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height);
  };

  const recentre = useCallback(() => {
    setFocusedOnMe(true);
    setRecenterKey((value) => value + 1);
    if (!liveLocation) {
      void startLocation();
    }
  }, [liveLocation, startLocation]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <InteractiveMap
        bottomInset={sheetHeight}
        focus={mode === 'record' || focusedOnMe ? 'me' : 'gaborone'}
        followUser={recording}
        markers={markers}
        onMapPress={mode === 'draw' ? addVertex : undefined}
        recenterKey={recenterKey}
        route={preview}
        styleId={DEFAULT_MAP_STYLE}
        userLocation={liveLocation}
      />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TopBar
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          title={editing ? 'Edit path' : mode === 'record' ? 'Record a path' : 'Draw a path'}
        />
      </View>

      <View style={[styles.actions, { top: insets.top + 70 }]}>
        <RoundButton
          accessibilityLabel="Undo last point"
          icon="back"
          onPress={undo}
          style={styles.action}
        />
        {recording ? null : (
          <RoundButton
            accessibilityLabel="Clear the path"
            icon="close"
            onPress={clear}
            style={styles.action}
          />
        )}
        <RoundButton
          accessibilityLabel="Recentre on my location"
          icon="locate"
          iconColor={Palette.blue}
          onPress={recentre}
          style={styles.action}
        />
      </View>

      <View
        onLayout={measureSheet}
        style={[
          styles.sheet,
          { maxHeight: Math.round(windowHeight * 0.85), paddingBottom: insets.bottom + 18 },
        ]}>
        <SheetHandle />
        {/* Everything on the sheet scrolls: with the keyboard open the sheet
            cannot grow past the window, and the field being typed into stays
            reachable instead of hiding behind the keyboard. */}
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

        {recording ? null : (
          <Segmented
            onChange={(value) => {
              const next = MODE_ORDER.find((key) => MODE_LABELS[key] === value);
              if (next) {
                switchMode(next);
              }
            }}
            options={MODE_ORDER.map((key) => MODE_LABELS[key])}
            value={MODE_LABELS[mode]}
          />
        )}

        {mode === 'record' ? (
          <>
            {recording ? (
              <View style={styles.recordingStrip}>
                <View style={styles.recordingDot} />
                <AppText color="blue" size={12} weight="semibold" style={styles.recordingText}>
                  Recording · {formatDistance(recordedMetres)}
                  {` · ${stops.length} stop${stops.length === 1 ? '' : 's'}`}
                </AppText>
              </View>
            ) : (
              <>
                <AppText size={13} weight="bold" style={styles.modeHeading}>
                  {points.length > 0
                    ? `${points.length} points recorded`
                    : 'Walk it, then save the road you took'}
                </AppText>
                <AppText color="muted" variant="small" style={styles.hint}>
                  Start recording to trace where you go, or just mark each stop where you are
                  standing.
                </AppText>

                {points.length > 0 ? (
                  <View style={styles.statsRow}>
                    <Icon color={Palette.green} name="check" size={15} />
                    <AppText color="green" size={11} weight="semibold">
                      Recorded · {formatDistance(recordedMetres)}
                      {recordedSeconds > 0 ? ` · ${formatDuration(recordedSeconds)}` : ''}
                      {` · ${points.length} point${points.length === 1 ? '' : 's'}`}
                    </AppText>
                  </View>
                ) : null}
              </>
            )}

            {pendingStop ? (
              <View style={styles.stopCard}>
                <View style={styles.stopCardHeader}>
                  <Icon color={Palette.green} name="pin" size={15} />
                  <AppText size={12} weight="bold" style={styles.stopCardTitle}>
                    {pendingStop.id ? 'Edit this stop' : 'Name this stop'}
                  </AppText>
                  <AppText color="green" size={11} weight="semibold">
                    {accuracyLabel(pendingStop.fix.accuracy)}
                  </AppText>
                </View>

                <View style={styles.stopNameField}>
                  <TextField
                    autoFocus={!pendingStop.id}
                    onChangeText={setStopName}
                    placeholder={pendingStop.suggestedLabel}
                    value={stopName}
                  />
                </View>

                {combiMode ? (
                  <View style={styles.fareRow}>
                    <AppText color="muted" size={10} style={styles.fareLabel}>
                      Fare from the previous stop
                    </AppText>
                    <View style={styles.fareField}>
                      <AppText color="muted" size={11} weight="bold">
                        P
                      </AppText>
                      <TextField
                        keyboardType="decimal-pad"
                        onChangeText={setStopFare}
                        placeholder="e.g. 9"
                        value={stopFare}
                      />
                    </View>
                  </View>
                ) : null}

                <View style={styles.photoRow}>
                  {stopPhotoUri ? (
                    <View style={styles.photoPreview}>
                      <Image
                        contentFit="cover"
                        source={{ uri: stopPhotoUri }}
                        style={styles.photoThumb}
                      />
                      <Tap
                        accessibilityLabel="Remove the photo"
                        onPress={() => setStopPhotoUri(null)}
                        style={styles.photoRemove}>
                        <Icon color={Palette.surface} name="close" size={12} />
                      </Tap>
                    </View>
                  ) : null}
                  <SecondaryButton
                    icon="camera"
                    label={addingPhoto ? 'Opening…' : stopPhotoUri ? 'Retake' : 'Add photo'}
                    onPress={() => void chooseStopPhoto('camera')}
                    small
                  />
                  {stopPhotoUri ? null : (
                    <Tap
                      accessibilityLabel="Choose a photo from your library"
                      onPress={() => void chooseStopPhoto('library')}>
                      <AppText color="green" size={11} weight="semibold">
                        Library
                      </AppText>
                    </Tap>
                  )}
                </View>

                <View style={styles.recordActions}>
                  <PrimaryButton
                    label="Save stop"
                    onPress={confirmStop}
                    style={styles.recordButton}
                  />
                  <SecondaryButton
                    label="Discard"
                    onPress={discardStop}
                    style={styles.stopButton}
                  />
                </View>

                <AppText color="muted" size={10} style={styles.photoHint}>
                  {recording
                    ? 'A photo is optional — recording keeps running while you name this stop.'
                    : 'A photo is optional — name it and this point joins your path.'}
                </AppText>
              </View>
            ) : recording ? (
              // While recording, the controls are the two things that matter and
              // nothing else, so the map keeps the screen.
              <View style={styles.recordingActions}>
                <PrimaryButton
                  icon="pin"
                  label={capturing ? 'Measuring…' : 'Add stop'}
                  onPress={() => void markStop()}
                  style={styles.addStopButton}
                />
                <SecondaryButton label="Stop" onPress={toggleRecording} style={styles.stopRecording} />
              </View>
            ) : points.length > 1 ? (
              // Stopped with a track in hand: the job now is naming the stops
              // that were passed, then saving. Re-recording would throw the
              // trip away, so it is not offered here — the ✕ clears instead.
              <View style={styles.recordActions}>
                <PrimaryButton
                  icon="pin"
                  label={capturing ? 'Measuring…' : 'Add stop'}
                  onPress={() => void markStop()}
                  style={styles.recordButton}
                />
                <SecondaryButton
                  icon="locate"
                  label="Keep recording"
                  onPress={() => void recorder.resume()}
                  style={styles.stopButton}
                />
              </View>
            ) : (
              <View style={styles.recordActions}>
                <PrimaryButton
                  icon="locate"
                  label="Start recording"
                  onPress={toggleRecording}
                  style={styles.recordButton}
                />
                <SecondaryButton
                  icon="pin"
                  label={capturing ? 'Measuring…' : 'Mark a stop'}
                  onPress={() => void markStop()}
                  style={styles.stopButton}
                />
              </View>
            )}

            {stopNotice ? (
              <AppText color={stopNotice.tone} size={11} style={styles.notice}>
                {stopNotice.text}
              </AppText>
            ) : null}

            {!recording && stops.length > 0 ? (
              <View style={styles.stopList}>
                {stops.slice(-3).map((stop) => (
                  <Tap
                    accessibilityLabel={`Edit ${stop.label}`}
                    key={stop.id}
                    onPress={() => editStop(stop)}
                    style={styles.stopRow}>
                    {stop.photoUri ? (
                      <Image
                        contentFit="cover"
                        source={{ uri: stop.photoUri }}
                        style={styles.stopRowThumb}
                      />
                    ) : (
                      <Icon color={Palette.green} name="pin" size={13} />
                    )}
                    <AppText numberOfLines={1} size={11} style={styles.stopRowName} weight="semibold">
                      {stop.label}
                    </AppText>
                    <AppText color="muted" size={10}>
                      {accuracyLabel(stop.accuracy)}
                      {stop.fareFromPrevious != null ? ` · P${stop.fareFromPrevious}` : ''}
                    </AppText>
                  </Tap>
                ))}
                {stops.length > 3 ? (
                  <AppText color="muted" size={10}>
                    +{stops.length - 3} earlier stop{stops.length - 3 === 1 ? '' : 's'}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <AppText size={13} weight="bold" style={styles.modeHeading}>
              Tap the map to add points
            </AppText>
            <AppText color="muted" variant="small" style={styles.hint}>
              {drawVertices.length === 0
                ? 'Start where the path begins, then tap each turn.'
                : `${drawVertices.length} point${drawVertices.length === 1 ? '' : 's'}${
                    snapped ? ' · snapped to roads' : ''
                  }`}
            </AppText>
          </>
        )}

        {shownError ? (
          <AppText color="red" size={11} style={styles.error}>
            {shownError}
          </AppText>
        ) : null}

        {/* Everything below is the editor: naming, snapping, saving. While
            recording it stays out of the way. */}
        {recording ? null : (
          <>
        <View style={styles.profileRow}>
          <Segmented
            onChange={(value) => {
              const next = PROFILE_ORDER.find((key) => PROFILE_LABELS[key] === value);
              if (next) {
                setProfile(next);
                setSnapped(null);
                setSnapInfo(null);
              }
            }}
            options={PROFILE_ORDER.map((key) => PROFILE_LABELS[key])}
            style={styles.segmented}
            value={PROFILE_LABELS[profile]}
          />
          <SecondaryButton
            label={snapping ? 'Snapping…' : snapped ? 'Re-snap' : 'Snap to roads'}
            onPress={() => void snap()}
            small
            style={styles.snapButton}
          />
        </View>

        {snapInfo ? (
          <View style={styles.summaryRow}>
            <Icon color={Palette.green} name="check" size={15} />
            <AppText color="green" size={11} weight="semibold">
              {formatDistance(snapInfo.distanceMetres)} · {formatDuration(snapInfo.durationSeconds)}{' '}
              on {PROFILE_LABELS[profile].toLowerCase()}
            </AppText>
          </View>
        ) : null}

        <View style={styles.nameField}>
          <TextField
            onChangeText={setName}
            placeholder={combiMode ? 'Name this recording' : 'Name this path'}
            value={name}
          />
        </View>

        {mode === 'record' ? (
          <>
            <Tap
              accessibilityLabel="Save as a combi route"
              onPress={() => setCombiMode((current) => !current)}
              style={styles.combiToggle}>
              <View style={[styles.checkbox, combiMode && styles.checkboxOn]}>
                {combiMode ? <Icon color={Palette.surface} name="check" size={12} /> : null}
              </View>
              <View style={styles.combiToggleCopy}>
                <AppText size={12} weight="bold">
                  Save as a combi route
                </AppText>
                <AppText color="muted" size={10} style={styles.combiToggleHint}>
                  The named stops become boarding points other people can search, and the track
                  becomes the road the combi follows.
                </AppText>
              </View>
            </Tap>

            {combiMode ? (
              <>
                <View style={styles.nameField}>
                  <TextField
                    onChangeText={setCombiName}
                    placeholder="Combi name, e.g. Block 8 Route 4"
                    value={combiName}
                  />
                </View>
                <View style={styles.nameField}>
                  <TextField
                    onChangeText={setCombiRank}
                    placeholder="Rank it leaves from, e.g. Station"
                    value={combiRank}
                  />
                </View>
                <AppText color="muted" size={10} style={styles.combiHint}>
                  Tap a stop above to enter the fare from the previous stop (P9, then P4, and so on).
                </AppText>
              </>
            ) : null}
          </>
        ) : null}

        <PrimaryButton
          label={saving ? 'Saving…' : 'Save path'}
          onPress={() => void save()}
          style={styles.save}
        />
          </>
        )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  actions: { position: 'absolute', right: 15, gap: 10 },
  action: {},
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  modeHeading: { marginTop: 14 },
  hint: { marginTop: 3 },
  sheetContent: { paddingBottom: 2 },
  recordingStrip: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Palette.blue },
  recordingText: { flex: 1 },
  recordingActions: { marginTop: 10, flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  addStopButton: { flex: 1.7 },
  stopRecording: { flex: 1 },
  statsRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordActions: { marginTop: 12, flexDirection: 'row', gap: 10 },
  recordButton: { flex: 1.1 },
  stopButton: { flex: 1 },
  notice: { marginTop: 9, lineHeight: 15 },
  stopCard: {
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.md,
    gap: 10,
    backgroundColor: '#F3FAF5',
  },
  stopCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stopCardTitle: { flex: 1 },
  stopNameField: {
    height: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoPreview: { position: 'relative' },
  photoThumb: { width: 46, height: 46, borderRadius: Radius.sm, backgroundColor: Palette.soft },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.red,
  },
  photoHint: { lineHeight: 14 },
  stopList: {
    marginTop: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.sm,
    gap: 7,
    backgroundColor: '#FAFCF9',
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stopRowName: { flex: 1 },
  stopRowThumb: { width: 22, height: 22, borderRadius: 6, backgroundColor: Palette.soft },
  profileRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  segmented: { flex: 1 },
  snapButton: { minWidth: 118 },
  summaryRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameField: {
    marginTop: 10,
    height: 45,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    justifyContent: 'center',
  },
  combiToggle: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FAFCF9',
  },
  combiToggleCopy: { flex: 1, gap: 2 },
  combiToggleHint: { lineHeight: 13 },
  combiHint: { marginTop: 8, lineHeight: 14 },
  checkbox: {
    width: 19,
    height: 19,
    marginTop: 1,
    borderWidth: 1,
    borderColor: '#C3CEC6',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  checkboxOn: { borderColor: Palette.green, backgroundColor: Palette.green },
  fareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fareLabel: { flex: 1 },
  fareField: {
    width: 96,
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Palette.surface,
  },
  error: { marginTop: 8 },
  save: { marginTop: 14 },
});
