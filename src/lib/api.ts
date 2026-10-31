import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { savedPathsFromCombiRoutes, type ApiCombiRoute } from './combi';
import { deviceId } from './device';
import { addPath, loadPaths, mergePaths, removePath, type SavedPath } from './paths';
import { preparePhotoForUpload } from './photo-upload';
import type { TravelProfile } from './routing';

/**
 * Thin client for the MyRoute API (the Express server in `backend/`).
 *
 * Everything the app knows about the network lives here or in `chat.ts`: no
 * screen fetches directly, so there is one place that owns the base URL, the
 * response envelope, idempotency keys and error handling.
 *
 * Without a resolvable backend the app runs entirely locally: contributions
 * are stored on the device with a `local` status so the review queue and the
 * offline behaviour still work end to end.
 */

/**
 * Where the API lives.
 *
 * Production and preview builds pass the deployed URL in `EXPO_PUBLIC_API_URL`.
 * During development that is normally left empty and the address is derived
 * from whichever server delivered the app: Metro proxies `/api` to the backend
 * (see metro.config.js), so the phone reaches the API over exactly the route
 * it already reaches the bundle over — Wi-Fi, USB (`adb reverse`), an emulator
 * or a tunnel. One reachable port is enough; a second port blocked by a
 * firewall can no longer make the app look offline.
 */
function resolveApiBase(): string {
  const explicit = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (explicit.length > 0) {
    return explicit;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  return host.length > 0 ? `http://${host}` : '';
}

const BASE_URL = resolveApiBase();

export const hasBackend = BASE_URL.length > 0;

/** Versioned API root. Every request goes through here. */
export const API_BASE = BASE_URL.length > 0 ? `${BASE_URL}/api/v1` : '';

/**
 * Dev-only breadcrumb, printed in the Metro terminal.
 *
 * A phone's view of the network is invisible from the development machine, so
 * every request outcome is reported from the device itself; production builds
 * compile it out.
 */
function devNote(message: string): void {
  if (__DEV__) {
    console.warn(`[myroute api] ${message}`);
  }
}

export type ContributionStatus = 'local' | 'pending' | 'approved' | 'rejected';

export type PendingPlace = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Area or suburb, e.g. "Block 8" — shown on the place screen. */
  area?: string;
  latitude: number;
  longitude: number;
  status: ContributionStatus;
  createdAt: number;
  /** The server's uuid once accepted; the local `id` remains the dedupe key. */
  serverId?: string;
  /** Optional opaque contributor id, when accounts are enabled. */
  contributorId?: string;
};

/** A place the community has published, as returned by `GET /places`. */
export type CommunityPlace = {
  id: string;
  name: string;
  category: string;
  description: string;
  area: string;
  latitude: number;
  longitude: number;
  status: ContributionStatus;
  createdAt: number;
  /** Present only on the near-me query. */
  distanceMetres?: number;
};

const PENDING_KEY = 'myroute:pending-places';

/** An API failure with the server's stable code, so callers can react to it. */
export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    devNote(`network failure ${init.method ?? 'GET'} ${path} → ${BASE_URL}: ${reason}`);
    throw new ApiRequestError(0, 'network_failure', 'Could not reach the myroute backend.');
  }
  if (!response.ok) {
    let code = `http_${response.status}`;
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON error (proxy, offline). Keep the status-based message.
    }
    devNote(`rejected ${response.status} ${code} ${init.method ?? 'GET'} ${path}`);
    throw new ApiRequestError(response.status, code, message);
  }
  // Deletes answer 204 with no body; there is nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// ── Wire shapes (server records) ────────────────────────────────────────────

type LineString = { type: 'LineString'; coordinates: [number, number][] };

type ApiList<T> = { data: T[]; meta: Record<string, unknown> };

type ApiPlaceRecord = {
  id: string;
  clientId: string | null;
  name: string;
  category: string;
  description: string;
  area: string;
  latitude: number;
  longitude: number;
  status: ContributionStatus;
  createdAt: string;
  distanceMetres?: number;
};

type ApiPathRecord = {
  id: string;
  clientId: string | null;
  kind: 'path';
  name: string;
  profile: string;
  source: 'recorded' | 'drawn' | null;
  vertices: LineString | null;
  coordinates: LineString | null;
  snapped: boolean;
  distanceMetres: number;
  durationSeconds: number;
  status: ContributionStatus;
  createdAt: string;
};

