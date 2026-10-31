import type { PathWaypoint } from './paths';
import type { Place } from '@/data/myroute';

export type LatLng = { latitude: number; longitude: number };

/** Two stops this close are the same stop, captured twice. */
export const DUPLICATE_STOP_M = 8;

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
/**
 * The labelled points every path keeps: a start, an end, and the stops between.
 *
 * A route only needs two points — where it begins and where it ends. A path
 * recorded without a single marked stop still gets its first and last
 * coordinate labelled from `line` (`[lng, lat]` pairs), which is what gives
 * every saved path, and every combi route, something to pin on the map and two
 * boarding points for the database to hold. Stops in the middle are kept as
 * they are: they are the bonus that turns a bare line into a route with places
 * on it.
 *
 * A stop already sitting on the start or the end *is* that endpoint, so it
 * keeps its own name and nothing is added twice.
 */
export function labelledEndpoints(
  line: [number, number][],
  stops: PathWaypoint[] = [],
): PathWaypoint[] {
  const list = [...stops];
  if (line.length === 0) {
    return list;
  }

  const start = { latitude: line[0][1], longitude: line[0][0] };
  const covered = (point: LatLng) =>
    list.some((stop) => distanceMetres(stop, point) < DUPLICATE_STOP_M);

  if (!covered(start)) {
    list.unshift({
      id: 'endpoint-start',
      label: 'Start',
      latitude: start.latitude,
      longitude: start.longitude,
      accuracy: null,
      capturedAt: 0,
    });
  }
  // A single point is not a route yet: it has an origin but no end to label.
  if (line.length < 2) {
    return list;
  }

  const end = { latitude: line[line.length - 1][1], longitude: line[line.length - 1][0] };
  // A loop ends where it began, which would otherwise leave one label.
  if (!covered(end) || list.length < 2) {
    list.push({
      id: 'endpoint-end',
      label: 'End',
      latitude: end.latitude,
      longitude: end.longitude,
      accuracy: null,
      capturedAt: 0,
    });
  }
  return list;
}
