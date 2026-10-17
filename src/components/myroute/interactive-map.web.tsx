import type {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  StyleSpecification,
} from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import 'maplibre-gl/dist/maplibre-gl.css';

import { MapAttribution } from './map-attribution';
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

const SLOW_LOAD_MS = 12000;

const TONE_HEX: Record<NonNullable<MapMarker['tone']>, string> = {
  green: '#2C6950',
  red: '#E26454',
  blue: '#2779E8',
  amber: '#E69D3B',
};

/**
 * Build the DOM element for a single marker. Kept simple: a teardrop pin drawn
 * with CSS, with a small label underneath.
 */
function createMarkerElement(marker: MapMarker, onClick?: (m: MapMarker) => void): HTMLElement {
  const color = TONE_HEX[marker.tone ?? 'green'];
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';

  const pin = document.createElement('div');
  pin.style.cssText = `
    width:32px;height:32px;
    background:${color};
    border:3px solid white;
    border-radius:50% 50% 50% 4px;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(0,0,0,0.28);
  `;
  wrapper.appendChild(pin);

  const label = document.createElement('div');
  label.textContent = marker.label;
  label.style.cssText = `
    margin-top:4px;
    padding:2px 6px;
    font-size:10px;
    font-weight:600;
    color:#1A221D;
    background:rgba(255,255,255,0.92);
    border-radius:6px;
    white-space:nowrap;
    box-shadow:0 1px 3px rgba(0,0,0,0.15);
  `;
  wrapper.appendChild(label);

  wrapper.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick?.(marker);
  });

  return wrapper;
}

/** The device position: a blue target dot with a soft accuracy halo. */
function createUserElement(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(39,121,232,0.20);border:1px solid rgba(39,121,232,0.35);';
  const core = document.createElement('div');
  core.style.cssText =
    'width:12px;height:12px;border-radius:50%;background:#2779E8;border:2px solid #FFFFFF;box-sizing:border-box;';
  wrapper.appendChild(core);
  return wrapper;
}

