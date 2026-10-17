import type { OfflinePack, OfflinePackStatus } from '@maplibre/maplibre-react-native';

import { DEFAULT_MAP_STYLE, MAP_STYLES } from '@/constants/map';

/**
 * A region the user can download for offline use.
 *
 * The public OpenFreeMap instance allows ~3,000 tiles or 50 MB per download, so
 * regions are deliberately small (a town, not the country) and capped at zoom 16
 * to stay inside that budget. Whole-country offline means self-hosting tiles.
 */
export type OfflineRegion = {
  id: string;
  name: string;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
};

export const OFFLINE_REGIONS: OfflineRegion[] = [
  { id: 'gaborone', name: 'Gaborone', bounds: [25.79, -24.76, 26.06, -24.54], minZoom: 10, maxZoom: 16 },
  { id: 'francistown', name: 'Francistown', bounds: [27.44, -21.26, 27.61, -21.09], minZoom: 10, maxZoom: 16 },
  { id: 'maun', name: 'Maun', bounds: [23.34, -20.06, 23.56, -19.89], minZoom: 10, maxZoom: 16 },
  { id: 'kasane', name: 'Kasane', bounds: [25.06, -17.86, 25.30, -17.74], minZoom: 10, maxZoom: 16 },
];

export type OfflineDownloadStatus = {
  id: string;
  regionId: string;
  name: string;
  /** 0–1. */
  percentage: number;
  state: 'inactive' | 'active' | 'complete';
  completedResourceCount: number;
  requiredResourceCount: number;
};

type NativeMapLibre = typeof import('@maplibre/maplibre-react-native');

/**
 * MapLibre Native is only present in development/production builds. On web and
 * Expo Go there is no OfflineManager, so every helper degrades to a no-op.
 */
async function loadNativeOffline(): Promise<NativeMapLibre | null> {
  try {
    return await import('@maplibre/maplibre-react-native');
  } catch {
    return null;
  }
}

function toDownloadStatus(
  id: string,
  status: OfflinePackStatus,
  regionId: string,
): OfflineDownloadStatus {
  return {
    id,
    regionId,
    name: OFFLINE_REGIONS.find((region) => region.id === regionId)?.name ?? 'Region',
    percentage: typeof status.percentage === 'number' ? status.percentage / 100 : 0,
    state: status.state,
    completedResourceCount: status.completedResourceCount,
    requiredResourceCount: status.requiredResourceCount,
  };
}

function regionIdOf(pack: OfflinePack): string {
  const metadata = (pack as unknown as { metadata?: Record<string, unknown> }).metadata;
  return typeof metadata?.regionId === 'string' ? metadata.regionId : 'unknown';
}

/** List every offline pack already stored on the device. */
export async function listOfflineRegions(): Promise<OfflineDownloadStatus[]> {
  const native = await loadNativeOffline();
  if (!native) {
    return [];
  }
  try {
    const packs = await native.OfflineManager.getPacks();
    return await Promise.all(
      packs.map(async (pack) => toDownloadStatus(pack.id, await pack.status(), regionIdOf(pack))),
    );
  } catch {
    return [];
  }
}

export async function downloadRegion(
  region: OfflineRegion,
  onProgress: (status: OfflineDownloadStatus) => void,
): Promise<string | null> {
  const native = await loadNativeOffline();
  if (!native) {
    throw new Error('Offline maps need a development build (MapLibre Native is missing).');
  }

  const styleUrl = MAP_STYLES[DEFAULT_MAP_STYLE].url;
  if (!styleUrl) {
    throw new Error('The default map style has no URL to download.');
  }

  const pack = await native.OfflineManager.createPack(
    {
      mapStyle: styleUrl,
      bounds: region.bounds,
      minZoom: region.minZoom,
      maxZoom: region.maxZoom,
      metadata: { regionId: region.id, name: region.name },
    },
    (_pack, status) => onProgress(toDownloadStatus(_pack.id, status, region.id)),
    (_pack, error) => {
      console.warn('[myroute] offline pack error', error);
    },
  );
  return pack.id;
}

export async function deleteOfflineRegion(id: string): Promise<void> {
  const native = await loadNativeOffline();
  await native?.OfflineManager.deletePack(id);
}
