import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker, MapRoute } from '@/components/myroute/map-types';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  PrimaryButton,
  RoundButton,
  SheetHandle,
  Tap,
  TopBar,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { placeFromParams, travelModes, type TravelModeKey } from '@/data/myroute';
import { useDeviceLocation } from '@/lib/location';
import { formatDuration, getRoute, type TravelProfile } from '@/lib/routing';

const PROFILE_FOR_MODE: Record<TravelModeKey, TravelProfile> = {
  car: 'car',
  bike: 'bike',
  walk: 'foot',
};

export default function RouteScreen() {
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
  const [mode, setMode] = useState<TravelModeKey>('car');
  const active = travelModes.find((travel) => travel.key === mode) ?? travelModes[0];

  const [route, setRoute] = useState<MapRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>(active.summary);
  const [detail, setDetail] = useState<string>(active.detail);

  // Origin: the device position, falling back to the Gaborone reference view.
  const { origin: deviceOrigin, coords } = useDeviceLocation({ auto: true });
  const [focusedOnMe, setFocusedOnMe] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const origin = useMemo(
    () => ({ latitude: deviceOrigin.latitude, longitude: deviceOrigin.longitude }),
    [deviceOrigin.latitude, deviceOrigin.longitude],
  );

  // The destination pin. Community pins arrive with the backend later.
  const markers: MapMarker[] = useMemo(() => {
    if (!destination) {
      return [];
    }
    return [
      {
        id: `destination-${destination.name}`,
        latitude: destination.latitude,
        longitude: destination.longitude,
        label: destination.name,
        tone: 'red' as const,
        kind: 'destination' as const,
      },
    ];
  }, [destination]);

  // Fetch a real route whenever the destination or travel mode changes.
  useEffect(() => {
    if (!destination) {
      return;
    }
    let cancelled = false;

    getRoute(
      [origin.longitude, origin.latitude],
      [destination.longitude, destination.latitude],
      PROFILE_FOR_MODE[mode],
    )
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRoute({
          coordinates: result.coordinates,
          color: mode === 'walk' ? Palette.green : Palette.blue,
        });
        setSummary(formatDuration(result.durationSeconds));
        const km = (result.distanceMetres / 1000).toFixed(1);
        setDetail(`${km} km · ${active.note}`);
        setRouteError(null);
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        setRoute(null);
        setRouteError(error.message);
        setSummary(active.summary);
        setDetail(active.detail);
      });

    return () => {
      cancelled = true;
    };
  }, [destination, mode, origin.latitude, origin.longitude, active.detail, active.note, active.summary]);

  if (!destination) {
    return (
      <View style={styles.screen}>
        <TopBar
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={{ paddingTop: insets.top }}
          title="Directions"
        />
        <View style={styles.notFound}>
          <Icon color={Palette.green} name="map" size={38} />
          <AppText size={15} weight="bold">
            Pick a destination first
          </AppText>
          <AppText color="muted" size={12} style={styles.notFoundText}>
            Search for a place, then open directions to it.
          </AppText>
          <PrimaryButton
            label="Search for a place"
            onPress={() => router.replace('/search')}
            style={styles.notFoundButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <InteractiveMap
        bottomInset={205}
        focus={focusedOnMe ? 'me' : 'gaborone'}
        markers={markers}
        recenterKey={recenterKey}
        route={route ?? undefined}
        styleId="positron"
        userLocation={coords}
      />

      <View style={styles.panel}>
        <TopBar
          action={<BareIconButton accessibilityLabel="More options" icon="more" />}
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={{ paddingTop: insets.top }}
          title="Directions"
        />
        <View style={styles.routeInputs}>
          <View style={styles.routeDots}>
            <View style={styles.dotStart} />
            <View style={styles.dotLine} />
            <View style={styles.dotEnd} />
          </View>
          <View style={styles.routeFields}>
            <View style={styles.routeInput}>
              <AppText size={12}>My location</AppText>
              <Icon color={Palette.muted} name="locate" size={17} />
            </View>
            <View style={styles.routeInput}>
              <AppText numberOfLines={1} size={12}>
                {destination.name}
              </AppText>
              <Icon color={Palette.muted} name="close" size={16} />
            </View>
          </View>
        </View>
        <View style={styles.travelModes}>
          {travelModes.map((travel) => {
            const isActive = travel.key === mode;
            return (
              <Tap
                accessibilityLabel={travel.label}
                key={travel.key}
                onPress={() => setMode(travel.key)}
                style={[styles.modeButton, isActive && styles.modeButtonActive]}>
                <Icon color={isActive ? Palette.blue : '#5E6861'} name={travel.icon} size={18} />
                <AppText
                  size={11}
                  style={{ color: isActive ? Palette.blue : '#5E6861' }}
                  weight={isActive ? 'bold' : 'regular'}>
                  {isActive ? summary : travel.label}
                </AppText>
              </Tap>
            );
          })}
        </View>
      </View>

      <View style={styles.routeTime}>
        <AppText color="white" size={11} weight="bold">
          {summary}
        </AppText>
      </View>

      <RoundButton
        accessibilityLabel="Locate me"
        icon="locate"
        iconColor={Palette.blue}
        onPress={() => {
          setFocusedOnMe(true);
          setRecenterKey((value) => value + 1);
        }}
        style={[styles.routeLocate, { bottom: insets.bottom + 205 }]}
      />

      <View style={[styles.routeSheet, { paddingBottom: insets.bottom + 20 }]}>
        <SheetHandle />
        <View style={styles.routeSummary}>
          <View style={styles.summaryCopy}>
            <AppText size={20} weight="bold">
              {summary}
            </AppText>
            <AppText color="muted" variant="small">
              {routeError ? `Using offline estimate · ${routeError}` : detail}
            </AppText>
          </View>
          <View style={styles.trafficNote}>
            <AppText color="green" size={11}>
              {active.note}
            </AppText>
          </View>
        </View>
        <PrimaryButton
          label="Start navigation"
          onPress={() =>
            router.push({
              pathname: '/navigate',
              params: {
                name: destination.name,
                lat: String(destination.latitude),
                lng: String(destination.longitude),
                area: destination.area,
              },
            })
          }
          style={styles.startButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  routeInputs: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 8,
  },
  routeDots: { width: 20, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dotStart: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: Palette.blue,
    borderRadius: 5,
  },
  dotLine: { width: 2, height: 25, backgroundColor: '#AEB7B0' },
  dotEnd: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: Palette.red,
    borderRadius: 5,
    backgroundColor: Palette.red,
  },
  routeFields: { flex: 1, gap: 5 },
  routeInput: {
    height: 38,
    paddingLeft: 12,
    paddingRight: 5,
    borderRadius: Radius.sm + 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#F3F5F3',
  },
  travelModes: {
    height: 52,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Palette.line,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeButtonActive: { backgroundColor: '#EDF5FF' },
  routeTime: {
    position: 'absolute',
    top: 405,
    left: 180,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 2,
    borderColor: Palette.surface,
    borderRadius: Radius.sm,
    backgroundColor: Palette.blue,
  },
  routeLocate: { position: 'absolute', right: 16 },
  routeSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  routeSummary: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryCopy: { gap: 3 },
  trafficNote: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Palette.greenSoft,
  },
  startButton: { width: '100%' },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 8,
    backgroundColor: Palette.surface,
  },
  notFoundText: { textAlign: 'center' },
  notFoundButton: { marginTop: 10 },
});