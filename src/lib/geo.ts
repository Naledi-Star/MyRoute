import type { Place } from '@/data/myroute';

export type LatLng = { latitude: number; longitude: number };

/** Haversine distance in metres between two coordinates. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "500 m" or "2.4 km" — the format the wireframes use everywhere. */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    return `${Math.round(metres / 10) * 10} m`;
  }
  const km = metres / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Sort a list of places by straight-line distance from a reference point. */
export function sortByDistance<T extends { latitude?: number; longitude?: number }>(
  items: T[],
  from: LatLng,
): T[] {
  return [...items].sort((a, b) => {
    const da = a.latitude != null && a.longitude != null
      ? distanceMetres(from, { latitude: a.latitude, longitude: a.longitude })
      : Infinity;
    const db = b.latitude != null && b.longitude != null
      ? distanceMetres(from, { latitude: b.latitude, longitude: b.longitude })
      : Infinity;
    return da - db;
  });
}

/** Attach a formatted `distance` string to a place based on the user's location. */
export function withDistance(place: Place, from: LatLng): Place {
  if (place.latitude == null || place.longitude == null) {
    return place;
  }
  return {
    ...place,
    distance: formatDistance(
      distanceMetres(from, { latitude: place.latitude, longitude: place.longitude }),
    ),
  };
}