import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import type { MapFailureKind } from './map-types';
import { AppText } from './text';
import { PrimaryButton, SecondaryButton } from './ui';

import { Palette, Radius, Shadows } from '@/constants/theme';

/** Shown while the map style and its first tiles are loading. */
export function MapLoading({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <View pointerEvents="box-none" style={styles.center}>
      <View style={styles.card}>
        <ActivityIndicator color={Palette.green} />
        <AppText color="muted" size={12} style={styles.message}>
          {slow ? 'Still loading the map…' : 'Loading the Botswana map…'}
        </AppText>
        {slow ? (
          <>
            <AppText color="muted" size={11} style={styles.message}>
              Check your connection and try again.
            </AppText>
            <SecondaryButton label="Retry" onPress={onRetry} small style={styles.action} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Shown when the map cannot be drawn: either the native module is missing (Expo
 * Go, where MapLibre is not bundled) or the style/tiles failed to download.
 */
export function MapFailure({
  kind,
  onRetry,
  onHelp,
}: {
  kind: MapFailureKind;
  onRetry: () => void;
  /** Opens the development-build guide when the native module is missing. */
  onHelp?: () => void;
}) {
  const unavailable = kind === 'unavailable';
  const needsGuide = unavailable && onHelp != null;

  return (
    <View pointerEvents="box-none" style={styles.center}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Icon color={Palette.red} name={unavailable ? 'compass' : 'layers'} size={20} />
        </View>
        <AppText weight="bold" size={14} style={styles.title}>
          {unavailable ? 'Map needs a development build' : "The map didn't load"}
        </AppText>
        <AppText color="muted" size={11} style={styles.message}>
          {unavailable
            ? "MapLibre's native code is missing from this build. Expo Go never includes it, and development clients built before it was added can't load it — rebuild the client (npm run android) to see the live map."
            : 'myroute could not download the map style. Check your connection and try again.'}
        </AppText>
        <PrimaryButton
          icon={unavailable ? 'map' : undefined}
          label={needsGuide ? 'Read the setup guide' : 'Try again'}
          onPress={needsGuide ? onHelp : onRetry}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 180,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...Shadows.card,
  },
  badge: {
    width: 38,
    height: 38,
    marginBottom: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE9E5',
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center' },
  action: { marginTop: 8 },
});
