import { BOTSWANA_SEARCH_BOUNDS } from '@/constants/map';

export type SearchResult = {
  placeId: number;
  displayName: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string;
  type: string;
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'myroute-bw/1.0 (contact@myroute.bw)';

/**
 * Search OpenStreetMap for places inside Botswana.
 *
 * Nominatim's usage policy requires a descriptive User-Agent and no more than
 * one request per second. The app should debounce input, cache results, and
 * never call this in a tight loop.
 */
export async function searchBotswana(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '8',
    countrycodes: 'bw',
    addressdetails: '1',
    viewbox: BOTSWANA_SEARCH_BOUNDS.viewbox,
    bounded: BOTSWANA_SEARCH_BOUNDS.bounded,
  });
  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const raw = (await res.json()) as {
    place_id: number;
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
    category?: string;
    type?: string;
  }[];
  return raw.map((item) => ({
    placeId: item.place_id,
    displayName: item.display_name,
    name: item.name ?? item.display_name.split(',')[0],
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
    category: item.category ?? 'place',
    type: item.type ?? 'unknown',
  }));
}

/** Reverse geocode a coordinate into a human-readable address. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Reverse geocode failed (${res.status})`);
  }
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ?? '';
}