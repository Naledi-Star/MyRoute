import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/myroute/bottom-nav';
import { Icon, type IconName } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import { AppText } from '@/components/myroute/text';
import { SectionHeading, Tap } from '@/components/myroute/ui';
import { Palette, Shadows } from '@/constants/theme';
import { useDeviceLocation } from '@/lib/location';

/**
 * Add: the map where you are standing, with one small icon per contribution.
 *
 * There is no form and no list of options on this screen — a place, a path and a
 * combi route are three different jobs, so each icon opens its own flow. The
 * pin for a place starts at the device's own position, which is the whole point
 * of adding from here: you are at the shop when you pin the shop.
 */

type AddOption = {
  key: 'place' | 'path' | 'combi';
  label: string;
  icon: IconName;
  href: '/add-place' | '/draw-path' | '/record-combi';
  accessibility: string;
};

const OPTIONS: AddOption[] = [
  {
    key: 'place',
    label: 'Place',
    icon: 'pin',
    href: '/add-place',
    accessibility: 'Add a place where I am',
  },
  {
    key: 'path',
    label: 'Path',
    icon: 'edit',
    href: '/draw-path',
    accessibility: 'Add a path',
  },
  {
    key: 'combi',
    label: 'Combi',
    icon: 'minibus',
    href: '/record-combi',
    accessibility: 'Add a combi route',
  },
];

export default function AddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { coords, permission, enable } = useDeviceLocation({ auto: true });

  return (
    <View style={styles.screen}>
      <InteractiveMap
        bottomInset={insets.bottom + 130}
        focus={coords ? 'me' : 'gaborone'}
        styleId="positron"
        userLocation={coords}
      />

      <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <SectionHeading eyebrow="Contribute" title="Add to the map" titleVariant="sectionTitle" />
      </View>

      {/* Corner toggles: one small icon per contribution type. */}
      <View style={[styles.corner, { top: insets.top + 92 }]}>
        {OPTIONS.map((option) => (
          <View key={option.key} style={styles.cornerItem}>
            <Tap
              accessibilityLabel={option.accessibility}
              onPress={() => router.push(option.href)}
              style={styles.cornerButton}>
              <Icon color={Palette.green} name={option.icon} size={19} />
            </Tap>
            <AppText color="muted" size={8} weight="semibold">
              {option.label}
            </AppText>
          </View>
        ))}

        {!coords ? (
          <View style={styles.cornerItem}>
            <Tap
              accessibilityLabel="Turn on location"
              onPress={() => void enable()}
              style={styles.cornerButton}>
              <Icon
                color={permission === 'denied' ? Palette.red : Palette.blue}
                name="locate"
                size={19}
              />
            </Tap>
            <AppText color="muted" size={8} weight="semibold">
              Locate
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <AppText color="muted" size={10} style={styles.hint}>
          {coords
            ? 'Tap an icon to pin a place where you are, or to record a path or a combi route from here.'
            : 'Turn on location so a place is pinned where you actually are.'}
        </AppText>
        <BottomNav active="add" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18 },
  corner: { position: 'absolute', right: 15, gap: 12 },
  cornerItem: { alignItems: 'center', gap: 3 },
  cornerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
    ...Shadows.round,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  hint: { paddingHorizontal: 18, paddingBottom: 4, lineHeight: 14 },
});
