import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_KEY = 'myroute:device-id';

function makeId(): string {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Stable per-install id.
 *
 * The app has no accounts (yet), so this is the contributor identity the API
 * stores on contributions: it lets a device see and delete what it uploaded
 * while everybody else only sees approved records.
 */
export async function deviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Storage unavailable: fall through to a fresh id for this session.
  }
  const id = makeId();
  try {
    await AsyncStorage.setItem(DEVICE_KEY, id);
  } catch {
    // Best effort; an unpersisted id is still better than none.
  }
  return id;
}