/** ISO 8601 from the API → the epoch milliseconds the app already uses. */
function toMillis(value: string | number | undefined | null, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toTravelProfile(value: string): TravelProfile {
  return value === 'car' || value === 'bike' || value === 'foot' ? value : 'foot';
}

function toCommunityPlace(record: ApiPlaceRecord): CommunityPlace {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    description: record.description,
    area: record.area ?? '',
    latitude: record.latitude,
    longitude: record.longitude,
    status: record.status,
    // The app works in epoch milliseconds everywhere; the API speaks ISO 8601.
    createdAt: toMillis(record.createdAt),
    ...(record.distanceMetres != null ? { distanceMetres: record.distanceMetres } : {}),
  };
}

function toSavedPath(record: ApiPathRecord): SavedPath | null {
  const vertices = record.vertices?.coordinates ?? [];
  if (!Array.isArray(vertices) || vertices.length < 2) {
    return null;
  }
  const snapped = record.coordinates?.coordinates ?? [];
  return {
    // The device's own id, when the server has one, so the community copy
    // merges with the local copy instead of appearing twice.
    id: record.clientId?.trim() || record.id,
    serverId: record.id,
    name: record.name,
    profile: toTravelProfile(record.profile),
    vertices,
    coordinates: snapped.length >= 2 ? snapped : vertices,
    snapped: record.snapped === true && snapped.length >= 2,
    distanceMetres: Number(record.distanceMetres ?? 0),
    durationSeconds: Number(record.durationSeconds ?? 0),
    createdAt: toMillis(record.createdAt, Date.now()),
    // A contributor's own record may still be pending; the API only returns it
    // to that contributor, so its real status is shown instead of pretending.
    status: record.status === 'pending' ? 'pending' : 'approved',
    kind: 'path',
    ...(record.source ? { source: record.source } : {}),
  };
}

function toLineString(coordinates: [number, number][] | undefined): LineString | undefined {
  return Array.isArray(coordinates) && coordinates.length >= 2
    ? { type: 'LineString', coordinates }
    : undefined;
}

// ── Pending places (local queue) ────────────────────────────────────────────

export async function loadPendingPlaces(): Promise<PendingPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as PendingPlace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function storePendingPlaces(places: PendingPlace[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(places));
}

/**
 * Submit a place. With a backend configured this POSTs to the API (filed as
 * `pending` for moderation); offline or without a backend it is queued locally
 * so nothing is lost. `clientId` is the local id, so retries never duplicate.
 */
export async function submitPlace(
  place: Omit<PendingPlace, 'id' | 'status' | 'createdAt'>,
): Promise<PendingPlace> {
  const record: PendingPlace = {
    ...place,
    id: `place-${Date.now().toString(36)}`,
    status: hasBackend ? 'pending' : 'local',
    createdAt: Date.now(),
  };

  if (hasBackend) {
    try {
      const saved = await request<ApiPlaceRecord>('/places', {
        method: 'POST',
        body: JSON.stringify({
          clientId: record.id,
          name: record.name,
          category: record.category,
          description: record.description,
          area: record.area,
          latitude: record.latitude,
          longitude: record.longitude,
          contributorId: await deviceId(),
        }),
      });
      devNote(`saved place ${record.id} → ${saved.id}`);
      return { ...record, status: 'pending', serverId: saved.id };
    } catch {
      // Fall through to the local queue so the contribution is not lost.
      devNote(`place ${record.id} kept on device; will retry on next launch`);
      record.status = 'local';
    }
  }

  const pending = await loadPendingPlaces();
  await storePendingPlaces([record, ...pending]);
  return record;
}

/**
 * Send a recorded path or combi route to the community database.
 *
 * Paths go to `/paths`; combi routes go to `/combi-routes` (they are first-class
 * records with ordered stops, not personal recordings). Either way the local id
 * travels as `clientId`, so a retry replaces rather than duplicates, and the
 * app's own copy keeps its id — only the status and `serverId` change.
 *
 * The whole recorded line is sent, snapped or not: a track that has not been
 * matched to roads is still the road the contributor actually took, and refusing
 * to upload it was why routes existed on the device but not in the database.
 * Failures throw, so a screen can tell the contributor the upload did not land
 * instead of silently claiming success.
 */
