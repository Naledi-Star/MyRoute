import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { AppText } from '@/components/myroute/text';
import { PrimaryButton, Tap, TopBar } from '@/components/myroute/ui';
import { Palette, Radius } from '@/constants/theme';

/**
 * Notifications.
 *
 * There is no notification feed yet, so the bell says so plainly instead of
 * navigating somewhere unrelated. When events start arriving they are listed
 * here, above the same empty state.
 */

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <TopBar
        onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        style={{ paddingTop: insets.top }}
        title="Notifications"
      />

      <View style={styles.body}>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon color={Palette.green} name="bell" size={30} />
          </View>
          <AppText size={15} weight="bold" style={styles.emptyTitle}>
            No notifications
          </AppText>
          <AppText color="muted" size={11} style={styles.emptyText}>
            You are all caught up. When a place you added is approved, or a neighbour replies, it
            will show up here.
          </AppText>
        </View>

        <Tap
          accessibilityLabel="Message neighbours"
          onPress={() =>
            router.push({
              pathname: '/thread',
              params: { id: 'community', title: 'Neighbourhood' },
            })
          }
          style={styles.action}>
          <Icon color={Palette.green} name="chat" size={17} />
          <AppText color="green" size={11} weight="semibold">
            Talk to your neighbourhood instead
          </AppText>
          <Icon color={Palette.green} name="chevron" size={15} />
        </Tap>

        <View style={styles.spacer} />
        <PrimaryButton label="Back to the map" onPress={() => router.navigate('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 18, gap: 12 },
  empty: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CAD5CC',
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAFCF9',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    marginBottom: 4,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.greenSoft,
  },
  emptyTitle: { textAlign: 'center' },
  emptyText: { maxWidth: 270, textAlign: 'center', lineHeight: 16 },
  action: {
    height: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3FAF5',
  },
  spacer: { flex: 1 },
});
