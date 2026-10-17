import type { CameraRef, StyleSpecification } from '@maplibre/maplibre-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TurboModuleRegistry, View } from 'react-native';

import { MapAttribution } from './map-attribution';
import { hasMapLibreNativeCode, type TurboModuleLookup } from './map-native-code';
import { MapFailure, MapLoading } from './map-status';
import type { InteractiveMapProps, MapMarker } from './map-types';

import {
  BOTSWANA_BOUNDS,
  FALLBACK_MAP_STYLE,
  GABORONE_VIEW,
  MAP_CAMERA_PADDING,
  MAP_STYLES,
  USER_LOCATION_ZOOM,
} from '@/constants/map';
import { Palette } from '@/constants/theme';
import { distanceMetres } from '@/lib/geo';

type MapStatus = 'loading' | 'ready' | 'error' | 'unavailable';

type MapLibreModule = typeof import('@maplibre/maplibre-react-native');

const SLOW_LOAD_MS = 12000;
const SETUP_GUIDE_URL = 'https://docs.expo.dev/development/build/';

const TONE_HEX: Record<NonNullable<MapMarker['tone']>, string> = {
  green: '#2C6950',
  red: '#E26454',
  blue: '#2779E8',
  amber: '#E69D3B',
};

function isMapLibreNativeCodePresent(): boolean {
  return hasMapLibreNativeCode(TurboModuleRegistry as TurboModuleLookup);
}

