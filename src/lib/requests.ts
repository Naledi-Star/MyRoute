import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Community requests posted from this device.
 *
 * A request is not a place: it asks neighbours to help locate something. It has
 * no moderation gate yet, so it is kept on the device (like the offline place
 * queue) and listed under Requests -> My requests immediately after it is sent.
 * When requests gain a server table this module is the one place that changes.
 */

export type SubmittedRequest = {
  id: string;
  name: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  status: 'pending';
};

const STORAGE_KEY = 'myroute:requests';

function makeId(): string {
  return `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadRequests(): Promise<SubmittedRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SubmittedRequest[];
    return Array.isArray(parsed)
      ? parsed
          .filter((request) => request && typeof request.name === 'string')
          .sort((a, b) => b.createdAt - a.createdAt)
      : [];
  } catch {
    return [];
  }
}

/** Store a request and return the new list, newest first. */
export async function addRequest(
  input: Omit<SubmittedRequest, 'id' | 'createdAt' | 'status'>,
): Promise<SubmittedRequest[]> {
  const request: SubmittedRequest = {
    ...input,
    id: makeId(),
    createdAt: Date.now(),
    status: 'pending',
  };
  const next = [request, ...(await loadRequests())];
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage is best-effort: the confirmation still shows for this session.
  }
  return next;
}
