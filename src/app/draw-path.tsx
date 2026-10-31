import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker, MapRoute } from '@/components/myroute/map-types';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  IconBadge,
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
import { addPath, labelledEndpoints, loadPaths, snapVertices, type PathWaypoint, type SavedPath } from '@/lib/paths';
import { submitPath } from '@/lib/api';
import { distanceMetres, formatDistance } from '@/lib/geo';
import { useDeviceLocation } from '@/lib/location';
import { usePathRecorder } from '@/lib/recording';
import { formatDuration, type TravelProfile } from '@/lib/routing';
import {
  DUPLICATE_STOP_M,
  SNAP_SIMPLIFY_M,
  STOP_GOOD_ACCURACY_M,
  simplifyTrack,
  trackDistanceMetres,
  trackWithStops,
  type FixSample,
} from '@/lib/track';

/**
 * Record a path, in stages.
 *
 * The old screen put every configuration option — travel mode, snapping, the
 * name, combi settings and Save — on the same sheet as the record button. This
 * version shows one job at a time:
 *
 *   1. idle      — map plus Record/Draw, Start recording, Mark a stop
 *   2. travel    — "How are you travelling?" sheet, before GPS starts
 *   3. recording — live map, timer, distance, Finish and Mark a stop
 *   4. finished  — the completed route with Save path
 *   5. save      — name, snap and combi configuration
 *
 * The recorder, GPS watch, distance/duration maths and stop capture are the
 * existing implementations; this is a restructuring of the screen around them.
 */

type Stage = 'idle' | 'travel' | 'recording' | 'finished';
type CaptureMode = 'record' | 'draw';

const RECORD: CaptureMode = 'record';
const DRAW: CaptureMode = 'draw';

type TravelMode = 'car' | 'bike' | 'walk' | 'combi';

type TravelOption = {
  key: TravelMode;
  label: string;
  icon: IconName;
  /** The routing profile the recorded line is snapped with. */
  profile: TravelProfile;
};

const TRAVEL_OPTIONS: TravelOption[] = [
  { key: 'car', label: 'Car', icon: 'car', profile: 'car' },
  { key: 'bike', label: 'Bike', icon: 'bike', profile: 'bike' },
  { key: 'walk', label: 'Walk', icon: 'walk', profile: 'foot' },
  { key: 'combi', label: 'Combi', icon: 'minibus', profile: 'car' },
];

const MAX_NAME_LENGTH = 50;

function travelOption(mode: TravelMode | null): TravelOption | null {
  return TRAVEL_OPTIONS.find((option) => option.key === mode) ?? null;
}

/** HH:MM:SS for the recording timer. */
function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
}

function accuracyLabel(accuracy: number | null): string {
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

/**
 * The stops a combi route is saved with. Start and End are filled in by
 * `labelledEndpoints` at save time, so this only has to describe a capture.
 */
/** A row with a label, supporting text and a green switch. */
function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Tap
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.toggleRow, disabled && styles.disabled]}>
      <View style={styles.toggleCopy}>
        <AppText size={12} weight="bold">
          {label}
        </AppText>
        {description ? (
          <AppText color="muted" size={10} style={styles.toggleHint}>
            {description}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
      </View>
    </Tap>
  );
}

