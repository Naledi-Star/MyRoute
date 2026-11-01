import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import { PATH_LINE_COLOR, type MapMarker, type MapRoute } from '@/components/myroute/map-types';
import { useTrackCapture } from '@/components/myroute/recorder/capture';
import {
  BottomPanel,
  ConfirmationCard,
  KeyboardSafeModal,
  SelectField,
  StopsEditor,
  ToggleRow,
  TripStats,
  type SelectOption,
} from '@/components/myroute/recorder/parts';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  IconBadge,
  PrimaryButton,
  RoundButton,
  SecondaryButton,
  Segmented,
  Tap,
  TextField,
  TopBar,
} from '@/components/myroute/ui';
import { DEFAULT_MAP_STYLE } from '@/constants/map';
import { Palette } from '@/constants/theme';
import { formatDistance } from '@/lib/geo';
import { useDeviceLocation } from '@/lib/location';
import { labelledEndpoints, loadPaths, snapVertices, type SavedPath } from '@/lib/paths';
import { formatDuration, type TravelProfile } from '@/lib/routing';
import { savePath } from '@/lib/save-contribution';
import {
  SNAP_SIMPLIFY_M,
  STOP_GOOD_ACCURACY_M,
  simplifyTrack,
  trackDistanceMetres,
  trackWithStops,
} from '@/lib/track';

/**
 * The path flow: record the road you travelled, or draw it on the map.
 *
 * A path is map data — a street the tile provider does not know yet — so it is
 * saved as a path, drawn in the map's own neutral line colour, and never carries
 * combi boarding points or stage fares. Combi routes have their own screen
 * (`record-combi.tsx`) and their own save; the two flows do not share a kind.
 */

type Stage = 'idle' | 'recording' | 'finished';
type CaptureMode = 'record' | 'draw';
type TravelMode = 'car' | 'bike' | 'walk';

const TRAVEL_OPTIONS: SelectOption[] = [
  { key: 'car', label: 'Car', icon: 'car' },
  { key: 'bike', label: 'Bike', icon: 'bike' },
  { key: 'walk', label: 'On foot', icon: 'walk' },
];

const PROFILES: Record<TravelMode, TravelProfile> = { car: 'car', bike: 'bike', walk: 'foot' };

const MAX_NAME_LENGTH = 50;

