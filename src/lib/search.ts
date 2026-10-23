import { BOTSWANA_SEARCH_BOUNDS, NOMINATIM_BASE_URL } from '@/constants/map';

import { API_BASE, hasBackend } from './api';

export type SearchResult = {
  placeId: number;
  displayName: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string;
  type: string;
};

/**
 * The User-Agent used only by the direct fallback. Nominatim's usage policy
 * requires a descriptive agent and at most one request per second; the normal
 * path goes through the MyRoute API, which owns the shared cache and rate
 * policy, so this is only reached when the API is unreachable or unconfigured.
 */
const FALLBACK_USER_AGENT = 'myroute-bw/1.0 (contact@myroute.bw)';

type NominatimItem = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
};

function toResult(item: NominatimItem): SearchResult {
  return {
    placeId: item.place_id,
    displayName: item.display_name,
    name: item.name ?? item.display_name.split(',')[0],
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
    category: item.category ?? 'place',
    type: item.type ?? 'unknown',
  };
}

async function searchDirect(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '8',
    countrycodes: 'bw',
    addressdetails: '1',
    viewbox: BOTSWANA_SEARCH_BOUNDS.viewbox,
    bounded: BOTSWANA_SEARCH_BOUNDS.bounded,
  });
  const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
    headers: { 'User-Agent': FALLBACK_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const raw = (await res.json()) as NominatimItem[];
  return raw.map(toResult);
}

/**
 * Search OpenStreetMap for places inside Botswana.
 *
 * With a backend configured this calls the MyRoute API, which caches results
 * and applies the provider's usage policy server-side. The direct Nominatim call
 * is kept only as a fallback so search does not break on a device that cannot
 * reach the API.
 */
export async function searchBotswana(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  if (hasBackend) {
    try {
      const params = new URLSearchParams({ q: query, limit: '8' });
      const response = await fetch(`${API_BASE}/search?${params.toString()}`);
      if (response.ok) {
        const body = (await response.json()) as { data?: SearchResult[] };
        return Array.isArray(body.data) ? body.data : [];
      }
    } catch {
      // Fall through to the direct provider.
    }
  }

  return searchDirect(query);
}

/** Reverse geocode a coordinate into a human-readable address. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  if (hasBackend) {
    try {
      const params = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
      });
      const response = await fetch(`${API_BASE}/geocode/reverse?${params.toString()}`);
      if (response.ok) {
        const body = (await response.json()) as { displayName?: string };
        if (typeof body.displayName === 'string') {
          return body.displayName;
        }
      }
    } catch {
      // Fall through to the direct provider.
    }
  }

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
  });
  const res = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params.toString()}`, {
    headers: { 'User-Agent': FALLBACK_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Reverse geocode failed (${res.status})`);
  }
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ?? '';
}