/**
 * Web implementation of the map screen.
 *
 * `@maplibre/maplibre-react-native` is native-only, so the browser renders the
 * same provider style and camera with MapLibre GL JS instead — same style URLs,
 * same Botswana framing, same attribution. The library is imported inside an
 * effect because the web build pre-renders every route in Node, where there is no
 * DOM to mount a map in.
 */
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
  const container = useRef<View>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const styleIdRef = useRef(styleId);
  const appliedStyle = useRef<string | null>(null);
  const framedFocus = useRef<InteractiveMapProps['focus']>('gaborone');
  const framedKey = useRef(0);
  const lastFollow = useRef<[number, number] | null>(null);
  const activeMarkers = useRef<MapLibreMarker[]>([]);
  const maplibreModule = useRef<typeof import('maplibre-gl') | null>(null);

  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);

  // ── Boot the map ───────────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    let instance: MapLibreMap | null = null;

    appliedStyle.current = null;

    import('maplibre-gl')
      .then((mod) => {
        const { Map: MapLibre, setWorkerUrl } = mod;
        const element = container.current as unknown as HTMLElement | null;
        if (disposed || element == null) {
          return;
        }
        maplibreModule.current = mod;
        setWorkerUrl(new URL('maplibre-gl-worker.mjs', document.baseURI).href);

        const initialStyleUrl = MAP_STYLES[styleIdRef.current].url;
        instance = new MapLibre({
          container: element,
          style:
            initialStyleUrl ??
            (MAP_STYLES[FALLBACK_MAP_STYLE].inline as unknown as StyleSpecification),
          center: GABORONE_VIEW.center,
          zoom: GABORONE_VIEW.zoom,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
        });
        appliedStyle.current = initialStyleUrl;

        instance.on('load', () => {
          if (!disposed) {
            setSlow(false);
            setStatus('ready');
          }
        });
        instance.on('error', () => {
          if (!disposed && !instance?.loaded()) {
            setSlow(false);
            setStatus('error');
          }
        });
        instance.on('click', (event) => {
          onMapPress?.({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          });
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
      activeMarkers.current.forEach((m) => m.remove());
      activeMarkers.current = [];
      setMap(null);
      instance?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // ── Slow-load timer ────────────────────────────────────────────────────────
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

  // ── Style switching with automatic fallback ────────────────────────────────
  useEffect(() => {
    const option = MAP_STYLES[styleId];
    if (map == null) {
      return;
    }
    const target = option.url ?? null;
    if (target !== null && appliedStyle.current === target) {
      return;
    }
    appliedStyle.current = target;

    if (option.inline) {
      map.setStyle(option.inline as unknown as StyleSpecification);
      return;
    }
    if (target) {
      try {
        map.setStyle(target);
      } catch {
        // Fall back to the OSM raster style if the vector URL is rejected.
        appliedStyle.current = null;
        map.setStyle(MAP_STYLES[FALLBACK_MAP_STYLE].inline as unknown as StyleSpecification);
      }
    }
  }, [map, styleId]);

  // ── Framing ────────────────────────────────────────────────────────────────
  const frame = useCallback(() => {
    if (map == null) {
      return;
    }
    if (focus === 'me') {
      map.flyTo({
        center: userLocation
          ? [userLocation.longitude, userLocation.latitude]
          : GABORONE_VIEW.center,
        zoom: userLocation ? USER_LOCATION_ZOOM : GABORONE_VIEW.zoom,
        padding: MAP_CAMERA_PADDING,
        duration: 900,
      });
      return;
    }
    if (focus === 'botswana') {
      map.fitBounds(BOTSWANA_BOUNDS, { padding: MAP_CAMERA_PADDING, duration: 900 });
      return;
    }
    map.flyTo({
      center: GABORONE_VIEW.center,
      zoom: GABORONE_VIEW.zoom,
      padding: MAP_CAMERA_PADDING,
      duration: 900,
    });
  }, [focus, map, userLocation]);

  useEffect(() => {
    if (map == null) {
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
  }, [focus, frame, map, recenterKey, userLocation]);

  // Navigation: keep the camera on the device once it has actually moved.
  useEffect(() => {
    if (map == null || !followUser || !userLocation) {
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
    map.flyTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: USER_LOCATION_ZOOM,
      padding: MAP_CAMERA_PADDING,
      duration: 700,
    });
  }, [followUser, map, userLocation]);

  // ── Markers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map == null || maplibreModule.current == null) {
      return;
    }
    activeMarkers.current.forEach((m) => m.remove());
    activeMarkers.current = [];

    const { Marker } = maplibreModule.current;
    markers.forEach((marker) => {
      const element = createMarkerElement(marker, onMarkerPress);
      const instance = new Marker({ element, anchor: 'bottom' })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map);
      activeMarkers.current.push(instance);
    });

    if (droppedPin) {
      const element = createMarkerElement(
        {
          id: 'dropped-pin',
          latitude: droppedPin.latitude,
          longitude: droppedPin.longitude,
          label: 'Drop pin',
          tone: 'red',
        },
      );
      const instance = new Marker({ element, anchor: 'bottom' })
        .setLngLat([droppedPin.longitude, droppedPin.latitude])
        .addTo(map);
      activeMarkers.current.push(instance);
    }

    if (userLocation) {
      const instance = new Marker({ element: createUserElement(), anchor: 'center' })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
      activeMarkers.current.push(instance);
    }
  }, [map, markers, droppedPin, userLocation, onMarkerPress]);

  // ── Route line ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map == null || route == null || route.coordinates.length < 2) {
      return;
    }
    const sourceId = 'myroute-line';
    const layerId = 'myroute-line-layer';

    const apply = () => {
      const existing = map.getSource(sourceId);
      if (existing) {
        (existing as unknown as { setData: (data: unknown) => void }).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: route.coordinates },
        });
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route.coordinates },
          },
        });
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': route.color ?? '#2779E8',
            'line-width': 5,
            'line-opacity': 0.9,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('style.load', apply);
    }
  }, [map, route]);

  return (
    <View style={[styles.container, style]}>
      <View ref={container} style={styles.map} testID="map-container" />

      {status === 'loading' ? <MapLoading onRetry={retry} slow={slow} /> : null}
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