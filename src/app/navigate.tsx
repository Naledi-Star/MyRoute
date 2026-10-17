import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/myroute/bottom-nav';
import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker, MapRoute } from '@/components/myroute/map-types';
import { AppText } from '@/components/myroute/text';
import { RoundButton, SoftButton, Tap } from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { placeFromParams } from '@/data/myroute';
import { distanceMetres, formatDistance } from '@/lib/geo';
import { useDeviceLocation } from '@/lib/location';
import { ensureNotificationPermission, notify } from '@/lib/notifications';
import { getRouteThrough, type RouteStep } from '@/lib/routing';

const TURN_BANNER_HEIGHT = 115;
/** Arrival geofence radius around the destination, in metres. */
const ARRIVED_M = 40;

export default function NavigateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    name?: string;
    lat?: string;
    lng?: string;
    area?: string;
  }>();
  const destination = placeFromParams({
    name: params.name,
    latitude: params.lat != null ? parseFloat(params.lat) : undefined,
    longitude: params.lng != null ? parseFloat(params.lng) : undefined,
    area: params.area,
  });
  const [manualArrived, setManualArrived] = useState(false);

  // Origin: the live device position, falling back to the Gaborone reference view.
  const { coords, origin } = useDeviceLocation({ auto: true });

  const [route, setRoute] = useState<MapRoute | null>(null);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const didFetch = useRef(false);
  const originRef = useRef(origin);

  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  // Fetch the route (with manoeuvres) once, from wherever we are when it starts.
  useEffect(() => {
    if (didFetch.current || !destination) {
      return;
    }
    didFetch.current = true;

    // The user is about to navigate: this is the natural moment to ask whether
    // we may alert them (arrival while the phone is locked, etc.).
    void ensureNotificationPermission();

    const start = originRef.current;
    getRouteThrough(
      [
        [start.longitude, start.latitude],
        [destination.longitude, destination.latitude],
      ],
      'car',
      { steps: true },
    )
      .then((result) => {
        setRoute({ coordinates: result.coordinates, color: Palette.green });
        setSteps(result.steps ?? []);
        setError(null);
      })
      .catch((err: Error) => {
        setRoute(null);
        setError(err.message);
      });
  }, [destination]);

  // The manoeuvre we are nearest to, derived each render (no cascading effects).
  const stepIndex = useMemo(() => {
    if (!coords || steps.length === 0) {
      return 0;
    }
    let best = 0;
    let bestDistance = Infinity;
    steps.forEach((step, index) => {
      const distance = distanceMetres(coords, {
        latitude: step.location[1],
        longitude: step.location[0],
      });
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }, [coords, steps]);

  // Arrival: confirmed manually, or detected by a geofence around the destination.
  const arrived = useMemo(
    () =>
      manualArrived ||
      (coords != null && destination != null && distanceMetres(coords, destination) < ARRIVED_M),
    [manualArrived, coords, destination],
  );

  const currentStep = steps[stepIndex];
  const nextStep = steps[stepIndex + 1];

  // Arrival while the app is backgrounded still deserves an alert; in the
  // foreground the arrival screen itself is the feedback, so stay quiet.
  const notifiedArrival = useRef(false);
  useEffect(() => {
    if (!arrived || notifiedArrival.current || !destination) {
      return;
    }
    notifiedArrival.current = true;
    if (AppState.currentState !== 'active') {
      void notify('You have arrived', destination.name);
    }
  }, [arrived, destination]);
  const remaining =
    route && coords && destination ? formatDistance(distanceMetres(coords, destination)) : null;

  const markers: MapMarker[] = useMemo(() => {
    const pins: MapMarker[] = [];
    if (destination) {
      pins.push({
        id: 'destination',
        latitude: destination.latitude,
        longitude: destination.longitude,
        label: destination.name,
        tone: 'red',
        kind: 'destination',
      });
    }
    return pins;
  }, [destination]);

  if (!destination) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.notFound}>
          <Icon color={Palette.green} name="map" size={40} />
          <AppText size={16} weight="bold">
            Nothing to navigate to
          </AppText>
          <AppText color="muted" size={12} style={styles.notFoundText}>
            Choose a destination, then start directions again.
          </AppText>
          <SoftButton label="Search for a place" onPress={() => router.replace('/search')} />
        </View>
      </View>
    );
  }

  if (arrived) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <LinearGradient
          colors={['#07924E', '#067A42']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.arrivalBanner, { paddingTop: insets.top + 20 }]}>
          <View style={styles.arrivalCheck}>
            <Icon color={Palette.surface} name="check" />
          </View>
          <AppText color="white" size={17} weight="bold">
            You have arrived
          </AppText>
        </LinearGradient>

        <ScrollView contentContainerStyle={styles.arrivalContent}>
          <AppText variant="placeTitle">{destination.name}</AppText>
          <View style={styles.arrivalImage} />
          <AppText size={16} style={styles.arrivalQuestion} weight="bold">
            Is this the correct place?
          </AppText>
          <View style={styles.arrivalActions}>
            <Tap
              accessibilityLabel="Yes, that is it"
              onPress={() => router.navigate('/')}
              style={[styles.arrivalButton, styles.yesButton]}>
              <Icon color={Palette.greenDark} name="check" size={18} />
              <AppText color="greenDark" size={13} weight="bold">
                Yes, that&apos;s it
              </AppText>
            </Tap>
            <Tap
              accessibilityLabel="No, it is not"
              onPress={() =>
                router.push({
                  pathname: '/create-request',
                  params: { name: destination.name },
                })
              }
              style={[styles.arrivalButton, styles.noButton]}>
              <Icon color="#CA453B" name="close" size={18} />
              <AppText color="red" size={13} weight="bold">
                No, it&apos;s not
              </AppText>
            </Tap>
          </View>
          <Tap accessibilityLabel="Add a better photo" onPress={() => router.push('/add')}>
            <View style={styles.photoButton}>
              <Icon color={Palette.green} name="camera" size={19} />
              <AppText color="green" size={13} weight="bold">
                Add a better photo
              </AppText>
            </View>
          </Tap>
        </ScrollView>

        <BottomNav active="explore" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#069450', '#067941']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[
          styles.turnBanner,
          { paddingTop: insets.top, height: TURN_BANNER_HEIGHT + insets.top },
        ]}>
        <Icon color={Palette.surface} name="arrow" size={42} strokeWidth={2.2} />
        <View style={styles.turnCopy}>
          <AppText color="white" size={27} weight="bold">
            {currentStep ? formatDistance(currentStep.distanceMetres) : remaining ?? '—'}
          </AppText>
          <AppText color="white" size={15}>
            {currentStep?.instruction ?? 'Starting…'}
          </AppText>
        </View>
        <RoundButton
          accessibilityLabel="Exit navigation"
          icon="close"
          iconSize={19}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          tone="glass"
        />
      </LinearGradient>

      <View style={[styles.mapArea, { top: TURN_BANNER_HEIGHT + insets.top }]}>
        <InteractiveMap
          bottomInset={180}
          focus="me"
          followUser
          markers={markers}
          route={route ?? undefined}
          styleId="positron"
          userLocation={coords}
        />
      </View>

      <View style={[styles.instructionCard, { bottom: insets.bottom + 18 }]}>
        <AppText size={20} weight="bold">
          {nextStep ? formatDistance(nextStep.distanceMetres) : 'You are almost there'}
        </AppText>
        <View style={styles.instructionContent}>
          <AppText style={styles.instructionText} variant="body">
            {nextStep?.instruction ?? `Arriving at ${destination.name}`}
          </AppText>
          <View style={styles.instructionImage} />
        </View>
        {error ? (
          <AppText color="red" size={11} style={styles.error}>
            Using an offline estimate · {error}
          </AppText>
        ) : (
          <SoftButton label="I have arrived" onPress={() => setManualArrived(true)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  turnBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 7,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  turnCopy: { flex: 1, gap: 2 },
  mapArea: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  instructionCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 7,
    padding: 17,
    borderRadius: Radius.xl,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  instructionContent: {
    marginTop: 8,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionText: { flex: 1, fontSize: 13, lineHeight: 18 },
  instructionImage: { width: 85, height: 65, borderRadius: 10, backgroundColor: Palette.soft },
  error: { marginBottom: 4 },
  arrivalBanner: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  arrivalCheck: {
    width: 31,
    height: 31,
    borderWidth: 1,
    borderColor: Palette.surface,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 30 },
  arrivalImage: {
    width: '100%',
    height: 245,
    marginTop: 13,
    borderRadius: Radius.lg,
    backgroundColor: Palette.soft,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 9,
    backgroundColor: Palette.surface,
  },
  notFoundText: { textAlign: 'center' },
  arrivalQuestion: { marginTop: 22, marginBottom: 13 },
  arrivalActions: { flexDirection: 'row', gap: 10 },
  arrivalButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  yesButton: { borderColor: '#BDE1CA', backgroundColor: Palette.greenSoft },
  noButton: { borderColor: '#F1C8C3', backgroundColor: '#FFF0EE' },
  photoButton: {
    marginTop: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
});
