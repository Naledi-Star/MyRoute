import type { StyleProp, ViewStyle } from 'react-native';

import type { MapStyleId } from '@/constants/map';

/** Region the camera frames: the Gaborone reference view or the whole country. */
export type MapFocus = 'gaborone' | 'botswana';

/**
 * Props shared by the native (`interactive-map.native.tsx`) and web
 * (`interactive-map.web.tsx`) implementations of the map.
 */
export type InteractiveMapProps = {
  /** Provider style to render, see `src/constants/map.ts`. */
  styleId: MapStyleId;
  /** Region the camera should frame. */
  focus: MapFocus;
  /**
   * Height of the UI that overlaps the bottom of the map (the Explore sheet), so
   * the attribution stays visible above it.
   */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Why the map could not render. */
export type MapFailureKind = 'unavailable' | 'style';
