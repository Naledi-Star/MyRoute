import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { MapCanvas } from '@/components/myroute/map-canvas';
import { PlaceResultRow } from '@/components/myroute/rows';
import { AppText } from '@/components/myroute/text';
import { RoundButton, SectionHeading } from '@/components/myroute/ui';
import { Palette } from '@/constants/theme';
import { savedPlaces } from '@/data/myroute';

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}
        showsVerticalScrollIndicator={false}>
        <SectionHeading
          action={<RoundButton accessibilityLabel="More options" icon="more" />}
          eyebrow="Your places"
          title="Saved"
        />

        <View style={styles.map}>
          <MapCanvas zoom={0.7} />
        </View>

        <View style={styles.summary}>
          <AppText size={14} weight="bold">
            12 saved places
          </AppText>
          <AppText color="green" size={9}>
            Synced for offline use
          </AppText>
        </View>

        <View>
          {savedPlaces.map((place) => (
            <PlaceResultRow
              key={place.name}
              onPress={() => router.push({ pathname: '/place', params: { name: place.name } })}
              place={place}
              subtitle={`${place.area} · ${place.distance}`}
              trailing={<Icon name="bookmark" size={18} />}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  map: {
    height: 210,
    marginTop: 18,
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
  },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
