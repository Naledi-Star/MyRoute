import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import 'maplibre-gl/dist/maplibre-gl.css';

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

const SLOW_LOAD_MS = 12000;

/**
 * Web implementation of the map screen.
 *
 * `@maplibre/maplibre-react-native` is native-only, so the browser renders the
 * same provider style and camera with MapLibre GL JS instead — same style URLs,
 * same Botswana framing, same attribution. The library is imported inside an
 * effect because the web build pre-renders every route in Node, where there is no
 * DOM to mount a map in.
 */
export function InteractiveMap({ styleId, focus, bottomInset = 0, style }: InteractiveMapProps) {
  const container = useRef<View>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const styleIdRef = useRef(styleId);
  const appliedStyle = useRef<string | null>(null);
  const framedFocus = useRef<InteractiveMapProps['focus']>('gaborone');

  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);

  useEffect(() => {
    let disposed = false;
    let instance: MapLibreMap | null = null;

    appliedStyle.current = null;

    import('maplibre-gl')
      .then(({ Map: MapLibre, setWorkerUrl }) => {
        const element = container.current as unknown as HTMLElement | null;
        if (disposed || element == null) {
          return;
        }
        // MapLibre normally resolves its worker through `import.meta.url`, which
        // Metro does not provide. `public/maplibre-gl-worker.mjs` (kept in sync by
        // `npm run map:worker`) is copied into the web build root instead.
        setWorkerUrl(new URL('maplibre-gl-worker.mjs', document.baseURI).href);
        instance = new MapLibre({
          container: element,
          style: MAP_STYLES[styleIdRef.current].url,
          center: GABORONE_VIEW.center,
          zoom: GABORONE_VIEW.zoom,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
        });
        appliedStyle.current = MAP_STYLES[styleIdRef.current].url;

        instance.on('load', () => {
          if (!disposed) {
            setSlow(false);
            setStatus('ready');
          }
        });
        instance.on('error', () => {
          // Only surface failures that stop the first paint; missing glyphs or a
          // single unreachable tile should not blank the screen.
          if (!disposed && !instance?.loaded()) {
            setSlow(false);
            setStatus('error');
          }
        });

        setMap(instance);
      })
      .catch(() => {
        if (!disposed) {
          setSlow(false);
          setStatus('unavailable');
        }
      });

    return () => {
      disposed = true;
      setMap(null);
      instance?.remove();
    };
  }, [attempt]);

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

  useEffect(() => {
    const url = MAP_STYLES[styleId].url;
    if (map == null || appliedStyle.current === url) {
      return;
    }
    appliedStyle.current = url;
    map.setStyle(url);
  }, [map, styleId]);

  useEffect(() => {
    if (map == null || framedFocus.current === focus) {
      return;
    }
    framedFocus.current = focus;
    if (focus === 'botswana') {
      map.fitBounds(BOTSWANA_BOUNDS, { padding: MAP_CAMERA_PADDING, duration: 900 });
    } else {
      map.flyTo({
        center: GABORONE_VIEW.center,
        zoom: GABORONE_VIEW.zoom,
        padding: MAP_CAMERA_PADDING,
        duration: 900,
      });
    }
  }, [focus, map]);

  return (
    <View style={[styles.container, style]}>
      <View ref={container} style={styles.map} testID="map-container" />

      {status === 'loading' ? <MapLoading onRetry={retry} slow={slow} /> : null}
      {/* The browser implementation is pure JavaScript, so a failure here is
          always a loading problem: either the map bundle or the style did not
          arrive. */}
      {status === 'error' || status === 'unavailable' ? (
        <MapFailure kind="style" onRetry={retry} />
      ) : null}

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
