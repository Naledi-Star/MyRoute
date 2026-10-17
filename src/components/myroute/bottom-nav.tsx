import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { AppText } from './text';
import { Tap } from './ui';

import { Palette, Shadows } from '@/constants/theme';

export type TabKey = 'explore' | 'combi' | 'add' | 'requests' | 'profile';

/**
 * The bar is also shown on screens that are pushed above the tabs, so it takes
 * the wireframe's highlight keys as well ('place' belongs to Explore and
 * 'create-request' to Requests).
 */
export type NavHighlight = TabKey | 'place' | 'create-request';

function highlightFor(active: NavHighlight): TabKey {
  if (active === 'place') {
    return 'explore';
  }
  if (active === 'create-request') {
    return 'requests';
  }
  return active;
}

/** Bar height without the bottom safe-area inset. */
export const BOTTOM_NAV_HEIGHT = 72;

const tabs: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'explore', label: 'Explore', icon: 'compass' },
  { key: 'combi', label: 'Combi', icon: 'minibus' },
  { key: 'add', label: 'Add', icon: 'plus' },
  { key: 'requests', label: 'Requests', icon: 'request' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

const destinations: Record<Exclude<TabKey, 'add'>, Href> = {
  explore: '/',
  combi: '/combi',
  requests: '/requests',
  profile: '/profile',
};

/**
 * Single bottom bar used both as the tab bar of `(tabs)` and inline on the
 * pushed screens that the wireframes show with a tab bar (place, add, arrival).
 */
export function BottomNav({ active }: { active: NavHighlight }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const highlight = highlightFor(active);

  const go = (key: TabKey) => {
    if (key === active) {
      return;
    }
    if (key === 'add') {
      router.push('/add');
      return;
    }
    router.navigate(destinations[key]);
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === highlight;
        return (
          <Tap
            accessibilityLabel={tab.label}
            key={tab.key}
            onPress={() => go(tab.key)}
            style={styles.item}>
            {tab.key === 'add' ? (
              <View style={styles.addIcon}>
                <Icon color={Palette.surface} name="plus" size={25} />
              </View>
            ) : (
              <View style={styles.icon}>
                <Icon color={isActive ? Palette.green : '#7C877F'} name={tab.icon} size={21} />
              </View>
            )}
            <AppText size={9} style={{ color: isActive ? Palette.green : '#7C877F' }} weight="semibold">
              {tab.label}
            </AppText>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 7,
    paddingHorizontal: 8,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Palette.line,
    backgroundColor: Palette.surface,
    ...Shadows.bar,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { height: 28, justifyContent: 'center' },
  addIcon: {
    width: 38,
    height: 38,
    marginTop: -16,
    marginBottom: 3,
    borderWidth: 3,
    borderColor: Palette.surface,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green,
    ...Shadows.green,
  },
});