export async function submitPath(path: SavedPath): Promise<SavedPath> {
  if (!hasBackend) {
    return path;
  }

  const contributorId = await deviceId();
  const line = toLineString(
    path.coordinates.length >= 2 ? path.coordinates : path.vertices,
  );

  if (path.kind === 'combi') {
    const stops = (path.waypoints ?? []).filter(
      (stop) =>
        typeof stop.label === 'string' &&
        stop.label.trim().length > 0 &&
        Number.isFinite(stop.latitude) &&
        Number.isFinite(stop.longitude),
    );
    if (stops.length < 2) {
      throw new ApiRequestError(
        400,
        'combi_route_needs_stops',
        'A combi route needs two stops: where riders board and where they get off.',
      );
    }

    const saved = await request<ApiCombiRoute>('/combi-routes', {
      method: 'POST',
      body: JSON.stringify({
        clientId: path.id,
        name: (path.combiName ?? '').trim() || path.name,
        rank: path.rank ?? '',
        description: '',
        geometry: line,
        contributorId,
        stops: stops.map((stop) => ({
          clientId: stop.id,
          label: stop.label.trim(),
          latitude: stop.latitude,
          longitude: stop.longitude,
          fareFromPrevious: stop.fareFromPrevious ?? null,
          accuracyM: stop.accuracy ?? undefined,
          capturedAt: new Date(stop.capturedAt).toISOString(),
        })),
      }),
    });
    devNote(`saved combi ${path.id} → ${saved.id} (${stops.length} stops)`);
    return { ...path, serverId: saved.id, status: 'pending' };
  }

  const saved = await request<ApiPathRecord>('/paths', {
    method: 'POST',
    body: JSON.stringify({
      clientId: path.id,
      name: path.name,
      profile: path.profile,
      source: path.source,
      vertices: toLineString(path.vertices),
      coordinates: line,
      snapped: path.snapped,
      distanceMetres: path.distanceMetres,
      durationSeconds: path.durationSeconds,
      contributorId,
    }),
  });
  devNote(`saved path ${path.id} → ${saved.id}`);
  return { ...path, serverId: saved.id, status: 'pending' };
}

/** Approved places contributed by the community. */
export async function fetchCommunityPlaces(): Promise<CommunityPlace[]> {
  if (!hasBackend) {
    return [];
  }
  try {
    const body = await request<ApiList<ApiPlaceRecord>>('/places?limit=100');
    return Array.isArray(body.data) ? body.data.map(toCommunityPlace) : [];
  } catch {
    return [];
  }
}

/**
 * Paths and combi routes from the server.
 *
 * Two endpoints, merged locally: `/paths` holds recordings, `/combi-routes`
 * holds routes with ordered stops. A combi route is adapted into the app's
 * `SavedPath` shape (stops as waypoints) so the combi screen and planner keep
 * working unchanged.
 *
 * With `contributorId` the listing also includes that device's own pending
 * contributions, which is how a route appears in Saved and Combies immediately
 * after it is uploaded instead of waiting for review.
 */
async function fetchPaths(query: string): Promise<SavedPath[]> {
  const [paths, combiRoutes] = await Promise.allSettled([
    request<ApiList<ApiPathRecord>>(`/paths?${query}`),
    request<ApiList<ApiCombiRoute>>(`/combi-routes?${query}`),
  ]);

  // Both endpoints failing means the server is unreachable, not that the
  // database is empty — the caller decides whether to fall back to the device.
  if (paths.status === 'rejected' && combiRoutes.status === 'rejected') {
    throw paths.reason;
  }

  const merged: SavedPath[] = [];
  if (paths.status === 'fulfilled' && Array.isArray(paths.value.data)) {
    for (const record of paths.value.data) {
      const mapped = toSavedPath(record);
      if (mapped) {
        merged.push(mapped);
      }
    }
  }
  if (combiRoutes.status === 'fulfilled' && Array.isArray(combiRoutes.value.data)) {
    merged.push(...savedPathsFromCombiRoutes(combiRoutes.value.data));
  }
  return merged;
}

export async function fetchCommunityPaths(contributorId?: string): Promise<SavedPath[]> {
  if (!hasBackend) {
    return [];
  }
  const mine = contributorId ? `&contributorId=${encodeURIComponent(contributorId)}` : '';
  return fetchPaths(`limit=100${mine}`);
}

/**
 * Everything this device has contributed, pending or approved.
 *
 * The server is the source of truth for paths: a recording or drawn line lives
 * in the database, and this is the read that fills Saved. The results are merged
 * into the on-device cache so offline previews still work.
 */
export async function fetchMyPaths(): Promise<SavedPath[]> {
  if (!hasBackend) {
    return loadPaths();
  }
  try {
    const contributorId = await deviceId();
    const paths = await fetchPaths(
      `limit=100&mine=1&contributorId=${encodeURIComponent(contributorId)}`,
    );
    if (paths.length > 0) {
      await mergePaths(paths);
    }
    // Anything recorded while the upload could not land has no server id yet;
    // it still belongs on Saved so it is not lost while it waits to be retried.
    const localOnly = (await loadPaths()).filter((path) => !path.serverId);
    const byId = new Map(paths.map((path) => [path.id, path]));
    localOnly.forEach((path) => {
      if (!byId.has(path.id)) {
        byId.set(path.id, path);
      }
    });
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    // Offline: show what this device already has.
    return loadPaths();
  }
}

