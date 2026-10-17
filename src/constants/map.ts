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
 * - The public instance is donated infrastructure but has no hard view/request cap.
 *   Offline downloads are allowed up to 3,000 tiles or 50 MB per download, with at
 *   most 4 parallel requests and a unique User-Agent; larger packs need self-hosting.
 * - OpenStreetMap's own tile server (tile.openstreetmap.org) is deliberately used
 *   only as an emergency fallback: its tile usage policy forbids heavy app traffic.
 */

export type MapStyleId = 'positron' | 'liberty' | 'bright' | 'osm-raster';

export type MapStyleOption = {
  id: MapStyleId;
  /** Shown next to the attribution credit. */
  label: string;
  /** MapLibre GL style document URL, or `null` when the style is inline. */
  url: string | null;
  /** Inline style document, used for the OSM raster fallback. */
  inline?: MapLibreStyle;
};

/** Minimal shape of a MapLibre style document (only what we construct). */
export type MapLibreStyle = {
  version: 8;
  sources: Record<string, unknown>;
  layers: unknown[];
  glyphs?: string;
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

export const OSM_RASTER_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Emergency fallback: a plain OSM raster tile style. Used when the vector
 * provider is unreachable (offline, blocked, or rate-limited). The raster style
 * is deliberately minimal — one source, one layer — so it loads fast even on a
 * poor connection.
 */
export const OSM_RASTER_STYLE: MapLibreStyle = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: OSM_RASTER_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'osm-raster',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
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
  'osm-raster': {
    id: 'osm-raster',
    label: 'OSM (fallback)',
    url: null,
    inline: OSM_RASTER_STYLE,
  },
};

export const MAP_STYLE_ORDER: MapStyleId[] = ['positron', 'liberty', 'bright'];

export const DEFAULT_MAP_STYLE: MapStyleId = 'positron';
export const FALLBACK_MAP_STYLE: MapStyleId = 'osm-raster';

/** Gaborone CBD, used as the app's reference point until GPS is added. */
export const GABORONE_VIEW = {
  center: [25.9087, -24.6541] as [number, number],
  zoom: 11.4,
};

/** Zoom used when the camera frames the device's own position instead of the city view. */
export const USER_LOCATION_ZOOM = 16;

/** [west, south, east, north] — mainland Botswana, used for the country view. */
export const BOTSWANA_BOUNDS: [number, number, number, number] = [19.99, -26.91, 29.37, -17.78];

export const BOTSWANA_VIEW = {
  center: [24.68, -22.35] as [number, number],
  zoom: 5.4,
};

/** Keeps the camera clear of the floating header / bottom sheet. */
export const MAP_CAMERA_PADDING = { top: 200, bottom: 300, left: 32, right: 32 };

/** Bounding box used by the search request so results stay inside Botswana. */
export const BOTSWANA_SEARCH_BOUNDS = {
  viewbox: '19.99,-26.91,29.37,-17.78',
  bounded: '1',
};