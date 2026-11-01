import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import { COMBI_LINE_COLOR, type MapMarker, type MapRoute } from '@/components/myroute/map-types';
import { useTrackCapture } from '@/components/myroute/recorder/capture';
import {
  BottomPanel,
  ConfirmationCard,
  KeyboardSafeModal,
  StopsEditor,
  ToggleRow,
  TripStats,
} from '@/components/myroute/recorder/parts';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  IconBadge,
  PrimaryButton,
  RoundButton,
  SecondaryButton,
  Tap,
  TextField,
  TopBar,
} from '@/components/myroute/ui';
import { DEFAULT_MAP_STYLE } from '@/constants/map';
import { Palette } from '@/constants/theme';
import { formatDistance } from '@/lib/geo';
import { useDeviceLocation } from '@/lib/location';
import { labelledEndpoints, loadPaths, snapVertices, type SavedPath } from '@/lib/paths';
import { formatDuration } from '@/lib/routing';
import { saveCombiRoute } from '@/lib/save-contribution';
import {
  SNAP_SIMPLIFY_M,
  STOP_GOOD_ACCURACY_M,
  simplifyTrack,
  trackWithStops,
} from '@/lib/track';

/**
 * The combi flow: ride the route, add a stop at every boarding point, save it.
 *
 * This is its own screen, not a mode of the path recorder. Everything here talks
 * about a ride — a route name, a rank it leaves from, stops with stage fares and
 * optional photos — and it saves a `combi` record through `saveCombiRoute`. It
 * cannot save a path, because it never builds one.
 */

type Stage = 'idle' | 'recording' | 'finished';

const MAX_NAME_LENGTH = 50;

