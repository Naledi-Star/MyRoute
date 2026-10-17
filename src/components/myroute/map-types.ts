import type { StyleProp, ViewStyle } from 'react-native';

import type { MapStyleId } from '@/constants/map';
import type { CommunityRequest } from '@/data/myroute';

/**
 * Region the camera frames: the Gaborone reference view, the whole country, or
 * — once a GPS fix is available — the device's own position.
 */
export type MapFocus = 'gaborone' | 'botswana' | 'me';

/** A WGS84 position, as reported by `useDeviceLocation`. */
export type UserLocation = { latitude: number; longitude: number };

/** A coordinate the map should highlight. */
export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  tone?: 'green' | 'red' | 'blue' | 'amber';
  kind?: 'place' | 'request' | 'destination';
};

/** A route to draw on the map, already in GeoJSON coordinates. */
export type MapRoute = {
  coordinates: [number, number][];
  color?: string;
};

/**
 * Props shared by the native (`interactive-map.tsx`) and web
 * (`interactive-map.web.tsx`) implementations of the map.
 */
export type InteractiveMapProps = {
  /** Provider style to render, see `src/constants/map.ts`. */
  styleId: MapStyleId;
  /** Region the camera should frame. */
  focus: MapFocus;
  /**
   * Height of the UI that overlaps the bottom of the map (the Explore sheet),
   * so the attribution stays visible above it.
   */
  bottomInset?: number;
  /** Pins to render on top of the map. */
  markers?: MapMarker[];
  /** Optional route line to draw. */
  route?: MapRoute;
  /** Called when a marker is tapped. */
  onMarkerPress?: (marker: MapMarker) => void;
  /** When set, the map drops a pin at this coordinate (form mode). */
  droppedPin?: { latitude: number; longitude: number } | null;
  /** Called when the user taps the map (form mode). */
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  /**
   * The device position, when known. The map draws it as a blue "you" dot, and
   * `focus="me"` frames the camera on it as soon as the first fix arrives.
   */
  userLocation?: UserLocation | null;
  /** Keep the camera locked on the device as it moves (turn-by-turn navigation). */
  followUser?: boolean;
  /** Bump to re-frame the current focus — backs the "Locate me" buttons. */
  recenterKey?: number;
  style?: StyleProp<ViewStyle>;
};

/** Why the map could not render. */
export type MapFailureKind = 'unavailable' | 'style';

/** Helper: turn a community request into a marker. */
export function requestToMarker(request: CommunityRequest): MapMarker {
  return {
    id: `request-${request.name}`,
    latitude: request.latitude,
    longitude: request.longitude,
    label: request.name,
    tone: request.urgent ? 'red' : request.tone === 'blue' ? 'blue' : 'green',
    kind: 'request',
  };
}