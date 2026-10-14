/**
 * Interactive map configuration.
 *
 * MapLibre renders the map, but it does not ship any map data: tiles and the GL
 * style come from a separate provider. myroute uses the OpenFreeMap public
 * instance, which serves vector tiles built from OpenStreetMap data without an
 * API key. Everything a provider swap touches lives in this file.
 *
 * Provider rules to keep in mind (https://openfreemap.org):
 * - Attribution is mandatory, see `MAP_PROVIDER`.
 * - The public instance is donated infrastructure: no bulk tile downloads and no
 *   offline downloads. Self-hosting is the escape hatch for both.
 * - OpenStreetMap's own tile server (tile.openstreetmap.org) is deliberately not
 *   used: its tile usage policy forbids app traffic.
 */

export type MapStyleId = 'positron' | 'liberty' | 'bright';

export type MapStyleOption = {
  id: MapStyleId;
  /** Shown next to the attribution credit. */
  label: string;
  /** MapLibre GL style document. */
  url: string;
};

export type MapProvider = {
  id: string;
  label: string;
  /** Single-line credit that is always visible on the map. */
  credit: string;
  /** Full attribution, revealed when the credit is expanded. */
  attribution: { label: string; value: string }[];
  docsUrl: string;
  /** Short reminder of what the provider allows. */
  usage: string;
};

export const MAP_PROVIDER: MapProvider = {
  id: 'openfreemap',
  label: 'OpenFreeMap',
  credit: '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap',
  attribution: [
    {
      label: 'Tiles & style',
      value: '© OpenFreeMap (openfreemap.org), an open-source, self-hostable tile host',
    },
    {
      label: 'Tile schema',
      value: '© OpenMapTiles (openmaptiles.org)',
    },
    {
      label: 'Map data',
      value: '© OpenStreetMap contributors (openstreetmap.org)',
    },
  ],
  docsUrl: 'https://openfreemap.org',
  usage: 'Public instance: free, no API key, no bulk or offline tile downloads.',
};

/**
 * Styles available from the provider. The map screen lets the user cycle through
 * them; `DEFAULT_MAP_STYLE` is the restrained, navigation-friendly one.
 */
export const MAP_STYLES: Record<MapStyleId, MapStyleOption> = {
  positron: {
    id: 'positron',
    label: 'Positron',
    url: 'https://tiles.openfreemap.org/styles/positron',
  },
  liberty: {
    id: 'liberty',
    label: 'Liberty',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  bright: {
    id: 'bright',
    label: 'Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
  },
};

export const MAP_STYLE_ORDER: MapStyleId[] = ['positron', 'liberty', 'bright'];

export const DEFAULT_MAP_STYLE: MapStyleId = 'positron';

/** Gaborone CBD, used as the app's reference point until GPS is added. */
export const GABORONE_VIEW = {
  center: [25.9087, -24.6541] as [number, number],
  zoom: 11.4,
};

/** [west, south, east, north] — mainland Botswana, used for the country view. */
export const BOTSWANA_BOUNDS: [number, number, number, number] = [19.99, -26.91, 29.37, -17.78];

export const BOTSWANA_VIEW = {
  center: [24.68, -22.35] as [number, number],
  zoom: 5.4,
};

/** Keeps the camera clear of the floating header / bottom sheet. */
export const MAP_CAMERA_PADDING = { top: 200, bottom: 300, left: 32, right: 32 };