export default function RecordPathScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { id: editingId } = useLocalSearchParams<{ id?: string }>();

  const {
    attachPhoto,
    captureStop,
    capturing,
    justAdded,
    points,
    recordedMetres,
    recorder,
    recording,
    setJustAdded,
    setLabel,
    setStops,
    stopNotice,
    stops,
  } = useTrackCapture();

  const [stage, setStage] = useState<Stage>('idle');
  const [mode, setMode] = useState<CaptureMode>('record');
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [travelMode, setTravelMode] = useState<TravelMode | null>(null);
  const [sliderOpen, setSliderOpen] = useState<'travel' | 'settings' | 'save' | null>(null);
  const [travelDraft, setTravelDraft] = useState<TravelMode | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [viewStops, setViewStops] = useState(false);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  // The map's own fix. While recording the recorder has a high-accuracy watch of
  // its own, so this one is paused rather than run alongside it.
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

  // Open a saved path so it can be edited and re-saved.
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
      // A combi route is edited in the combi flow; this screen only owns paths.
      if (existing.kind === 'combi') {
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
        setMode('record');
        setStage('finished');
      } else {
        setDrawVertices(existing.vertices);
        setMode('draw');
        setStage('idle');
      }
      setTravelMode(existing.profile === 'car' ? 'car' : existing.profile === 'bike' ? 'bike' : 'walk');
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

  useFocusEffect(
    useCallback(() => {
      setError(null);
    }, []),
  );

  const geometry = useMemo<[number, number][]>(() => {
    if (mode === 'draw' && stage === 'idle') {
      return drawVertices;
    }
    return trackWithStops(points, stops).map(
      (point) => [point.longitude, point.latitude] as [number, number],
    );
  }, [drawVertices, mode, points, stage, stops]);

  const drawnMetres = useMemo(
    () =>
      trackDistanceMetres(
        drawVertices.map(([longitude, latitude]) => ({ latitude, longitude })),
      ),
    [drawVertices],
  );

  const liveMetres = mode === 'draw' ? drawnMetres : recordedMetres;
  const elapsed = Math.max(clock, Math.round(recorder.durationSeconds));

  const lastPoint = points[points.length - 1];
  const liveLocation = recording && lastPoint ? lastPoint : coords;

  const preview = useMemo<MapRoute | undefined>(() => {
    if (stage === 'finished' && snappedRoute) {
      return { coordinates: snappedRoute.coordinates, color: PATH_LINE_COLOR };
    }
    if (geometry.length < 2) {
      return undefined;
    }
    // A path is part of the map, so it uses the map's own line colour.
    return { coordinates: geometry, color: PATH_LINE_COLOR };
  }, [geometry, snappedRoute, stage]);

  const labelled = useMemo(
    () => labelledEndpoints(snappedRoute?.coordinates ?? geometry, stops),
    [geometry, snappedRoute, stops],
  );

  const markers = useMemo<MapMarker[]>(() => {
    if (mode === 'draw' && stage === 'idle') {
      return drawVertices.map((coordinate, index) => ({
        id: `vertex-${index}`,
        latitude: coordinate[1],
        longitude: coordinate[0],
        label: `${index + 1}`,
        tone: index === 0 ? ('green' as const) : ('blue' as const),
        kind: 'destination' as const,
      }));
    }
    return labelled.map((point) => ({
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
      label: point.label,
      tone:
        point.accuracy != null && point.accuracy > STOP_GOOD_ACCURACY_M
          ? ('amber' as const)
          : point.label === 'Start'
            ? ('blue' as const)
            : ('green' as const),
      kind: 'destination' as const,
    }));
  }, [drawVertices, labelled, mode, stage]);

  const measureSheet = (event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height);
  };

  const chooseTravel = useCallback((key: string) => {
    const next = key as TravelMode;
    setTravelMode(next);
    setTravelDraft(next);
  }, []);

  const startRecording = useCallback(
    async (chosen?: TravelMode) => {
      const chosenMode = chosen ?? travelMode;
      if (!chosenMode) {
        return;
      }
      setTravelMode(chosenMode);
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
        setStage('idle');
        setStartedAt(null);
      }
    },
    [coords, recorder, setJustAdded, travelMode],
  );

  const finishRecording = useCallback(() => {
    const seconds = startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : 0;
    setFinishedDistance(recorder.distanceMetres);
    setFinishedDuration(Math.max(seconds, Math.round(recorder.durationSeconds)));
    recorder.stop();
    setJustAdded(null);
    setStage('finished');
  }, [recorder, setJustAdded, startedAt]);

  const addVertex = useCallback(
    (point: { latitude: number; longitude: number }) => {
      setError(null);
      setSnappedRoute(null);
      setDrawVertices((current) => [...current, [point.longitude, point.latitude]]);
    },
    [],
  );

  const clearDraw = useCallback(() => {
    setDrawVertices([]);
    setSnappedRoute(null);
    setError(null);
  }, []);

  const switchMode = useCallback(
    (next: CaptureMode) => {
      if (next === mode || stage !== 'idle') {
        return;
      }
      setMode(next);
      setSnappedRoute(null);
      setError(null);
    },
    [mode, stage],
  );

  /** Marking a stop changes the line, so any previous road match is stale. */
  const markStop = useCallback(async () => {
    setSnappedRoute(null);
    await captureStop();
  }, [captureStop]);

  /** Rename a stop in the save panel, promoting a generated Start/End if needed. */
  const labelStop = useCallback(
    (stopId: string, label: string) => {
      setStops((current) => {
        if (current.some((stop) => stop.id === stopId)) {
          return current.map((stop) => (stop.id === stopId ? { ...stop, label } : stop));
        }
        const generated = labelled.find((stop) => stop.id === stopId);
        return generated ? [...current, { ...generated, label }] : current;
      });
    },
    [labelled, setStops],
  );

  const snapLine = useCallback(async () => {
    const source =
      mode === 'record' && points.length > 2
        ? simplifyTrack(points, SNAP_SIMPLIFY_M).map(
            (point) => [point.longitude, point.latitude] as [number, number],
          )
        : geometry;
    return snapVertices(source, travelMode ? PROFILES[travelMode] : 'foot');
  }, [geometry, mode, points, travelMode]);

  const save = useCallback(async () => {
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
        mode === 'record'
          ? 'Record a little further, or mark a stop, before saving.'
          : 'Tap the map at least twice to draw a path.',
      );
      return;
    }

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
      const waypoints = labelledEndpoints(
        coordinates,
        stops.filter((stop) => stop.label.trim().length > 0),
      );
      const measured =
        mode === 'record'
          ? { distanceMetres: finishedDistance || liveMetres, durationSeconds: finishedDuration }
          : {
              distanceMetres: snapped?.distanceMetres ?? drawnMetres,
              durationSeconds: snapped?.durationSeconds ?? 0,
            };

      const outcome = await savePath({
        ...(editing
          ? { id: editing.id, createdAt: editing.createdAt, status: editing.status }
          : {}),
        name: trimmed,
        profile: travelMode ? PROFILES[travelMode] : 'foot',
        vertices: geometry,
        waypoints,
        source: mode === 'record' ? 'recorded' : 'drawn',
        coordinates,
        snapped: snapped != null,
        distanceMetres: measured.distanceMetres,
        durationSeconds: measured.durationSeconds,
      });

      setSnappedRoute(snapped);
      setUploadError(outcome.uploadError);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the path.');
    } finally {
      setSaving(false);
    }
  }, [
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
    setUploadError(null);
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

  const selectedTravel = TRAVEL_OPTIONS.find((option) => option.key === travelMode) ?? null;
  const title =
    stage === 'recording'
      ? 'Recording...'
      : sliderOpen === 'save' || saved
        ? 'Save path'
        : 'Record a path';

  return (
    <View style={styles.screen}>
      <InteractiveMap
        bottomInset={sheetHeight}
        fitRoute={stage === 'finished'}
        focus="me"
        followUser={stage === 'recording'}
        markers={markers}
        onMapPress={mode === 'draw' && stage === 'idle' ? addVertex : undefined}
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

      <BottomPanel
        bottomInset={insets.bottom}
        maxHeight={Math.round(windowHeight * 0.78)}
        onLayout={measureSheet}>
        {stage === 'idle' ? (
          <>
            <Segmented
              onChange={(value) => switchMode(value === 'Draw' ? 'draw' : 'record')}
              options={['Record', 'Draw']}
              value={mode === 'draw' ? 'Draw' : 'Record'}
            />

            {mode === 'record' ? (
              <>
                <AppText size={17} weight="bold" style={styles.heading}>
                  Ready to record?
                </AppText>
                <AppText color="muted" size={11} style={styles.description}>
                  Follow your route and MyRoute will trace the road you actually take.
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
              icon={mode === 'record' ? 'locate' : 'edit'}
              label={mode === 'record' ? 'Start recording' : 'Save drawn path'}
              onPress={() => {
                if (mode === 'record') {
                  setTravelDraft(null);
                  setSliderOpen('travel');
                } else {
                  openSave();
                }
              }}
              style={styles.primaryAction}
            />

            {mode === 'record' ? (
              <SecondaryButton
                icon="pin"
                label={capturing ? 'Measuring…' : 'Mark a stop'}
                onPress={() => void markStop()}
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
            {mode === 'record' && stops.length > 0 ? (
              <AppText color="green" size={10} style={styles.notice} weight="semibold">
                {stops.length} stop{stops.length === 1 ? '' : 's'} marked
              </AppText>
            ) : null}
          </>
        ) : null}

        {stage === 'recording' ? (
          <>
            {showStats ? <TripStats elapsedSeconds={elapsed} metres={liveMetres} /> : null}

            {selectedTravel ? (
              <View style={styles.travelChip}>
                <Icon color={Palette.green} name={selectedTravel.icon ?? 'compass'} size={15} />
                <AppText color="green" size={11} weight="semibold">
                  {selectedTravel.label}
                </AppText>
              </View>
            ) : null}

            {justAdded ? (
              <ConfirmationCard
                body={`${justAdded.label} · this stop will be included in your route.`}
                onDismiss={() => setJustAdded(null)}
                title="Stop added!">
                <SecondaryButton
                  label={viewStops ? 'Hide stops' : 'View stops'}
                  onPress={() => setViewStops((current) => !current)}
                  small
                />
                {viewStops ? (
                  <StopsEditor
                    onLabel={setLabel}
                    onPhoto={(stopId) => void attachPhoto(stopId)}
                    stops={stops}
                  />
                ) : null}
              </ConfirmationCard>
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
                <Tap accessibilityLabel="Mark a stop" onPress={() => void markStop()}>
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
              <ConfirmationCard
                body="This stop will be included in your route."
                onDismiss={() => setJustAdded(null)}
                title="Stop added!">
                <SecondaryButton
                  label={viewStops ? 'Hide stops' : 'View stops'}
                  onPress={() => setViewStops((current) => !current)}
                  small
                />
                {viewStops ? (
                  <StopsEditor
                    onLabel={setLabel}
                    onPhoto={(stopId) => void attachPhoto(stopId)}
                    stops={stops}
                  />
                ) : null}
              </ConfirmationCard>
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
              onPress={() => void markStop()}
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
      </BottomPanel>

      <KeyboardSafeModal
        onClose={() => setSliderOpen(null)}
        title="How are you travelling?"
        visible={sliderOpen === 'travel'}>
        <AppText color="muted" size={11} style={styles.modalDescription}>
          Choose your travel mode to start recording your route.
        </AppText>
        <SelectField
          onChange={chooseTravel}
          options={TRAVEL_OPTIONS}
          placeholder="Select travel mode"
          value={travelDraft}
        />
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
      </KeyboardSafeModal>

      <KeyboardSafeModal
        onClose={() => setSliderOpen(null)}
        title="Route settings"
        visible={sliderOpen === 'settings'}>
        {stage !== 'recording' ? (
          <>
            <SelectField
              label="Travel mode"
              onChange={chooseTravel}
              options={TRAVEL_OPTIONS}
              placeholder="Not set"
              value={travelMode}
            />
            <View style={styles.divider} />
          </>
        ) : null}
        <ToggleRow
          description="Align the recorded line with nearby roads when saving."
          label="Snap to roads"
          onChange={setSnapEnabled}
          value={snapEnabled}
        />
        <View style={styles.divider} />
        <ToggleRow
          description="Show the timer and distance while recording."
          label="Show distance and time"
          onChange={setShowStats}
          value={showStats}
        />
        <View style={styles.divider} />
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
            Record traces the road you travel using GPS; Draw adds points by tapping the map. Mark a
            stop at any place worth naming — each stop can carry a photo, but none is required.
          </AppText>
        ) : null}
        <PrimaryButton
          label="Done"
          onPress={() => setSliderOpen(null)}
          style={styles.modalPrimary}
        />
      </KeyboardSafeModal>

      <KeyboardSafeModal
        onClose={() => setSliderOpen(null)}
        title="Save path"
        visible={sliderOpen === 'save'}>
        {saved ? (
          <View style={styles.savedState}>
            <IconBadge icon="check" size={52} />
            <AppText size={17} weight="bold" style={styles.savedTitle}>
              Path saved
            </AppText>
            <AppText color="muted" size={11} style={styles.savedText}>
              {uploadError
                ? `${name.trim()} is on this device, but it has not reached the community database yet: ${uploadError}`
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

            <View style={styles.divider} />
            <AppText size={12} weight="bold">
              Stops on this path
            </AppText>
            {labelled.length >= 2 ? (
              <>
                <AppText color="muted" size={10} style={styles.stopsHint}>
                  Start and End come from the line itself. Rename them if you know the places, and
                  add a photo to any stop if you like.
                </AppText>
                <StopsEditor
                  onLabel={labelStop}
                  onPhoto={(stopId) => void attachPhoto(stopId)}
                  stops={labelled}
                />
              </>
            ) : (
              <AppText color="amber" size={10} style={styles.stopsHint}>
                Record a little or tap the map at least twice so the path has a start and an end.
              </AppText>
            )}

            {saveError ? (
              <AppText color="red" size={10} style={styles.saveError}>
                {saveError}
              </AppText>
            ) : null}

            <PrimaryButton
              label={saving ? 'Saving…' : 'Save path'}
              onPress={() => void save()}
              style={styles.saveButton}
            />
          </>
        )}
      </KeyboardSafeModal>
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
  },
  mapActions: { position: 'absolute', right: 15, gap: 10 },
  heading: { marginTop: 19 },
  description: { marginTop: 4, lineHeight: 16 },
  primaryAction: { marginTop: 17 },
  secondaryAction: { marginTop: 9 },
  notice: { marginTop: 9, lineHeight: 14 },
  disabled: { opacity: 0.55 },
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
  },
  finishedHeader: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  finishedCopy: { flex: 1, gap: 3 },
  modalDescription: { marginTop: 4, marginBottom: 14, lineHeight: 16 },
  modalPrimary: { marginTop: 14 },
  centerHint: { marginTop: 8, textAlign: 'center' },
  settingsRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: { height: 1, marginVertical: 8, backgroundColor: Palette.line },
  helpText: { marginBottom: 8, lineHeight: 15 },
  nameField: {
    marginTop: 8,
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: 10,
    justifyContent: 'center',
  },
  counter: { marginTop: 5, textAlign: 'right' },
  stopsHint: { marginTop: 6, marginBottom: 4, lineHeight: 14 },
  saveError: { marginTop: 12, lineHeight: 14 },
  saveButton: { marginTop: 18 },
  savedState: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  savedTitle: { marginTop: 4 },
  savedText: { textAlign: 'center', lineHeight: 16, maxWidth: 280 },
});
