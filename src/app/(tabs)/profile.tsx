import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import { AppText } from '@/components/myroute/text';
import { Tap } from '@/components/myroute/ui';
import { Palette, Radius } from '@/constants/theme';
import { profile } from '@/data/myroute';
import { useDeviceLocation } from '@/lib/location';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coords } = useDeviceLocation({ auto: true });

  // A contributor's pins come from the backend once auth is wired. Until then
  // the map shows only the user's current position, not invented places.

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#E8F6ED', '#F8FBF8']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.hero, { paddingTop: insets.top + 30 }]}>
          <View style={styles.avatar}>
            <AppText color="white" size={22} weight="bold">
              {profile.initials}
            </AppText>
          </View>
          <AppText variant="pageTitle">{profile.name}</AppText>
          <AppText color="muted" size={11}>
            {profile.location}
          </AppText>
          <View style={styles.stats}>
            {profile.stats.map((stat, index) => (
              <View key={stat.label} style={[styles.stat, index > 0 && styles.statDivider]}>
                <AppText variant="amount">{stat.value}</AppText>
                <AppText color="muted" size={9}>
                  {stat.label}
                </AppText>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* NEW: contribution footprint */}
        <View style={styles.footprint}>
          <View style={styles.footprintHeader}>
            <AppText size={13} weight="bold">
              Your contribution footprint
            </AppText>
            <AppText color="muted" size={10}>
              Gaborone
            </AppText>
          </View>
          <View style={styles.footprintMap}>
            <InteractiveMap
              bottomInset={0}
              focus="gaborone"
              markers={[]}
              styleId="positron"
              userLocation={coords}
            />
          </View>
        </View>

        <View style={styles.menu}>
          {profile.menu.map((item) => (
            <Tap
              accessibilityLabel={item.label}
              key={item.label}
              onPress={() => {
                if (item.label === 'Offline maps') {
                  router.push('/offline');
                } else if (item.label === 'Messages') {
                  router.push('/chat');
                }
              }}
              style={styles.menuRow}>
              <View style={styles.menuIcon}>
                <Icon color={Palette.green} name={item.icon} size={19} />
              </View>
              <AppText variant="name" style={styles.menuLabel}>
                {item.label}
              </AppText>
              <Icon name="chevron" size={18} />
            </Tap>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  content: { paddingBottom: 24 },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 25,
    alignItems: 'center',
  },
  avatar: {
    width: 82,
    height: 82,
    marginBottom: 12,
    borderWidth: 5,
    borderColor: Palette.surface,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A8D4C',
  },
  stats: {
    width: '100%',
    marginTop: 22,
    flexDirection: 'row',
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: '#D4E4D8' },
  footprint: { paddingHorizontal: 16, paddingTop: 18 },
  footprintHeader: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footprintMap: {
    height: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
  },
  menu: { paddingVertical: 17, paddingHorizontal: 19 },
  menuRow: {
    minHeight: 61,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.greenSoft,
  },
  menuLabel: { flex: 1 },
});