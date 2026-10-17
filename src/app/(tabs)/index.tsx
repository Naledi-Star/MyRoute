import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapFocus, MapMarker } from '@/components/myroute/map-types';
import { AppText } from '@/components/myroute/text';
import {
  RoundButton,
  SectionHeading,
  SheetHandle,
  Tap,
  TextButton,
} from '@/components/myroute/ui';
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLE_ORDER,
  MAP_STYLES,
  type MapStyleId,
} from '@/constants/map';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { fetchCommunityPlaces, type CommunityPlace } from '@/lib/api';
import { useDeviceLocation } from '@/lib/location';

const STYLE_STORAGE_KEY = 'myroute:mapStyle';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sheetHeight, setSheetHeight] = useState(281);
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(DEFAULT_MAP_STYLE);
  const [mapFocus, setMapFocus] = useState<MapFocus>('gaborone');
  const [recenterKey, setRecenterKey] = useState(0);
  const autoLocated = useRef(false);

  // The map follows the device: the first GPS fix takes the camera from the
  // reference city view to wherever the user actually is.
  const { coords, permission, error, start } = useDeviceLocation({ auto: true });
  useEffect(() => {
    if (coords && !autoLocated.current && mapFocus === 'gaborone') {
      autoLocated.current = true;
      setMapFocus('me');
    }
  }, [coords, mapFocus]);

  const recentre = useCallback(() => {
    setMapFocus('me');
    setRecenterKey((value) => value + 1);
    if (!coords) {
      // Nothing to centre on yet — ask for (or retry) the location it needs.
      void start();
    }
  }, [coords, start]);

  // Remember the user's chosen style across sessions.
  useEffect(() => {
    AsyncStorage.getItem(STYLE_STORAGE_KEY)
      .then((value) => {
        if (value && MAP_STYLE_ORDER.includes(value as MapStyleId)) {
          setMapStyleId(value as MapStyleId);
        }
      })
      .catch(() => {
        // Storage is best-effort.
      });
  }, []);

  const measureSheet = (event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height);
  };

  const cycleMapStyle = useCallback(() => {
    const index = MAP_STYLE_ORDER.indexOf(mapStyleId);
    const next = MAP_STYLE_ORDER[(index + 1) % MAP_STYLE_ORDER.length];
    setMapStyleId(next);
    AsyncStorage.setItem(STYLE_STORAGE_KEY, next).catch(() => {});
  }, [mapStyleId]);

  const showCountry = mapFocus === 'botswana';

  // Pins come from approved community places — the same database every device
  // writes to, so a place added here (or anywhere) shows up for everybody.
  const [communityPlaces, setCommunityPlaces] = useState<CommunityPlace[]>([]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchCommunityPlaces().then((places) => {
        if (!cancelled) {
          setCommunityPlaces(places);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const markers = useMemo<MapMarker[]>(
    () =>
      communityPlaces.map((place) => ({
        id: `place-${place.id}`,
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.name,
        tone: 'green' as const,
        kind: 'place' as const,
      })),
    [communityPlaces],
  );

  return (
    <View style={styles.screen}>
      <InteractiveMap
        bottomInset={sheetHeight}
        focus={mapFocus}
        markers={markers}
        onMarkerPress={(marker) =>
          router.push({
            pathname: '/place',
            params: {
              name: marker.label,
              lat: String(marker.latitude),
              lng: String(marker.longitude),
            },
          })
        }
        recenterKey={recenterKey}
        styleId={mapStyleId}
        userLocation={coords}
      />

      <View
        pointerEvents="box-none"
        style={[styles.floatingHeader, { paddingTop: insets.top + 14 }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandGroup}>
            <Image
              accessibilityLabel="myroute logo"
              contentFit="contain"
              source={require('@/assets/images/logo.png')}
              style={styles.brandLogo}
            />
            <AppText variant="brand">
              my
              <AppText color="green" variant="brand">
                route
              </AppText>
            </AppText>
          </View>
          <View>
            <RoundButton
              accessibilityLabel="Community notifications"
              icon="bell"
              onPress={() => router.navigate('/requests')}
            />
            <View style={styles.notificationDot} />
          </View>
        </View>

        <Tap
          accessibilityLabel="Search for a place"
          onPress={() => router.push('/search')}
          style={styles.searchTrigger}>
          <Icon color={Palette.muted} name="search" size={20} />
          <AppText color="muted" size={14}>
            Where would you like to go?
          </AppText>
        </Tap>

        {permission === 'denied' || error ? (
          <Tap
            accessibilityLabel="Turn on location"
            onPress={() => {
              void start();
            }}
            style={styles.locationNotice}>
            <Icon color={Palette.red} name="locate" size={14} />
            <AppText color="muted" size={11} style={styles.locationNoticeText}>
              {error ?? 'Location permission is needed to show exactly where you are.'}
            </AppText>
            <AppText color="green" size={11} weight="bold">
              Enable
            </AppText>
          </Tap>
        ) : null}
      </View>

      <View pointerEvents="box-none" style={[styles.mapActions, { bottom: sheetHeight + 12 }]}>
        <RoundButton
          accessibilityLabel="Draw a path on the map"
          icon="plus"
          iconColor={Palette.green}
          onPress={() => router.push('/draw-path')}
        />
        <RoundButton
          accessibilityLabel={`Map style: ${MAP_STYLES[mapStyleId].label}. Switch map style`}
          icon="layers"
          onPress={cycleMapStyle}
        />
        <RoundButton
          accessibilityLabel={
            showCountry ? 'Zoom back to Gaborone' : 'Show the whole of Botswana'
          }
          icon="map"
          onPress={() => setMapFocus(showCountry ? 'gaborone' : 'botswana')}
        />
        <RoundButton
          accessibilityLabel="Recentre the map on my location"
          icon="locate"
          iconColor={Palette.blue}
          onPress={recentre}
        />
      </View>

      <View onLayout={measureSheet} style={styles.sheet}>
        <SheetHandle />
        <SectionHeading
          action={<TextButton label="See all" onPress={() => router.push('/search')} />}
          eyebrow="Near you"
          title="Explore Botswana"
        />
        {markers.length === 0 ? (
          <View style={styles.empty}>
            <Icon color={Palette.green} name="map" size={24} />
            <AppText color="muted" size={11} style={styles.emptyText}>
              No community places yet. Add the first one and it will show up here once approved.
            </AppText>
          </View>
        ) : (
          <AppText color="muted" size={11} style={styles.emptyText}>
            {markers.length} approved community place{markers.length === 1 ? '' : 's'} on the map.
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // The logo is a square, full-bleed image: keep the box square so the artwork
  // fills it and the wordmark sits directly beside it (a wide box letterboxes
  // the square and leaves a gap that pushes the text away from the mark).
  brandLogo: { width: 40, height: 40 },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: Palette.surface,
    borderRadius: 4,
    backgroundColor: '#F05A45',
  },
  searchTrigger: {
    height: 52,
    marginTop: 17,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(207,216,209,0.9)',
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  locationNotice: {
    marginTop: 2,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,76,61,0.25)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...Shadows.subtle,
  },
  locationNoticeText: { flex: 1, lineHeight: 14 },
  mapActions: { position: 'absolute', right: 15, gap: 10 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  empty: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CAD5CC',
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FAFCF9',
  },
  emptyText: { flex: 1, lineHeight: 15 },
});