export function InteractiveMap({
  styleId,
  focus,
  bottomInset = 0,
  markers = [],
  route,
  onMarkerPress,
  droppedPin,
  onMapPress,
  userLocation = null,
  followUser = false,
  recenterKey = 0,
  style,
}: InteractiveMapProps) {
  const [mapLibre, setMapLibre] = useState<MapLibreModule | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [useFallbackStyle, setUseFallbackStyle] = useState(false);
  const camera = useRef<CameraRef>(null);
  const framedFocus = useRef<InteractiveMapProps['focus']>('gaborone');
  const framedKey = useRef(0);
  const lastFollow = useRef<[number, number] | null>(null);
  const nativeCodePresent = isMapLibreNativeCodePresent();

  useEffect(() => {
    if (!nativeCodePresent) {
      return;
    }

    let cancelled = false;

    const fail = (error?: unknown) => {
      if (cancelled) {
        return;
      }
      console.warn('[myroute] failed to start the MapLibre native module', error);
      setMapLibre(null);
      setSlow(false);
      setStatus(nativeCodePresent ? 'error' : 'unavailable');
    };

    import('@maplibre/maplibre-react-native')
      .then((module) => {
        if (cancelled) {
          return;
        }
        // `Map`, `Camera`, `Marker` and friends are `React.memo`/`forwardRef`
        // components, so `typeof` them is "object", never "function". Only check
        // that the exports exist — checking for a function here failed every time
        // and was mistaken for a style-download error.
        if (module.Map == null || module.Camera == null) {
          fail(new Error('MapLibre native module is missing the Map/Camera exports'));
          return;
        }
        setMapLibre(module);
      })
      .catch(fail);

    return () => {
      cancelled = true;
    };
  }, [attempt, nativeCodePresent]);

  useEffect(() => {
    if (status !== 'loading') {
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [status, attempt]);

  const retry = useCallback(() => {
    setSlow(false);
    setStatus('loading');
    setUseFallbackStyle(false);
    setAttempt((value) => value + 1);
  }, []);

  // ── Framing ───────────────────────────────────────────────────────────────────
  const frame = useCallback(() => {
    const cameraRef = camera.current;
    if (!cameraRef) {
      return;
    }
    if (focus === 'me') {
      cameraRef.easeTo({
        center: userLocation
          ? [userLocation.longitude, userLocation.latitude]
          : GABORONE_VIEW.center,
        zoom: userLocation ? USER_LOCATION_ZOOM : GABORONE_VIEW.zoom,
        padding: MAP_CAMERA_PADDING,
        duration: 900,
        easing: 'fly',
      });
      return;
    }
    if (focus === 'botswana') {
      cameraRef.fitBounds(BOTSWANA_BOUNDS, {
        padding: MAP_CAMERA_PADDING,
        duration: 900,
        easing: 'fly',
      });
      return;
    }
    cameraRef.easeTo({
      center: GABORONE_VIEW.center,
      zoom: GABORONE_VIEW.zoom,
      padding: MAP_CAMERA_PADDING,
      duration: 900,
      easing: 'fly',
    });
  }, [focus, userLocation]);

  useEffect(() => {
    if (status !== 'ready' || !camera.current) {
      return;
    }
    if (focus === 'me' && !userLocation) {
      // Wait for the first GPS fix rather than framing the reference city.
      return;
    }
    if (framedFocus.current === focus && framedKey.current === recenterKey) {
      return;
    }
    framedFocus.current = focus;
    framedKey.current = recenterKey;
    frame();
  }, [focus, frame, recenterKey, status, userLocation]);

  // Navigation: keep the camera on the device once it has actually moved.
  useEffect(() => {
    if (!followUser || !userLocation || status !== 'ready') {
      return;
    }
    const cameraRef = camera.current;
    if (!cameraRef) {
      return;
    }
    const last = lastFollow.current;
    if (
      last &&
      distanceMetres({ latitude: last[1], longitude: last[0] }, userLocation) < 20
    ) {
      return;
    }
    lastFollow.current = [userLocation.longitude, userLocation.latitude];
    cameraRef.easeTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: USER_LOCATION_ZOOM,
      padding: MAP_CAMERA_PADDING,
      duration: 700,
      easing: 'fly',
    });
  }, [followUser, status, userLocation]);


  // The streamed vector style, with the inline OSM raster style as the last resort.
  const fallbackStyle = MAP_STYLES[FALLBACK_MAP_STYLE].inline as unknown as StyleSpecification;
  const mapStyle = useFallbackStyle ? fallbackStyle : (MAP_STYLES[styleId].url ?? fallbackStyle);

  if (mapLibre == null) {
    return (
      <View style={[styles.container, style]}>
        {status === 'error' ? (
          <MapFailure kind="style" onRetry={retry} />
        ) : !nativeCodePresent || status === 'unavailable' ? (
          <MapFailure
            kind="unavailable"
            onHelp={() => {
              void WebBrowser.openBrowserAsync(SETUP_GUIDE_URL);
            }}
            onRetry={retry}
          />
        ) : (
          <MapLoading onRetry={retry} slow={slow} />
        )}
      </View>
    );
  }

  const { Camera, GeoJSONSource, Layer, Map, Marker } = mapLibre;

  const routeShape = route
    ? {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: route.coordinates,
        },
      }
    : null;

  return (
    <View style={[styles.container, style]}>
      <Map
        androidView={Platform.OS === 'android' ? 'texture' : undefined}
        attribution={false}
        compass={false}
        key={`map-${attempt}`}
        logo={false}
        mapStyle={mapStyle}
        onDidFailLoadingMap={() => {
          if (!useFallbackStyle) {
            // The streamed vector style is unreachable — drop to the inline raster
            // style rather than leaving the user with a dead map.
            console.warn(
              '[myroute] vector map style failed to load; falling back to the OSM raster style',
            );
            setUseFallbackStyle(true);
            return;
          }
          console.warn('[myroute] map style failed to load, including the OSM raster fallback');
          setSlow(false);
          setStatus('error');
        }}
        onDidFinishLoadingMap={() => {
          setSlow(false);
          setStatus('ready');
        }}
        onWillStartLoadingMap={() =>
          setStatus((current) => (current === 'ready' ? current : 'loading'))
        }
        onPress={
          onMapPress
            ? (event) => {
                // v11 delivers the payload as a NativeSyntheticEvent (`event.nativeEvent`).
                const lngLat = event.nativeEvent?.lngLat;
                if (lngLat) {
                  onMapPress({ longitude: lngLat[0], latitude: lngLat[1] });
                }
              }
            : undefined
        }
        scaleBar={false}
        style={styles.map}>
        <Camera
          initialViewState={{ center: GABORONE_VIEW.center, zoom: GABORONE_VIEW.zoom }}
          ref={camera}
        />

        {routeShape ? (
          <GeoJSONSource data={routeShape} id="myroute-route">
            <Layer
              id="myroute-route-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': route?.color ?? '#2779E8',
                'line-width': 5,
                'line-opacity': 0.9,
              }}
              type="line"
            />
          </GeoJSONSource>
        ) : null}

        {markers.map((marker) => (
          <Marker
            anchor="bottom"
            id={marker.id}
            key={marker.id}
            lngLat={[marker.longitude, marker.latitude]}
            onPress={() => onMarkerPress?.(marker)}>
            <View
              style={[
                styles.pin,
                { backgroundColor: TONE_HEX[marker.tone ?? 'green'] },
              ]}
            />
          </Marker>
        ))}

        {droppedPin ? (
          <Marker
            anchor="bottom"
            id="dropped-pin"
            lngLat={[droppedPin.longitude, droppedPin.latitude]}>
            <View
              style={[styles.pin, { backgroundColor: TONE_HEX.red }]}
            />
          </Marker>
        ) : null}

        {/* The device position, drawn as a target dot rather than a pin. */}
        {userLocation ? (
          <Marker
            anchor="center"
            id="user-location"
            lngLat={[userLocation.longitude, userLocation.latitude]}>
            <View style={styles.userDot}>
              <View style={styles.userDotCore} />
            </View>
          </Marker>
        ) : null}
      </Map>

      {status === 'loading' ? <MapLoading onRetry={retry} slow={slow} /> : null}
      {status === 'error' ? <MapFailure kind="style" onRetry={retry} /> : null}

      <MapAttribution styleId={styleId} style={[styles.attribution, { bottom: bottomInset + 10 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
  },
  map: { flex: 1 },
  attribution: { position: 'absolute', left: 14 },
  pin: {
    width: 30,
    height: 30,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 15,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '-45deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  userDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(39, 121, 232, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(39, 121, 232, 0.35)',
  },
  userDotCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#2779E8',
  },
});