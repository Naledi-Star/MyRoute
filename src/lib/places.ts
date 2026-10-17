import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Place } from '@/data/myroute';

const STORAGE_KEY = 'myroute:places';

/** A place the user bookmarked, with the moment it was saved. */
export type SavedPlace = Place & { savedAt: number };

/** Places have no server id, so name + coordinates identify them. */
type PlaceIdentity = Pick<Place, 'name' | 'latitude' | 'longitude'>;

export function samePlace(a: PlaceIdentity, b: PlaceIdentity): boolean {
  return (
    a.name === b.name &&
    Math.abs(a.latitude - b.latitude) < 1e-6 &&
    Math.abs(a.longitude - b.longitude) < 1e-6
  );
}

export async function loadPlaces(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedPlace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persist(places: SavedPlace[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
}

/** Bookmark a place (no-op if it is already bookmarked) and return the list. */
export async function savePlace(place: Place): Promise<SavedPlace[]> {
  const places = await loadPlaces();
  const record: SavedPlace = { ...place, savedAt: Date.now() };
  const next = [record, ...places.filter((existing) => !samePlace(existing, place))];
  await persist(next);
  return next;
}

/** Remove a bookmarked place and return the remaining list. */
export async function unsavePlace(place: PlaceIdentity): Promise<SavedPlace[]> {
  const places = await loadPlaces();
  const next = places.filter((existing) => !samePlace(existing, place));
  await persist(next);
  return next;
}
