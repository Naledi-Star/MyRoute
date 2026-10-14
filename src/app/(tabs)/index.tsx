import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapFocus } from '@/components/myroute/map-types';
import { CategoryTile, FeaturedPlaceCard } from '@/components/myroute/rows';
import { AppText } from '@/components/myroute/text';
import { RoundButton, SectionHeading, SheetHandle, Tap, TextButton } from '@/components/myroute/ui';
import { DEFAULT_MAP_STYLE, MAP_STYLE_ORDER, MAP_STYLES, type MapStyleId } from '@/constants/map';
import { Palette, Radius, Shadows, type Tone } from '@/constants/theme';
import { exploreCategories, featuredPlace, shopImage } from '@/data/myroute';

const categoryTones: Tone[] = ['green', 'peach', 'amber', 'blue'];

function QuickPill({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: 'green' | 'amber';
  onPress?: () => void;
}) {
  const colors = tone === 'amber' ? { fg: '#B26B13', bg: '#FFF0D9' } : { fg: Palette.green, bg: Palette.greenSoft };
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={styles.quickPill}>
      <View style={[styles.quickDot, { backgroundColor: colors.bg }]}>
        <Icon color={colors.fg} name={icon} size={16} />
      </View>
      <AppText size={12} weight="semibold">
        {label}
      </AppText>
    </Tap>
  );
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sheetHeight, setSheetHeight] = useState(281);
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(DEFAULT_MAP_STYLE);
  const [mapFocus, setMapFocus] = useState<MapFocus>('gaborone');

  const measureSheet = (event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height);
  };

  const cycleMapStyle = () => {
    const next = (MAP_STYLE_ORDER.indexOf(mapStyleId) + 1) % MAP_STYLE_ORDER.length;
    setMapStyleId(MAP_STYLE_ORDER[next]);
  };

  const showCountry = mapFocus === 'botswana';

  return (
    <View style={styles.screen}>
      <InteractiveMap bottomInset={sheetHeight} focus={mapFocus} styleId={mapStyleId} />

      <View
        pointerEvents="box-none"
        style={[styles.floatingHeader, { paddingTop: insets.top + 14 }]}>
        <View style={styles.brandRow}>
          <AppText variant="brand">
            my
            <AppText color="green" variant="brand">
              route
            </AppText>
          </AppText>
          <View>
            <RoundButton
              accessibilityLabel="Community notifications"
              icon="bell"
              onPress={() => router.navigate('/requests')}
            />
            <View style={styles.notificationDot} />
          </View>
        </View>

        <Tap
          accessibilityLabel="Search for a place"
          onPress={() => router.push('/search')}
          style={styles.searchTrigger}>
          <Icon color={Palette.muted} name="search" size={20} />
          <AppText color="muted" size={14}>
            Where would you like to go?
          </AppText>
        </Tap>

        <ScrollView
          contentContainerStyle={styles.quickRow}
          horizontal
          showsHorizontalScrollIndicator={false}>
          <QuickPill icon="home" label="Home" onPress={() => router.push('/route')} />
          <QuickPill icon="shop" label="Work" onPress={() => router.push('/route')} tone="amber" />
          <QuickPill
            icon="bookmark"
            label="Saved"
            onPress={() => router.navigate('/saved')}
          />
        </ScrollView>
      </View>

      <View pointerEvents="box-none" style={[styles.mapActions, { bottom: sheetHeight + 12 }]}>
        <RoundButton
          accessibilityLabel={`Map style: ${MAP_STYLES[mapStyleId].label}. Switch map style`}
          icon="layers"
          onPress={cycleMapStyle}
        />
        <RoundButton
          accessibilityLabel={
            showCountry ? 'Zoom back to Gaborone' : 'Show the whole of Botswana'
          }
          icon="map"
          onPress={() => setMapFocus(showCountry ? 'gaborone' : 'botswana')}
        />
        <RoundButton
          accessibilityLabel="Recentre the map on Gaborone"
          icon="locate"
          iconColor={Palette.blue}
          onPress={() => setMapFocus('gaborone')}
        />
      </View>

      <View onLayout={measureSheet} style={styles.sheet}>
        <SheetHandle />
        <SectionHeading
          action={<TextButton label="See all" onPress={() => router.push('/search')} />}
          eyebrow="Near you"
          title="Explore Gaborone"
        />
        <View style={styles.categoryRow}>
          {exploreCategories.map((category, index) => (
            <CategoryTile
              icon={category.icon}
              key={category.label}
              label={category.label}
              onPress={() => router.push('/search')}
              tone={categoryTones[index]}
            />
          ))}
        </View>
        <FeaturedPlaceCard
          image={shopImage}
          onPress={() =>
            router.push({ pathname: '/place', params: { name: featuredPlace.name } })
          }
          place={featuredPlace}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: Palette.surface,
    borderRadius: 4,
    backgroundColor: '#F05A45',
  },
  searchTrigger: {
    height: 52,
    marginTop: 17,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(207,216,209,0.9)',
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  quickRow: { paddingVertical: 12, gap: 8 },
  quickPill: {
    height: 36,
    paddingLeft: 8,
    paddingRight: 13,
    borderWidth: 1,
    borderColor: '#DCE3DD',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  quickDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapActions: { position: 'absolute', right: 15, gap: 10 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  categoryRow: { flexDirection: 'row', marginVertical: 18, gap: 8 },
});