/** A conventional dropdown: one field, and a vertical list when it opens. */
function TravelDropdown({
  value,
  onChange,
}: {
  value: TravelMode | null;
  onChange: (next: TravelMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = travelOption(value);

  return (
    <View>
      <Tap
        accessibilityLabel="Select travel mode"
        onPress={() => setOpen((current) => !current)}
        style={[styles.dropdown, open && styles.dropdownOpen]}>
        <Icon
          color={selected ? Palette.green : Palette.muted}
          name={selected?.icon ?? 'compass'}
          size={20}
        />
        <AppText
          color={selected ? 'ink' : 'muted'}
          size={13}
          style={styles.dropdownLabel}
          weight={selected ? 'semibold' : 'regular'}>
          {selected?.label ?? 'Select travel mode'}
        </AppText>
        <Icon color={Palette.muted} name={open ? 'arrow' : 'chevron'} size={16} />
      </Tap>

      {open ? (
        <View style={styles.dropdownList}>
          {TRAVEL_OPTIONS.map((option) => {
            const active = option.key === value;
            return (
              <Tap
                accessibilityLabel={option.label}
                key={option.key}
                onPress={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                style={[styles.dropdownItem, active && styles.dropdownItemActive]}>
                <Icon
                  color={active ? Palette.green : Palette.ink}
                  name={option.icon}
                  size={19}
                />
                <AppText
                  color={active ? 'green' : 'ink'}
                  size={13}
                  style={styles.dropdownLabel}
                  weight={active ? 'bold' : 'regular'}>
                  {option.label}
                </AppText>
                {active ? <Icon color={Palette.green} name="check" size={16} /> : null}
              </Tap>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function RecordPathScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { id: editingId } = useLocalSearchParams<{ id?: string }>();

  const [stage, setStage] = useState<Stage>('idle');
  const [mode, setMode] = useState<CaptureMode>(RECORD);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [travelMode, setTravelMode] = useState<TravelMode | null>(null);
  const [stops, setStops] = useState<PathWaypoint[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [stopNotice, setStopNotice] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(
    null,
  );
  const [justAdded, setJustAdded] = useState<PathWaypoint | null>(null);
  const [viewStops, setViewStops] = useState(false);

  const [sliderOpen, setSliderOpen] = useState<'travel' | 'settings' | 'save' | null>(null);
  const [travelDraft, setTravelDraft] = useState<TravelMode | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [combiEnabled, setCombiEnabled] = useState(false);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<SavedPath | null>(null);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [finishedDistance, setFinishedDistance] = useState(0);
  const [finishedDuration, setFinishedDuration] = useState(0);
  const [snappedRoute, setSnappedRoute] = useState<{
    coordinates: [number, number][];
    distanceMetres: number;
    durationSeconds: number;
  } | null>(null);

  const [zoomInKey, setZoomInKey] = useState(0);
  const [zoomOutKey, setZoomOutKey] = useState(0);
  const [recenterKey, setRecenterKey] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(280);
  const [error, setError] = useState<string | null>(null);

  const recorder = usePathRecorder();
  const { recording, points, distanceMetres: recordedMetres } = recorder;

  // The map's own fix. While recording the recorder has a high-accuracy watch
  // of its own, so this one is paused rather than run alongside it.
  const {
    coords,
    start: startLocation,
    stop: stopLocation,
    enable: enableLocation,
    error: locationError,
  } = useDeviceLocation({ auto: false });

  useEffect(() => {
    if (recording) {
      stopLocation();
      return;
    }
    void startLocation();
  }, [recording, startLocation, stopLocation]);

  // Load a saved path when opened from Saved so it can be edited and re-saved.
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
      setName(existing.name);
      setStops(existing.waypoints ?? []);
      setSnappedRoute(
        existing.snapped
          ? {
              coordinates: existing.coordinates,
              distanceMetres: existing.distanceMetres,
              durationSeconds: existing.durationSeconds,
            }
          : null,
      );
      setFinishedDistance(existing.distanceMetres);
      setFinishedDuration(existing.durationSeconds);
      if (existing.source === 'recorded') {
        recorder.loadVertices(existing.vertices, {
          startedAt: existing.createdAt,
          durationSeconds: existing.durationSeconds,
        });
        setMode(RECORD);
        setStage('finished');
      } else {
        setDrawVertices(existing.vertices);
        setMode(DRAW);
        setStage('idle');
      }
      const option =
        existing.profile === 'car' ? 'car' : existing.profile === 'bike' ? 'bike' : 'walk';
      setTravelMode(existing.kind === 'combi' ? 'combi' : option);
      setCombiEnabled(existing.kind === 'combi');
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the id and the stable loader: re-running on every recorded point
    // would reload the path mid-recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, recorder.loadVertices]);

  // Live timer. The recorder derives duration from the fixes it has, which can
  // stand still between readings; this ticks every second so the screen shows
  // the journey's real elapsed time.
  useEffect(() => {
    if (stage !== 'recording' || startedAt == null) {
      return;
    }
    const tick = () => setClock(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [stage, startedAt]);

  // The stop confirmation is a moment, not a mode: clear it on its own so the
  // recording screen returns to the journey without the contributor tapping.
  useEffect(() => {
    if (!justAdded) {
      return;
    }
    const timer = setTimeout(() => setJustAdded(null), 6000);
    return () => clearTimeout(timer);
  }, [justAdded]);

  useFocusEffect(
    useCallback(() => {
      setError(null);
    }, []),
  );

  const geometry = useMemo<[number, number][]>(() => {
    if (mode === DRAW && stage === 'idle') {
      return drawVertices;
    }
    return trackWithStops(recorder.points, stops).map(
      (point) => [point.longitude, point.latitude] as [number, number],
    );
  }, [drawVertices, mode, recorder.points, stage, stops]);

  const drawnMetres = useMemo(
    () =>
      trackDistanceMetres(
        drawVertices.map(([longitude, latitude]) => ({ latitude, longitude })),
      ),
    [drawVertices],
  );

  const liveMetres = mode === DRAW ? drawnMetres : recordedMetres;
  const elapsed = Math.max(clock, Math.round(recorder.durationSeconds));

  const lastPoint = points[points.length - 1];
  const liveLocation = recording && lastPoint ? lastPoint : coords;

  const preview = useMemo<MapRoute | undefined>(() => {
    if (stage === 'finished' && snappedRoute) {
      return { coordinates: snappedRoute.coordinates, color: Palette.green };
    }
    if (geometry.length < 2) {
      return undefined;
    }
    return { coordinates: geometry, color: Palette.green };
  }, [geometry, snappedRoute, stage]);

  /**
   * The points this route is labelled with: Start, End, and every stop between
   * them. Shown as pins on the map and listed in the save panel, so a path with
   * no marked stops still shows where it begins and where it ends.
   */
  const labelled = useMemo(
    () => labelledEndpoints(snappedRoute?.coordinates ?? geometry, stops),
    [geometry, snappedRoute, stops],
  );

  const markers = useMemo<MapMarker[]>(() => {
    const pins: MapMarker[] = [];
    if (mode === DRAW && stage === 'idle') {
      drawVertices.forEach((coordinate, index) => {
        pins.push({
          id: `vertex-${index}`,
          latitude: coordinate[1],
          longitude: coordinate[0],
          label: `${index + 1}`,
          tone: index === 0 ? 'green' : 'blue',
          kind: 'destination',
        });
      });
      return pins;
    }

    return labelled.map((point) => ({
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
      label: point.label,
      tone:
        point.accuracy != null && point.accuracy > STOP_GOOD_ACCURACY_M
          ? 'amber'
          : point.label === 'Start'
            ? 'blue'
            : 'green',
      kind: 'destination',
    }));
  }, [drawVertices, labelled, mode, stage]);

  const measureSheet = (event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height);
  };

  const chooseTravel = useCallback((next: TravelMode) => {
    setTravelMode(next);
    setTravelDraft(next);
    if (next === 'combi') {
      setCombiEnabled(true);
    }
  }, []);

  const startRecording = useCallback(
    async (chosen?: TravelMode) => {
      const chosenMode = chosen ?? travelMode;
      if (!chosenMode) {
        return;
      }
      setTravelMode(chosenMode);
      if (chosenMode === 'combi') {
        setCombiEnabled(true);
      }
      setSliderOpen(null);
      setStage('recording');
      setStartedAt(Date.now());
      setClock(0);
      setJustAdded(null);
      setSnappedRoute(null);
      setFinishedDistance(0);
      setFinishedDuration(0);
      setError(null);
      // The dot on the map is where the contributor is standing, which is where
      // the trip starts — not wherever the first GPS reading lands.
      const started = await recorder.start(coords);
      if (!started) {
        // No permission or no location service: stay on the first screen, where
        // the recorder's explanation is visible, instead of pretending to record.
        setStage('idle');
        setStartedAt(null);
      }
    },
    [coords, recorder, travelMode],
  );

  const finishRecording = useCallback(() => {
    const seconds = startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : 0;
    setFinishedDistance(recorder.distanceMetres);
    setFinishedDuration(Math.max(seconds, Math.round(recorder.durationSeconds)));
    recorder.stop();
    setJustAdded(null);
    setStage('finished');
  }, [recorder, startedAt]);

  const addVertex = useCallback((point: { latitude: number; longitude: number }) => {
    setError(null);
    setSnappedRoute(null);
    setDrawVertices((current) => [...current, [point.longitude, point.latitude]]);
  }, []);

  const clearDraw = useCallback(() => {
    setDrawVertices([]);
    setSnappedRoute(null);
    setError(null);
  }, []);

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
      // The line changed, so any previous road match no longer describes it.
      setSnappedRoute(null);
      setJustAdded(waypoint);
      setViewStops(false);
      setStopNotice(null);
    } finally {
      setCapturing(false);
    }
  }, [recorder, stops]);

  const switchMode = useCallback(
    (next: CaptureMode) => {
      if (next === mode || stage !== 'idle') {
        return;
      }
      setMode(next);
      setSnappedRoute(null);
      setStopNotice(null);
      setError(null);
    },
    [mode, stage],
  );

  /** Snap the current line to roads for the save configuration. */
  const snapLine = useCallback(async () => {
    const profile = travelOption(travelMode)?.profile ?? 'foot';
    const source =
      mode === RECORD && points.length > 2
        ? simplifyTrack(points, SNAP_SIMPLIFY_M).map(
            (point) => [point.longitude, point.latitude] as [number, number],
          )
        : geometry;
    return snapVertices(source, profile);
  }, [geometry, mode, points, travelMode]);

  const savePath = useCallback(async () => {
    setSaveError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setSaveError('Give this path a name.');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setSaveError(`The name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (geometry.length < 2) {
      setSaveError(
        mode === RECORD
          ? 'Record a little further, or mark a stop, before saving.'
          : 'Tap the map at least twice to draw a path.',
      );
      return;
    }

    const isCombi = combiEnabled && travelMode === 'combi';

    setSaving(true);
    try {
      // Snap only when asked, and treat a routing failure as a reason to keep
      // the recorded line — not as a reason to lose the path.
      let snapped = snappedRoute;
      if (snapEnabled && snapped == null) {
        try {
          snapped = await snapLine();
        } catch {
          snapped = null;
        }
      }

      const coordinates = snapped?.coordinates ?? geometry;
      // Every path keeps a Start and an End — and every stop in between — even
      // when nobody marked anything: A and B are the route, the stops are the
      // detail on top of it. A blanked name is dropped so the endpoint can be
      // regenerated rather than uploaded empty.
      const waypoints = labelledEndpoints(
        coordinates,
        stops.filter((stop) => stop.label.trim().length > 0),
      );
      const measured =
        mode === RECORD
          ? { distanceMetres: finishedDistance || liveMetres, durationSeconds: finishedDuration }
          : {
              distanceMetres: snapped?.distanceMetres ?? drawnMetres,
              durationSeconds: snapped?.durationSeconds ?? 0,
            };

      const path = await addPath({
        ...(editing ? { id: editing.id, createdAt: editing.createdAt, status: editing.status } : {}),
        name: trimmed,
        profile: travelOption(travelMode)?.profile ?? 'foot',
        vertices: geometry,
        waypoints,
        source: mode === RECORD ? 'recorded' : 'drawn',
        kind: isCombi ? 'combi' : 'path',
        ...(isCombi ? { combiName: trimmed, rank: waypoints[0]?.label ?? '' } : {}),
        coordinates,
        snapped: snapped != null,
        distanceMetres: measured.distanceMetres,
        durationSeconds: measured.durationSeconds,
      });

      const created = path[0];
      if (created) {
        try {
          const synced = await submitPath(created);
          await addPath(synced);
        } catch (err) {
          // The path is safe on the device and will be retried on next launch;
          // say so rather than claiming it reached the database.
          setSaveError(
            `Saved on this device, but the database did not receive it yet: ${
              err instanceof Error ? err.message : 'unknown error'
            }. It will be retried automatically.`,
          );
        }
      }
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the path.');
    } finally {
      setSaving(false);
    }
  }, [
    combiEnabled,
    drawnMetres,
    editing,
    finishedDistance,
    finishedDuration,
    geometry,
    liveMetres,
    mode,
    name,
    snapEnabled,
    snapLine,
    snappedRoute,
    stops,
    travelMode,
  ]);

  const title =
    stage === 'recording'
      ? 'Recording...'
      : sliderOpen === 'save' || saved
        ? 'Save path'
        : 'Record a path';

  const back = useCallback(() => {
    if (sliderOpen != null) {
      setSliderOpen(null);
      return;
    }
    if (stage === 'recording') {
      finishRecording();
      return;
    }
    if (stage === 'finished') {
      setStage('idle');
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/');
    }
  }, [finishRecording, router, sliderOpen, stage]);

  const openSave = useCallback(() => {
    setSaved(false);
    setSaveError(null);
    if (travelMode == null) {
      setTravelMode('walk');
    }
    setSliderOpen('save');
  }, [travelMode]);

  const recentre = useCallback(() => {
    setRecenterKey((value) => value + 1);
    if (!liveLocation) {
      void enableLocation();
    }
  }, [enableLocation, liveLocation]);

  const selectedTravel = travelOption(travelMode);

  return (
    <View style={styles.screen}>
      <InteractiveMap
        bottomInset={sheetHeight}
        fitRoute={stage === 'finished'}
        focus="me"
        followUser={stage === 'recording'}
        markers={markers}
        onMapPress={mode === DRAW && stage === 'idle' ? addVertex : undefined}
        recenterKey={recenterKey}
        route={preview}
        styleId={DEFAULT_MAP_STYLE}
        userLocation={liveLocation}
        zoomInKey={zoomInKey}
        zoomOutKey={zoomOutKey}
      />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TopBar
          action={
            <BareIconButton
              accessibilityLabel="Route settings"
              icon="settings"
              onPress={() => {
                setHelpOpen(false);
                setTravelDraft(travelMode);
                setSliderOpen('settings');
              }}
            />
          }
          onBack={back}
          title={title}
        />
      </View>

      <View style={[styles.mapActions, { top: insets.top + 82 }]}>
        <RoundButton
          accessibilityLabel="Recentre on my location"
          icon="locate"
          iconColor={Palette.blue}
          onPress={recentre}
        />
        <RoundButton
          accessibilityLabel="Zoom in"
          icon="plus"
          onPress={() => setZoomInKey((value) => value + 1)}
        />
        <RoundButton
          accessibilityLabel="Zoom out"
          icon="minus"
          onPress={() => setZoomOutKey((value) => value + 1)}
        />
      </View>

      <View
        onLayout={measureSheet}
        style={[
          styles.sheet,
          {
            maxHeight: Math.round(windowHeight * 0.78),
            paddingBottom: insets.bottom + 16,
          },
        ]}>
        <SheetHandle />

        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

        {/* ── Screen 1 / draw mode ─────────────────────────────────────────── */}
        {stage === 'idle' ? (
          <>
            <Segmented
              onChange={(value) =>
                switchMode(value === 'Draw' ? DRAW : RECORD)
              }
              options={['Record', 'Draw']}
              value={mode === DRAW ? 'Draw' : 'Record'}
            />

            {mode === RECORD ? (
              <>
                <AppText size={17} weight="bold" style={styles.heading}>
                  Ready to record?
                </AppText>
                <AppText color="muted" size={11} style={styles.description}>
                  Follow your route and MyRoute will trace your journey.
                </AppText>
              </>
            ) : (
              <>
                <AppText size={17} weight="bold" style={styles.heading}>
                  Tap the map to add points
                </AppText>
                <AppText color="muted" size={11} style={styles.description}>
                  {drawVertices.length === 0
                    ? 'Start where the path begins, then tap each turn.'
                    : `${drawVertices.length} point${drawVertices.length === 1 ? '' : 's'} · ${formatDistance(drawnMetres)}`}
                </AppText>
              </>
            )}

            <PrimaryButton
              icon={mode === RECORD ? 'locate' : 'edit'}
              label={mode === RECORD ? 'Start recording' : 'Save drawn path'}
              onPress={() => {
                if (mode === RECORD) {
                  // A fresh choice every time: Continue stays disabled until the
                  // contributor says how this trip is being made.
                  setTravelDraft(null);
                  setSliderOpen('travel');
                } else {
                  openSave();
                }
              }}
              style={styles.primaryAction}
            />

            {mode === RECORD ? (
              <SecondaryButton
                icon="pin"
                label={capturing ? 'Measuring…' : 'Mark a stop'}
                onPress={() => void captureStop()}
                style={styles.secondaryAction}
              />
            ) : (
              <SecondaryButton
                icon="close"
                label="Clear points"
                onPress={clearDraw}
                style={styles.secondaryAction}
              />
            )}

            {stopNotice ? (
              <AppText color={stopNotice.tone} size={11} style={styles.notice}>
                {stopNotice.text}
              </AppText>
            ) : null}
            {error ?? recorder.error ?? locationError ? (
              <AppText color="muted" size={10} style={styles.notice}>
                {error ?? recorder.error ?? locationError}
              </AppText>
            ) : null}
            {mode === RECORD && stops.length > 0 ? (
              <AppText color="green" size={10} style={styles.notice} weight="semibold">
                {stops.length} stop{stops.length === 1 ? '' : 's'} marked
              </AppText>
            ) : null}
          </>
        ) : null}

        {/* ── Screen 3: recording in progress ──────────────────────────────── */}
        {stage === 'recording' ? (
          <>
            {showStats ? (
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <AppText color="muted" size={10}>
                    Time
                  </AppText>
                  <AppText size={22} weight="bold">
                    {formatClock(elapsed)}
                  </AppText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <AppText color="muted" size={10}>
                    Distance
                  </AppText>
                  <AppText size={22} weight="bold">
                    {formatDistance(liveMetres)}
                  </AppText>
                </View>
              </View>
            ) : null}

            {selectedTravel ? (
              <View style={styles.travelChip}>
                <Icon color={Palette.green} name={selectedTravel.icon} size={15} />
                <AppText color="green" size={11} weight="semibold">
                  {selectedTravel.label}
                </AppText>
              </View>
            ) : null}

            {justAdded ? (
              <View style={styles.stopCard}>
                <View style={styles.stopCardTop}>
                  <View style={styles.successDot}>
                    <Icon color={Palette.surface} name="check" size={14} />
                  </View>
                  <View style={styles.stopCardCopy}>
                    <AppText size={12} weight="bold">
                      Stop added!
                    </AppText>
                    <AppText color="muted" size={10}>
                      {justAdded.label} · this stop will be included in your route.
                    </AppText>
                  </View>
                  <BareIconButton
                    accessibilityLabel="Dismiss stop confirmation"
                    color={Palette.muted}
                    icon="close"
                    onPress={() => setJustAdded(null)}
                    size={16}
                  />
                </View>
                <SecondaryButton
                  label={viewStops ? 'Hide stops' : 'View stops'}
                  onPress={() => setViewStops((current) => !current)}
                  small
                />
                {viewStops ? (
                  <View style={styles.stopList}>
                    {stops.map((stop) => (
                      <View key={stop.id} style={styles.stopRow}>
                        <Icon color={Palette.green} name="pin" size={12} />
                        <AppText size={10} style={styles.stopRowName}>
                          {stop.label}
                        </AppText>
                        <AppText color="muted" size={9}>
                          {accuracyLabel(stop.accuracy)}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.controls}>
              <View style={styles.control}>
                <Tap accessibilityLabel="Finish recording" onPress={finishRecording}>
                  <View style={styles.finishButton}>
                    <View style={styles.finishSquare} />
                  </View>
                </Tap>
                <AppText size={11} weight="semibold">
                  Finish
                </AppText>
              </View>

              <View style={styles.control}>
                <Tap
                  accessibilityLabel="Mark a stop"
                  onPress={() => void captureStop()}>
                  <View style={styles.stopCircle}>
                    <Icon color={Palette.ink} name="pin" size={22} />
                  </View>
                </Tap>
                <AppText size={11} weight="semibold">
                  Mark a stop
                </AppText>
              </View>
            </View>

            {stopNotice ? (
              <AppText color={stopNotice.tone} size={10} style={styles.notice}>
                {stopNotice.text}
              </AppText>
            ) : null}
            {recorder.error ? (
              <AppText color="red" size={10} style={styles.notice}>
                {recorder.error}
              </AppText>
            ) : null}
          </>
        ) : null}

        {/* ── Screen 5A: route recorded ────────────────────────────────────── */}
        {stage === 'finished' ? (
          <>
            <View style={styles.finishedHeader}>
              <IconBadge icon="check" size={44} />
              <View style={styles.finishedCopy}>
                <AppText size={18} weight="bold">
                  Path recorded!
                </AppText>
                <AppText color="muted" size={11}>
                  {formatDistance(finishedDistance || liveMetres)} ·{' '}
                  {formatDuration(finishedDuration)}
                  {selectedTravel ? ` · ${selectedTravel.label}` : ''}
                </AppText>
              </View>
            </View>

            {justAdded ? (
              <View style={styles.stopCard}>
                <View style={styles.stopCardTop}>
                  <View style={styles.successDot}>
                    <Icon color={Palette.surface} name="check" size={14} />
                  </View>
                  <View style={styles.stopCardCopy}>
                    <AppText size={12} weight="bold">
                      Stop added!
                    </AppText>
                    <AppText color="muted" size={10}>
                      This stop will be included in your route.
                    </AppText>
                  </View>
                  <BareIconButton
                    accessibilityLabel="Dismiss stop confirmation"
                    color={Palette.muted}
                    icon="close"
                    onPress={() => setJustAdded(null)}
                    size={16}
                  />
                </View>
                <SecondaryButton
                  label={viewStops ? 'Hide stops' : 'View stops'}
                  onPress={() => setViewStops((current) => !current)}
                  small
                />
                {viewStops ? (
                  <View style={styles.stopList}>
                    {stops.map((stop) => (
                      <View key={stop.id} style={styles.stopRow}>
                        <Icon color={Palette.green} name="pin" size={12} />
                        <AppText size={10} style={styles.stopRowName}>
                          {stop.label}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <PrimaryButton
              icon="edit"
              label="Save path"
              onPress={openSave}
              style={styles.primaryAction}
            />
            <SecondaryButton
              icon="pin"
              label={capturing ? 'Measuring…' : 'Mark a stop'}
              onPress={() => void captureStop()}
              style={styles.secondaryAction}
            />

            {stopNotice ? (
              <AppText color={stopNotice.tone} size={10} style={styles.notice}>
                {stopNotice.text}
              </AppText>
            ) : null}
            {error ? (
              <AppText color="red" size={10} style={styles.notice}>
                {error}
              </AppText>
            ) : null}
          </>
        ) : null}
        </ScrollView>
      </View>

      {/* ── Screen 2: how are you travelling? ─────────────────────────────── */}
      <Modal
        animationType="fade"
        onRequestClose={() => setSliderOpen(null)}
        transparent
        visible={sliderOpen === 'travel'}>
        <View style={styles.overlay}>
          <Tap
            accessibilityLabel="Close travel mode sheet"
            onPress={() => setSliderOpen(null)}
            style={styles.overlayFill}>
            <View />
          </Tap>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 18 }]}>
            <SheetHandle />
            <AppText size={19} weight="bold">
              How are you travelling?
            </AppText>
            <AppText color="muted" size={11} style={styles.modalDescription}>
              Choose your travel mode to start recording your route.
            </AppText>

            <TravelDropdown onChange={chooseTravel} value={travelDraft} />

            <PrimaryButton
              label="Continue"
              onPress={() => {
                if (travelDraft == null) {
                  return;
                }
                void startRecording(travelDraft);
              }}
              style={[styles.modalPrimary, travelDraft == null && styles.disabled]}
            />
            {travelDraft == null ? (
              <AppText color="muted" size={10} style={styles.centerHint}>
                Select a travel mode to continue.
              </AppText>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Settings panel ────────────────────────────────────────────────── */}
      <Modal
        animationType="fade"
        onRequestClose={() => setSliderOpen(null)}
        transparent
        visible={sliderOpen === 'settings'}>
        <View style={styles.overlay}>
          <Tap
            accessibilityLabel="Close settings"
            onPress={() => setSliderOpen(null)}
            style={styles.overlayFill}>
            <View />
          </Tap>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 18 }]}>
            <SheetHandle />
            <AppText size={18} weight="bold" style={styles.settingsTitle}>
              Route settings
            </AppText>

            <View style={styles.settingsRow}>
              <AppText size={12} weight="bold">
                Travel mode
              </AppText>
              <View style={styles.settingsValue}>
                <AppText color="muted" size={11}>
                  {selectedTravel?.label ?? 'Not set'}
                </AppText>
              </View>
            </View>
            {stage !== 'recording' ? (
              <View style={styles.settingsDropdown}>
                <TravelDropdown onChange={chooseTravel} value={travelMode} />
              </View>
            ) : null}

            <View style={styles.settingsDivider} />
            <ToggleRow
              description="Align the recorded line with nearby roads when saving."
              label="Snap to roads"
              onChange={setSnapEnabled}
              value={snapEnabled}
            />
            <View style={styles.settingsDivider} />
            <ToggleRow
              description="Show the timer and distance while recording."
              label="Show distance and time"
              onChange={setShowStats}
              value={showStats}
            />
            {travelMode === 'combi' ? (
              <>
                <View style={styles.settingsDivider} />
                <ToggleRow
                  description="Stops become boarding points other people can search."
                  label="Combi route"
                  onChange={setCombiEnabled}
                  value={combiEnabled}
                />
              </>
            ) : null}

            <View style={styles.settingsDivider} />
            <Tap
              accessibilityLabel="Help"
              onPress={() => setHelpOpen((current) => !current)}
              style={styles.settingsRow}>
              <AppText size={12} weight="bold">
                Help
              </AppText>
              <Icon color={Palette.muted} name={helpOpen ? 'arrow' : 'chevron'} size={16} />
            </Tap>
            {helpOpen ? (
              <AppText color="muted" size={10} style={styles.helpText}>
                Record traces where you travel using GPS. Draw lets you add points by tapping the
                map. Mark a stop at each place riders can board or get off, name the path, and save
                it to the community database so other people can find it.
              </AppText>
            ) : null}

            <PrimaryButton
              label="Done"
              onPress={() => setSliderOpen(null)}
              style={styles.modalPrimary}
            />
          </View>
        </View>
      </Modal>

      {/* ── Screen 5B: save path configuration ───────────────────────────── */}
      <Modal
        animationType="slide"
        onRequestClose={() => setSliderOpen(null)}
        transparent
        visible={sliderOpen === 'save'}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}>
          <View style={[styles.saveSheet, { maxHeight: Math.round(windowHeight * 0.9) }]}>
            <View style={styles.saveHandle}>
              <SheetHandle />
            </View>
            <View style={styles.saveHeader}>
              <BareIconButton
                accessibilityLabel="Close save panel"
                color={Palette.ink}
                icon="close"
                onPress={() => setSliderOpen(null)}
              />
              <AppText size={16} weight="bold" style={styles.saveTitle}>
                Save path
              </AppText>
              <View style={styles.saveHeaderSide} />
            </View>

            <ScrollView
              contentContainerStyle={[styles.saveContent, { paddingBottom: insets.bottom + 18 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {saved ? (
                <View style={styles.savedState}>
                  <IconBadge icon="check" size={52} />
                  <AppText size={17} weight="bold" style={styles.savedTitle}>
                    Path saved
                  </AppText>
                  <AppText color="muted" size={11} style={styles.savedText}>
                    {saveError
                      ? saveError
                      : `${name.trim()} is on the device and has been sent to the community database.`}
                  </AppText>
                  <PrimaryButton
                    label="Done"
                    onPress={() => {
                      setSliderOpen(null);
                      router.navigate('/saved');
                    }}
                    style={styles.saveButton}
                  />
                </View>
              ) : (
                <>
                  <AppText size={12} weight="bold">
                    Name this path
                  </AppText>
                  <View style={styles.nameField}>
                    <TextField
                      maxLength={MAX_NAME_LENGTH}
                      onChangeText={setName}
                      placeholder="Gaborone Mall to Block 8"
                      value={name}
                    />
                  </View>
                  <AppText color="muted" size={9} style={styles.counter}>
                    {name.length}/{MAX_NAME_LENGTH}
                  </AppText>

                  <View style={styles.divider} />
                  <ToggleRow
                    description="Align GPS points to nearby roads where a road is available."
                    label="Snap to roads"
                    onChange={setSnapEnabled}
                    value={snapEnabled}
                  />

                  {travelMode === 'combi' ? (
                    <View style={styles.combiCard}>
                      <View style={styles.combiHeader}>
                        <IconBadge icon="minibus" size={34} />
                        <View style={styles.combiCopy}>
                          <AppText size={12} weight="bold">
                            Mark as combi route
                          </AppText>
                          <AppText color="muted" size={10} style={styles.combiHint}>
                            The named stops become boarding points other people can search, and
                            the track becomes the road the combi follows.
                          </AppText>
                        </View>
                        <Tap
                          accessibilityLabel="Mark as combi route"
                          onPress={() => setCombiEnabled((current) => !current)}>
                          <View style={[styles.switch, combiEnabled && styles.switchOn]}>
                            <View style={[styles.switchKnob, combiEnabled && styles.switchKnobOn]} />
                          </View>
                        </Tap>
                      </View>

                      {combiEnabled ? (
                        <View style={styles.stopNames}>
                          <AppText color="muted" size={10} weight="semibold">
                            Boarding points
                          </AppText>
                          {labelled.length > 0 ? (
                            labelled.map((stop, index) => (
                              <View key={stop.id} style={styles.stopNameRow}>
                                <AppText color="muted" size={10} style={styles.stopIndex}>
                                  {index + 1}
                                </AppText>
                                <View style={styles.stopNameField}>
                                  <TextField
                                    maxLength={60}
                                    onChangeText={(value) =>
                                      setStops((current) => {
                                        const found = current.some((item) => item.id === stop.id);
                                        // Editing a generated Start/End promotes it to a
                                        // named stop, so the name survives the save.
                                        return found
                                          ? current.map((item) =>
                                              item.id === stop.id ? { ...item, label: value } : item,
                                            )
                                          : [...current, { ...stop, label: value }];
                                      })
                                    }
                                    placeholder={`Stop ${index + 1}`}
                                    value={stop.label}
                                  />
                                </View>
                              </View>
                            ))
                          ) : (
                            <AppText color="amber" size={10}>
                              Draw at least two points so the route has a start and an end.
                            </AppText>
                          )}
                          {stops.length === 0 && labelled.length >= 2 ? (
                            <AppText color="muted" size={10}>
                              No stops in the middle yet — the start and end are already marked.
                              Add stops along the way for extra boarding points.
                            </AppText>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {saveError ? (
                    <AppText color="red" size={10} style={styles.saveError}>
                      {saveError}
                    </AppText>
                  ) : null}

                  <PrimaryButton
                    label={saving ? 'Saving…' : 'Save path'}
                    onPress={() => void savePath()}
                    style={styles.saveButton}
                  />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  mapActions: { position: 'absolute', right: 15, gap: 10 },
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
  sheetContent: { paddingBottom: 2 },
  heading: { marginTop: 19 },
  description: { marginTop: 4, lineHeight: 16 },
  primaryAction: { marginTop: 17 },
  secondaryAction: { marginTop: 9 },
  notice: { marginTop: 9, lineHeight: 14 },
  disabled: { opacity: 0.55 },

  statsRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 34, backgroundColor: Palette.line },
  travelChip: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.greenSoft,
  },
  controls: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-evenly' },
  control: { alignItems: 'center', gap: 8 },
  finishButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.red,
    ...Shadows.round,
  },
  finishSquare: { width: 21, height: 21, borderRadius: 4, backgroundColor: Palette.surface },
  stopCircle: {
    width: 66,
    height: 66,
    borderWidth: 1,
    borderColor: '#DCE3DE',
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
    ...Shadows.round,
  },
  stopCard: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.md,
    gap: 10,
    backgroundColor: '#F3FAF5',
  },
  stopCardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  successDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green,
  },
  stopCardCopy: { flex: 1, gap: 2 },
  stopList: { gap: 6 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stopRowName: { flex: 1 },

  finishedHeader: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  finishedCopy: { flex: 1, gap: 3 },

  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,19,0.35)' },
  overlayFill: { ...StyleSheet.absoluteFill },
  modalSheet: {
    paddingTop: 10,
    paddingHorizontal: 18,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  modalDescription: { marginTop: 4, marginBottom: 14, lineHeight: 16 },
  modalPrimary: { marginTop: 14 },
  centerHint: { marginTop: 8, textAlign: 'center' },

  dropdown: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#D9E0DA',
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAF8',
  },
  dropdownOpen: { borderColor: '#BFE2CB', backgroundColor: Palette.surface },
  dropdownLabel: { flex: 1 },
  dropdownList: {
    marginTop: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  dropdownItem: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownItemActive: { backgroundColor: Palette.greenSoft },

  toggleRow: {
    minHeight: 54,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: { flex: 1, gap: 2 },
  toggleHint: { lineHeight: 13 },
  switch: {
    width: 44,
    height: 26,
    padding: 3,
    borderRadius: 13,
    justifyContent: 'center',
    backgroundColor: '#DDE3DE',
  },
  switchOn: { backgroundColor: Palette.green },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Palette.surface,
    ...Shadows.subtle,
  },
  switchKnobOn: { alignSelf: 'flex-end' },

  settingsTitle: { marginBottom: 8 },
  settingsRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsDropdown: { marginBottom: 10 },
  settingsDivider: { height: 1, backgroundColor: Palette.line },
  helpText: { marginBottom: 8, lineHeight: 15 },

  saveSheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  saveHandle: { alignItems: 'center', paddingTop: 8 },
  saveHeader: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
  },
  saveTitle: { flex: 1, textAlign: 'center' },
  saveHeaderSide: { width: 36 },
  saveContent: { paddingHorizontal: 18, paddingTop: 18 },
  nameField: {
    marginTop: 8,
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    justifyContent: 'center',
  },
  counter: { marginTop: 5, textAlign: 'right' },
  divider: { height: 1, marginVertical: 8, backgroundColor: Palette.line },
  combiCard: {
    marginTop: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    backgroundColor: '#FAFCF9',
  },
  combiHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  combiCopy: { flex: 1, gap: 3 },
  combiHint: { lineHeight: 13 },
  stopNames: { marginTop: 12, gap: 8 },
  stopNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopIndex: { width: 14, textAlign: 'center' },
  stopNameField: {
    flex: 1,
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  saveError: { marginTop: 12, lineHeight: 14 },
  saveButton: { marginTop: 18 },
  savedState: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  savedTitle: { marginTop: 4 },
  savedText: { textAlign: 'center', lineHeight: 16, maxWidth: 280 },
});