export default function RecordCombiRouteScreen() {
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
    setFare,
    setJustAdded,
    setLabel,
    setStops,
    stopNotice,
    stops,
  } = useTrackCapture();

  const [stage, setStage] = useState<Stage>('idle');
  const [sliderOpen, setSliderOpen] = useState<'settings' | 'save' | null>(null);
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

  // Open a saved combi route for editing. A path opened here is left alone: it
  // belongs to the path flow.
  useEffect(() => {
    if (!editingId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const existing = (await loadPaths()).find((path) => path.id === editingId);
      if (cancelled || !existing || existing.kind !== 'combi') {
        return;
      }
      setEditing(existing);
      setName(existing.combiName?.trim() || existing.name);
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
        setStage('finished');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, recorder.loadVertices]);

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

  const geometry = useMemo<[number, number][]>(
    () => trackWithStops(points, stops).map((point) => [point.longitude, point.latitude] as [number, number]),
    [points, stops],
  );

  const liveMetres = recordedMetres;
  const elapsed = Math.max(clock, Math.round(recorder.durationSeconds));
  const lastPoint = points[points.length - 1];
  const liveLocation = recording && lastPoint ? lastPoint : coords;

  // A combi route is an overlay on the map, not a road, so it keeps the app's
  // blue and a dashed stroke: a ride inside a recorded path still reads as a ride.
  const preview = useMemo<MapRoute | undefined>(() => {
    if (stage === 'finished' && snappedRoute) {
      return { coordinates: snappedRoute.coordinates, color: COMBI_LINE_COLOR, dashed: true };
    }
    if (geometry.length < 2) {
      return undefined;
    }
    return { coordinates: geometry, color: COMBI_LINE_COLOR, dashed: true };
  }, [geometry, snappedRoute, stage]);

  const labelled = useMemo(
    () => labelledEndpoints(snappedRoute?.coordinates ?? geometry, stops),
    [geometry, snappedRoute, stops],
  );

  const markers = useMemo<MapMarker[]>(
    () =>
      labelled.map((point, index) => ({
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        label: point.label,
        tone:
          point.accuracy != null && point.accuracy > STOP_GOOD_ACCURACY_M
            ? ('amber' as const)
            : index === 0
              ? ('blue' as const)
              : ('green' as const),
        kind: 'destination' as const,
      })),
    [labelled],
  );

  const startRecording = useCallback(async () => {
    setStage('recording');
    setStartedAt(Date.now());
    setClock(0);
    setJustAdded(null);
    setSnappedRoute(null);
    setFinishedDistance(0);
    setFinishedDuration(0);
    setError(null);
    const started = await recorder.start(coords);
    if (!started) {
      setStage('idle');
      setStartedAt(null);
    }
  }, [coords, recorder, setJustAdded]);

  const finishRecording = useCallback(() => {
    const seconds = startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : 0;
    setFinishedDistance(recorder.distanceMetres);
    setFinishedDuration(Math.max(seconds, Math.round(recorder.durationSeconds)));
    recorder.stop();
    setJustAdded(null);
    setStage('finished');
  }, [recorder, setJustAdded, startedAt]);

  const markStop = useCallback(async () => {
    setSnappedRoute(null);
    await captureStop();
  }, [captureStop]);

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

  const openSave = useCallback(() => {
    setSaved(false);
    setSaveError(null);
    setUploadError(null);
    if (!name.trim()) {
      // The ride's first stop is usually the rank it leaves from, which is what
      // the community searches for; offer it as the route name.
      setName(labelled[0]?.label ?? '');
    }
    setSliderOpen('save');
  }, [labelled, name]);

  const save = useCallback(async () => {
    setSaveError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setSaveError('Name the route — the road it runs along, or the rank it leaves from.');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setSaveError(`The name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (geometry.length < 2) {
      setSaveError('Record a little further, or add a stop, before saving the route.');
      return;
    }
    setSaving(true);
    try {
      let snapped = snappedRoute;
      if (snapEnabled && snapped == null) {
        try {
          const source =
            points.length > 2
              ? simplifyTrack(points, SNAP_SIMPLIFY_M).map(
                  (point) => [point.longitude, point.latitude] as [number, number],
                )
              : geometry;
          snapped = await snapVertices(source, 'car');
        } catch {
          snapped = null;
        }
      }

      const coordinates = snapped?.coordinates ?? geometry;
      const waypoints = labelledEndpoints(
        coordinates,
        stops.filter((stop) => stop.label.trim().length > 0),
      );

      const outcome = await saveCombiRoute({
        ...(editing
          ? { id: editing.id, createdAt: editing.createdAt, status: editing.status }
          : {}),
        name: trimmed,
        rank: (waypoints[0]?.label ?? '').trim(),
        profile: 'car',
        vertices: geometry,
        waypoints,
        source: 'recorded',
        coordinates,
        snapped: snapped != null,
        distanceMetres: finishedDistance || liveMetres,
        durationSeconds: finishedDuration,
      });

      setSnappedRoute(snapped);
      setUploadError(outcome.uploadError);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the combi route.');
    } finally {
      setSaving(false);
    }
  }, [
    editing,
    finishedDistance,
    finishedDuration,
    geometry,
    liveMetres,
    name,
    points,
    snapEnabled,
    snappedRoute,
    stops,
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

  const recentre = useCallback(() => {
    setRecenterKey((value) => value + 1);
    if (!liveLocation) {
      void enableLocation();
    }
  }, [enableLocation, liveLocation]);

  const title =
    stage === 'recording'
      ? 'Recording the ride...'
      : sliderOpen === 'save' || saved
        ? 'Save combi route'
        : 'Record a combi route';

  return (
    <View style={styles.screen}>
      <InteractiveMap
        bottomInset={sheetHeight}
        fitRoute={stage === 'finished'}
        focus="me"
        followUser={stage === 'recording'}
        markers={markers}
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
              accessibilityLabel="Combi route settings"
              icon="settings"
              onPress={() => {
                setHelpOpen(false);
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
        onLayout={(event: LayoutChangeEvent) => setSheetHeight(event.nativeEvent.layout.height)}>
        {stage === 'idle' ? (
          <>
            <AppText size={17} weight="bold" style={styles.heading}>
              Ready to record the ride?
            </AppText>
            <AppText color="muted" size={11} style={styles.description}>
              Board the combi, then add a stop at every place riders can get on or off. The ride is
              saved as a combi route — never as a path.
            </AppText>

            <PrimaryButton
              icon="locate"
              label="Start recording the ride"
              onPress={() => void startRecording()}
              style={styles.primaryAction}
            />
            <SecondaryButton
              icon="pin"
              label={capturing ? 'Measuring…' : 'Add a stop'}
              onPress={() => void markStop()}
              style={styles.secondaryAction}
            />

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
            {stops.length > 0 ? (
              <AppText color="green" size={10} style={styles.notice} weight="semibold">
                {stops.length} stop{stops.length === 1 ? '' : 's'} added
              </AppText>
            ) : null}
          </>
        ) : null}

        {stage === 'recording' ? (
          <>
            {showStats ? <TripStats elapsedSeconds={elapsed} metres={liveMetres} /> : null}

            <View style={styles.travelChip}>
              <Icon color={Palette.blue} name="minibus" size={15} />
              <AppText color="blue" size={11} weight="semibold">
                Combi
              </AppText>
            </View>

            {justAdded ? (
              <ConfirmationCard
                body={`${justAdded.label} · riders can board or get off here.`}
                onDismiss={() => setJustAdded(null)}
                title="Stop added!">
                <SecondaryButton
                  label={viewStops ? 'Hide stops' : 'View stops'}
                  onPress={() => setViewStops((current) => !current)}
                  small
                />
                {viewStops ? (
                  <StopsEditor
                    onFare={setFare}
                    onLabel={setLabel}
                    onPhoto={(stopId) => void attachPhoto(stopId)}
                    showFare
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
                <Tap accessibilityLabel="Add a stop" onPress={() => void markStop()}>
                  <View style={styles.stopCircle}>
                    <Icon color={Palette.ink} name="pin" size={22} />
                  </View>
                </Tap>
                <AppText size={11} weight="semibold">
                  Add a stop
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
                  Combi route recorded!
                </AppText>
                <AppText color="muted" size={11}>
                  {formatDistance(finishedDistance || liveMetres)} ·{' '}
                  {formatDuration(finishedDuration)} · {stops.length} stop
                  {stops.length === 1 ? '' : 's'}
                </AppText>
              </View>
            </View>

            {justAdded ? (
              <ConfirmationCard
                body="Riders can board or get off here."
                onDismiss={() => setJustAdded(null)}
                title="Stop added!">
                <SecondaryButton
                  label={viewStops ? 'Hide stops' : 'View stops'}
                  onPress={() => setViewStops((current) => !current)}
                  small
                />
                {viewStops ? (
                  <StopsEditor
                    onFare={setFare}
                    onLabel={setLabel}
                    onPhoto={(stopId) => void attachPhoto(stopId)}
                    showFare
                    stops={stops}
                  />
                ) : null}
              </ConfirmationCard>
            ) : null}

            <PrimaryButton
              icon="edit"
              label="Save combi route"
              onPress={openSave}
              style={styles.primaryAction}
            />
            <SecondaryButton
              icon="pin"
              label={capturing ? 'Measuring…' : 'Add a stop'}
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
        title="Combi route settings"
        visible={sliderOpen === 'settings'}>
        <ToggleRow
          description="Align the ride with nearby roads where a road is available."
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
            Ride the route with the phone recording, then add a stop wherever riders can get on or
            off. Stops can carry a stage fare and a photo; neither is required. The route is saved
            for everyone to search.
          </AppText>
        ) : null}
        <PrimaryButton label="Done" onPress={() => setSliderOpen(null)} style={styles.modalPrimary} />
      </KeyboardSafeModal>

      <KeyboardSafeModal
        onClose={() => setSliderOpen(null)}
        title="Save combi route"
        visible={sliderOpen === 'save'}>
        {saved ? (
          <View style={styles.savedState}>
            <IconBadge icon="check" size={52} />
            <AppText size={17} weight="bold" style={styles.savedTitle}>
              Combi route saved
            </AppText>
            <AppText color="muted" size={11} style={styles.savedText}>
              {uploadError
                ? `${name.trim()} is on this device, but it has not reached the community database yet: ${uploadError}`
                : `${name.trim()} is saved as a combi route and has been sent to the community database.`}
            </AppText>
            <PrimaryButton
              label="Done"
              onPress={() => {
                setSliderOpen(null);
                router.navigate('/combi');
              }}
              style={styles.saveButton}
            />
          </View>
        ) : (
          <>
            <AppText size={12} weight="bold">
              Name this combi route
            </AppText>
            <View style={styles.nameField}>
              <TextField
                maxLength={MAX_NAME_LENGTH}
                onChangeText={setName}
                placeholder="Block 8 rank to Gaborone West"
                value={name}
              />
            </View>
            <AppText color="muted" size={9} style={styles.counter}>
              {name.length}/{MAX_NAME_LENGTH} · saved with its stops, so people can search the
              boarding points
            </AppText>

            <View style={styles.divider} />
            <ToggleRow
              description="Align the ride to nearby roads where a road is available."
              label="Snap to roads"
              onChange={setSnapEnabled}
              value={snapEnabled}
            />

            <View style={styles.divider} />
            <AppText size={12} weight="bold">
              Stops and boarding points
            </AppText>
            <StopsEditor
              emptyHint="Record a little further, or add a stop, so the route has a start and an end."
              onFare={setFare}
              onLabel={labelStop}
              onPhoto={(stopId) => void attachPhoto(stopId)}
              showFare
              fareHelp
              stops={labelled}
            />

            {saveError ? (
              <AppText color="red" size={10} style={styles.saveError}>
                {saveError}
              </AppText>
            ) : null}

            <PrimaryButton
              label={saving ? 'Saving…' : 'Save combi route'}
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
  heading: { marginTop: 16 },
  description: { marginTop: 4, lineHeight: 16 },
  primaryAction: { marginTop: 17 },
  secondaryAction: { marginTop: 9 },
  notice: { marginTop: 9, lineHeight: 14 },
  travelChip: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF1FD',
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
  divider: { height: 1, marginVertical: 8, backgroundColor: Palette.line },
  settingsRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpText: { marginBottom: 8, lineHeight: 15 },
  modalPrimary: { marginTop: 14 },
  nameField: {
    marginTop: 8,
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: 10,
    justifyContent: 'center',
  },
  counter: { marginTop: 5, lineHeight: 13 },
  saveError: { marginTop: 12, lineHeight: 14 },
  saveButton: { marginTop: 18 },
  savedState: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  savedTitle: { marginTop: 4 },
  savedText: { textAlign: 'center', lineHeight: 16, maxWidth: 280 },
});
