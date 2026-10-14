import type { CameraRef } from '@maplibre/maplibre-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TurboModuleRegistry, View } from 'react-native';

import { hasMapLibreNativeCode, type TurboModuleLookup } from './map-native-code';
import { MapAttribution } from './map-attribution';
import { MapFailure, MapLoading } from './map-status';
import type { InteractiveMapProps } from './map-types';

import {
  BOTSWANA_BOUNDS,
  GABORONE_VIEW,
  MAP_CAMERA_PADDING,
  MAP_STYLES,
} from '@/constants/map';
import { Palette } from '@/constants/theme';

type MapStatus = 'loading' | 'ready' | 'error' | 'unavailable';

type MapLibreModule = typeof import('@maplibre/maplibre-react-native');

const SLOW_LOAD_MS = 12000;
const SETUP_GUIDE_URL = 'https://docs.expo.dev/development/build/';

/**
 * Whether this binary was compiled with MapLibre's native modules. A missing module
 * means the running development build predates the dependency, which is a different
 * problem from a style that could not be downloaded.
 */
function isMapLibreNativeCodePresent(): boolean {
  return hasMapLibreNativeCode(TurboModuleRegistry as TurboModuleLookup);
}

/**
 * Real map rendering for Android and iOS, backed by MapLibre Native via
 * `@maplibre/maplibre-react-native` (v11 — the first release that only supports
 * the new architecture, which is what SDK 57 uses).
 *
 * The native modules are probed before the library is imported: in Expo Go, or in a
 * development client built before this dependency existed, the import makes Metro log
 * an invariant violation from inside its own module loader. Skipping the import keeps
 * that noise down and lets the screen explain what is wrong instead.
 */
export function InteractiveMap({ styleId, focus, bottomInset = 0, style }: InteractiveMapProps) {
  const [mapLibre, setMapLibre] = useState<MapLibreModule | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const camera = useRef<CameraRef>(null);
  const framedFocus = useRef<InteractiveMapProps['focus']>('gaborone');
  const nativeCodePresent = isMapLibreNativeCodePresent();

  useEffect(() => {
    if (!nativeCodePresent) {
      return;
    }

    let cancelled = false;

    const fail = () => {
      if (cancelled) {
        return;
      }
      setMapLibre(null);
      setSlow(false);
      setStatus(nativeCodePresent ? 'error' : 'unavailable');
    };

    import('@maplibre/maplibre-react-native')
      .then((module) => {
        if (cancelled) {
          return;
        }
        // A missing native module makes this import resolve with a half-populated
        // namespace rather than rejecting, so check the exports before handing them
        // to <Map /> — rendering an undefined component is what took the screen down.
        if (typeof module.Map !== 'function' || typeof module.Camera !== 'function') {
          fail();
          return;
        }
        setMapLibre(module);
      })
      .catch(fail);

    return () => {
      cancelled = true;
    };
  }, [attempt, nativeCodePresent]);

  // Nudge the user when the style takes unusually long (slow network, offline).
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
    setAttempt((value) => value + 1);
  }, []);

  // Frame the requested region whenever it changes (city view vs. whole country).
  useEffect(() => {
    if (status !== 'ready' || framedFocus.current === focus) {
      return;
    }
    const cameraRef = camera.current;
    if (!cameraRef) {
      return;
    }
    framedFocus.current = focus;
    if (focus === 'botswana') {
      cameraRef.fitBounds(BOTSWANA_BOUNDS, {
        padding: MAP_CAMERA_PADDING,
        duration: 900,
        easing: 'fly',
      });
    } else {
      cameraRef.easeTo({
        center: GABORONE_VIEW.center,
        zoom: GABORONE_VIEW.zoom,
        padding: MAP_CAMERA_PADDING,
        duration: 900,
        easing: 'fly',
      });
    }
  }, [focus, status]);

  const mapStyleUrl = MAP_STYLES[styleId].url;

  if (mapLibre == null) {
    return (
      <View style={[styles.container, style]}>
        {status === 'error' ? (
          // The import itself failed while the native code is there, so blaming the
          // network is the honest explanation and retry is the honest action.
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

  const { Camera, Map } = mapLibre;

  return (
    <View style={[styles.container, style]}>
      <Map
        // Keep the overlays (header, controls, sheet) above the map: a
        // GLSurfaceView draws in its own surface and can ignore view order.
        androidView={Platform.OS === 'android' ? 'texture' : undefined}
        // myroute renders its own attribution so the credit is always visible,
        // including the OpenFreeMap/OpenMapTiles credits the style itself omits.
        attribution={false}
        compass={false}
        key={`map-${attempt}`}
        logo={false}
        mapStyle={mapStyleUrl}
        onDidFailLoadingMap={() => {
          setSlow(false);
          setStatus('error');
        }}
        onDidFinishLoadingMap={() => {
          setSlow(false);
          setStatus('ready');
        }}
        onWillStartLoadingMap={() => setStatus((current) => (current === 'ready' ? current : 'loading'))}
        scaleBar={false}
        style={styles.map}>
        <Camera
          initialViewState={{ center: GABORONE_VIEW.center, zoom: GABORONE_VIEW.zoom }}
          ref={camera}
        />
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
});
