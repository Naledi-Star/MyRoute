import * as Notifications from 'expo-notifications';

/**
 * Local notifications, used for turn-by-turn arrival alerts.
 *
 * The permission is requested when navigation starts (a moment where the user
 * obviously expects an alert) rather than on app launch.
 */

// Show incoming notifications as a banner while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Ask for the notification permission if it is not granted yet. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    // Notifications are unavailable on this platform (e.g. web before a secure
    // context): fail quietly, navigation keeps working without alerts.
    return false;
  }
}

/** Fire an immediate local notification, if permission has been granted. */
export async function notify(title: string, body: string): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) {
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // Never let a failed alert break navigation.
  }
}
