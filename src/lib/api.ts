import AsyncStorage from '@react-native-async-storage/async-storage';

import { addPath, loadPaths, type SavedPath } from './paths';

/**
 * Thin client for the myroute Cloudflare Worker.
 *
 * The Worker lives in `server/` and owns the D1 database, R2 photo buckets and
 * the Clerk-authenticated endpoints. Until `EXPO_PUBLIC_API_URL` is set the app
 * runs entirely locally: contributions are stored on the device with a
 * `pending` status so the review queue and offline behaviour can still be
 * exercised end-to-end.
 */
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const hasBackend = BASE_URL.length > 0;

/** Exported so other modules (chat) can reach the same Worker. */
export const API_BASE = BASE_URL;

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
  /** Optional signed-in user id (Clerk `sub`), when accounts are enabled. */
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

/** Auth token supplied by the auth layer once Clerk is wired. */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new Error(`API ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

// ── Pending places (local queue) ─────────────────────────────────────────────

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

/**
 * Submit a place. With a backend configured this POSTs to the Worker (which
 * files it as `pending` in D1 for the review dashboard); offline or without a
 * backend it is queued locally so nothing is lost.
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
      const saved = await apiRequest<PendingPlace>('/places', {
        method: 'POST',
        body: JSON.stringify(record),
      });
      return saved;
    } catch {
      // Fall through to the local queue so the contribution is not lost.
      record.status = 'local';
    }
  }

  const pending = await loadPendingPlaces();
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([record, ...pending]));
  return record;
}

/**
 * Send a recorded path (or combi route) to the community database.
 *
 * Paths are community property: the same recording that becomes the rider's own
 * saved line is also the line everybody else can search. When the upload fails
 * the path stays on the device and `syncLocalContributions` retries it, so the
 * database is the destination rather than the device.
 */
export async function submitPath(path: SavedPath): Promise<SavedPath> {
  if (!hasBackend) {
    return path;
  }
  try {
    return await apiRequest<SavedPath>('/paths', {
      method: 'POST',
      body: JSON.stringify(path),
    });
  } catch {
    return path;
  }
}

/** Approved places contributed by the community. */
export async function fetchCommunityPlaces(): Promise<CommunityPlace[]> {
  if (!hasBackend) {
    return [];
  }
  try {
    const places = await apiRequest<CommunityPlace[]>('/places');
    return Array.isArray(places) ? places.filter((place) => place.id != null) : [];
  } catch {
    return [];
  }
}

/** Approved paths and combi routes contributed by the community. */
export async function fetchCommunityPaths(): Promise<SavedPath[]> {
  if (!hasBackend) {
    return [];
  }
  try {
    const paths = await apiRequest<SavedPath[]>('/paths');
    return Array.isArray(paths) ? paths : [];
  } catch {
    return [];
  }
}

/**
 * Push anything that was recorded while offline to the database.
 *
 * Called when the app opens. Both loops are safe to repeat: places use an
 * idempotent insert and paths are stored as an upsert, so a retry cannot
 * duplicate or lose a contribution.
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
          await apiRequest<PendingPlace>('/places', {
            method: 'POST',
            body: JSON.stringify(place),
          });
          places += 1;
        } catch {
          remaining.push(place);
        }
      }
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
    }
  } catch {
    // Storage is best-effort; the next launch tries again.
  }

  let paths = 0;
  try {
    const local = (await loadPaths()).filter((path) => path.status === 'local');
    for (const path of local) {
      try {
        const saved = await apiRequest<SavedPath>('/paths', {
          method: 'POST',
          body: JSON.stringify(path),
        });
        await addPath(saved);
        paths += 1;
      } catch {
        // Stays local and is retried on the next launch.
      }
    }
  } catch {
    // Same: nothing lost, it stays on the device.
  }

  return { places, paths };
}

/** Upload a photo to R2 via a Worker-issued signed URL. */
export async function uploadPhoto(localUri: string, ownerId: string): Promise<string> {
  if (!hasBackend) {
    throw new Error('Photos need the myroute backend (set EXPO_PUBLIC_API_URL).');
  }
  const { key, uploadUrl } = await apiRequest<{ key: string; uploadUrl: string }>(
    '/photos/sign',
    { method: 'POST', body: JSON.stringify({ ownerId }) },
  );

  const file = await fetch(localUri);
  const blob = await file.blob();
  await fetch(uploadUrl, { method: 'PUT', body: blob });
  return key;
}
