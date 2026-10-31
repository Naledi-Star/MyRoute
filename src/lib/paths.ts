import AsyncStorage from '@react-native-async-storage/async-storage';

import { getRouteThrough, type TravelProfile } from './routing';

/**
 * Start / End labelling lives in `geo.ts`, where it stays pure enough to test
 * on its own; it is re-exported here because paths are its callers' vocabulary.
 */
export { labelledEndpoints } from './geo';

/**
 * A named stop captured while recording a path.
 *
 * Stored next to the geometry rather than inside it: `vertices` stays a plain
 * GeoJSON coordinate list, while each stop keeps the accuracy of the fix that
 * produced it so a weak one can be flagged for review instead of being trusted
 * like the rest of the line.
 */
export type PathWaypoint = {
  id: string;
  /** What the contributor called the stop, e.g. "Station" or "Ledumang rank". */
  label: string;
  latitude: number;
  longitude: number;
  /** Radius of uncertainty at capture time, in metres; `null` when unknown. */
  accuracy: number | null;
  capturedAt: number;
  /**
   * A photo of the stop, saved on the device (optional). Stops get checked
   * against photos of the ground much faster than against coordinates alone.
   */
  photoUri?: string;
  /**
   * Standard fare (pula) from the previous stop to this one, for combi routes.
   * Combis charge by stage, so this is a segment fare, not a ticket price.
   */
  fareFromPrevious?: number | null;
};

/**
 * What a saved path represents:
 * - `path` — a walk, cycle or drive the contributor recorded for themselves.
 * - `combi` — a combi route: the same recording, but the stops are the places
 *   riders can board and get off, so the app can plan journeys over it.
 */
export type PathKind = 'path' | 'combi';

/**
 * A path the user recorded on the ground or drew on the map, and (optionally)
 * snapped to roads.
 *
 * Both geometries are kept: `vertices` is what the user actually captured or
 * tapped, so it can be re-snapped or edited later, and `coordinates` is the
 * road-following geometry the routing engine returned.
 */
export type SavedPath = {
  id: string;
  /**
   * The server's uuid, once the contribution has been accepted. The local id
   * stays the dedupe key (retries send it as `clientId`); this is stored so the
   * server record can be recognised later without changing that.
   */
  serverId?: string;
  name: string;
  profile: TravelProfile;
  /** Raw captured or tapped vertices, [lng, lat]. */
  vertices: [number, number][];
  /** Stops captured on the ground, in the order they were taken. */
  waypoints?: PathWaypoint[];
  /** How the line was produced: walked with the phone, or drawn from the couch. */
  source?: 'recorded' | 'drawn';
  /** Personal recording (default) or a combi route contribution. */
  kind?: PathKind;
  /** What the combi route is called, e.g. "Block 8 Route 4" (`combi` only). */
  combiName?: string;
  /** The rank the combi leaves from, e.g. "Block 8 rank" (`combi` only). */
  rank?: string;
  /** Snapped road geometry, [lng, lat]. Equals `vertices` when unsnapped. */
  coordinates: [number, number][];
  snapped: boolean;
  distanceMetres: number;
  durationSeconds: number;
  createdAt: number;
  /**
   * Paths are public community contributions. `local` means it only exists on
   * this device; `pending` means it was submitted and is awaiting review; the
   * backend flips it to `approved` once a moderator signs off.
   */
  status: 'local' | 'pending' | 'approved';
};

const STORAGE_KEY = 'myroute:paths';

function makeId(): string {
  return `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadPaths(): Promise<SavedPath[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedPath[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persist(paths: SavedPath[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}

export async function addPath(
  input: Omit<SavedPath, 'id' | 'createdAt' | 'status'> & {
    id?: string;
    createdAt?: number;
    status?: SavedPath['status'];
  },
): Promise<SavedPath[]> {
  const paths = await loadPaths();
  const path: SavedPath = {
    ...input,
    id: input.id ?? makeId(),
    createdAt: input.createdAt ?? Date.now(),
    status: input.status ?? 'local',
  };
  // Upsert: re-saving a synced record keeps its id, so drop the old copy first
  // instead of ending up with the same path twice.
  const next = [path, ...paths.filter((existing) => existing.id !== path.id)];
  await persist(next);
  return next;
}

/**
 * Merge records fetched from the server into the on-device copy.
 *
 * The server is the source of truth for who contributed what, but the device
 * keeps its own copy so a path can be drawn, edited and previewed without a
 * round trip. Server ids replace local ids where they are the same record, and
 * an already-synced local copy keeps its id so nothing is listed twice.
 */
export async function mergePaths(incoming: SavedPath[]): Promise<SavedPath[]> {
  const paths = await loadPaths();
  const byId = new Map(paths.map((path) => [path.id, path]));
  for (const path of incoming) {
    const existing = byId.get(path.id);
    byId.set(path.id, existing ? { ...existing, ...path } : path);
  }
  const next = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  await persist(next);
  return next;
}

export async function removePath(id: string): Promise<SavedPath[]> {
  const paths = await loadPaths();
  const next = paths.filter((path) => path.id !== id);
  await persist(next);
  return next;
}

/** Snap a set of tapped vertices to the road network for the chosen profile. */
export async function snapVertices(
  vertices: [number, number][],
  profile: TravelProfile,
): Promise<{ coordinates: [number, number][]; distanceMetres: number; durationSeconds: number }> {
  const result = await getRouteThrough(vertices, profile);
  return {
    coordinates: result.coordinates,
    distanceMetres: result.distanceMetres,
    durationSeconds: result.durationSeconds,
  };
}