/**
 * Delete one of this device's contributions from the database.
 *
 * A local-only record has no server id and is simply removed from the device.
 * A server failure is re-thrown: the screen keeps the row and tells the
 * contributor, rather than making the list lie about the database.
 */
export async function deletePathRemote(path: SavedPath): Promise<void> {
  if (hasBackend && path.serverId) {
    const contributorId = await deviceId();
    const collection = path.kind === 'combi' ? 'combi-routes' : 'paths';
    await request<null>(
      `/${collection}/${path.serverId}?contributorId=${encodeURIComponent(contributorId)}`,
      { method: 'DELETE' },
    );
    devNote(`deleted ${collection} ${path.serverId}`);
  }
  await removePath(path.id);
}

/**
 * Push anything that was recorded while offline to the database.
 *
 * Called when the app opens. Both loops are safe to repeat: places and paths
 * send their existing local id as `clientId`, so a retry updates rather than
 * duplicates.
 */
export async function syncLocalContributions(): Promise<{ places: number; paths: number }> {
  if (!hasBackend) {
    return { places: 0, paths: 0 };
  }

  let places = 0;
  try {
    const queued = await loadPendingPlaces();
    if (queued.length > 0) {
      const remaining: PendingPlace[] = [];
      for (const place of queued) {
        try {
          const saved = await request<ApiPlaceRecord>('/places', {
            method: 'POST',
            body: JSON.stringify({
              clientId: place.id,
              name: place.name,
              category: place.category,
              description: place.description,
              area: place.area,
              latitude: place.latitude,
              longitude: place.longitude,
            }),
          });
          places += 1;
          if (!saved.id) {
            remaining.push(place);
          }
        } catch {
          remaining.push(place);
        }
      }
      await storePendingPlaces(remaining);
    }
  } catch {
    // Storage is best-effort; the next launch tries again.
  }

  let paths = 0;
  try {
    const local = (await loadPaths()).filter((path) => path.status === 'local');
    for (const path of local) {
      try {
        const synced = await submitPath(path);
        if (synced.serverId) {
          await addPath(synced);
          paths += 1;
        }
      } catch {
        // One bad record (a legacy combi route with too few stops, say) must
        // not stop the rest of the queue from being retried.
      }
    }
  } catch {
    // Same: nothing lost, it stays on the device.
  }

  return { places, paths };
}

// ── Photos ──────────────────────────────────────────────────────────────────

export type PhotoOwnerType = 'place' | 'path' | 'combi_route' | 'combi_stop';

type PhotoSignature = {
  key: string;
  uploadUrl: string;
  method: 'PUT';
  expiresIn: number;
  contentType: string;
};

/**
 * Upload one stop/place photo.
 *
 * The order is fixed by the backend contract: compress → sign → PUT straight to
 * R2 → report success so the server can HEAD the object and create the row.
 * Each attempt gets exactly one signature and uses it immediately; a failure is
 * surfaced to the user rather than retried in the background, because every
 * signature is rate-limited and billable.
 */
export async function uploadPhoto(
  localUri: string,
  ownerId: string,
  ownerType: PhotoOwnerType = 'place',
): Promise<string> {
  if (!hasBackend) {
    throw new Error('Photos need the myroute backend (set EXPO_PUBLIC_API_URL).');
  }

  const prepared = await preparePhotoForUpload(localUri);

  const signature = await request<PhotoSignature>('/photos/sign', {
    method: 'POST',
    body: JSON.stringify({
      clientId: `photo-${Date.now().toString(36)}`,
      ownerType,
      ownerId,
    }),
  });

  // Direct to R2 with the signed content type. No retry: a second PUT would
  // overwrite the object inside the signature's 5-minute window.
  const file = await fetch(prepared.uri);
  const blob = await file.blob();
  const uploaded = await fetch(signature.uploadUrl, {
    method: signature.method,
    headers: { 'Content-Type': signature.contentType },
    body: blob,
  });
  if (!uploaded.ok) {
    throw new ApiRequestError(
      uploaded.status,
      'photo_upload_failed',
      'The photo could not be uploaded. Check your connection and try again.',
    );
  }

  // The server verifies the object (size and type) before any row is created.
  await request<{ key: string; status: string }>('/photos/confirm', {
    method: 'POST',
    body: JSON.stringify({ key: signature.key }),
  });

  return signature.key;
}
