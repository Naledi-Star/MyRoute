import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/myroute/bottom-nav';
import { Icon } from '@/components/myroute/icon';
import { ContributorRow, DetailRow } from '@/components/myroute/rows';
import { AppText } from '@/components/myroute/text';
import { PrimaryButton, RoundButton, SquareActionButton } from '@/components/myroute/ui';
import { Palette } from '@/constants/theme';
import { findPlace, shopImage } from '@/data/myroute';

export default function PlaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();
  const place = findPlace(params.name);
  const [saved, setSaved] = useState(false);

  const sharePlace = () =>
    Share.share({ message: `${place.name} — ${place.area}. Find it on myroute.` });

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.hero}>
        <Image contentFit="cover" source={shopImage} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(0,0,0,0.24)', 'transparent']}
          end={{ x: 0, y: 1 }}
          locations={[0, 0.45]}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <RoundButton
          accessibilityLabel="Go back"
          icon="back"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          size={41}
          style={[styles.heroLeft, { top: insets.top + 8 }]}
          tone="glass"
        />
        <RoundButton
          accessibilityLabel="More options"
          icon="more"
          size={41}
          style={[styles.heroRight, { top: insets.top + 8 }]}
          tone="glass"
        />
        <View style={styles.photoCount}>
          <AppText color="white" size={10}>
            1 / 4
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <AppText variant="placeTitle">{place.name}</AppText>
            <View style={styles.subtitle}>
              <Icon color={Palette.muted} name="pin" size={16} />
              <AppText color="muted" variant="small">
                {place.area}
              </AppText>
            </View>
          </View>
          <View style={styles.score}>
            <AppText color="amber" size={15} weight="bold">
              {place.rating}
            </AppText>
            <AppText color="muted" size={9}>
              {place.reviews}
            </AppText>
          </View>
        </View>

        <View style={styles.verified}>
          <Icon color={Palette.greenDark} name="check" size={14} />
          <AppText color="greenDark" size={10} weight="semibold">
            Verified by community
          </AppText>
        </View>

        <View style={styles.actionGrid}>
          <PrimaryButton
            icon="arrow"
            label="Directions"
            onPress={() =>
              router.push({ pathname: '/route', params: { name: place.name } })
            }
            style={styles.directions}
          />
          <SquareActionButton
            active={saved}
            icon="bookmark"
            label={saved ? 'Saved' : 'Save'}
            onPress={() => setSaved((value) => !value)}
            style={styles.action}
          />
          <SquareActionButton
            icon="share"
            label="Share"
            onPress={sharePlace}
            style={styles.action}
          />
        </View>

        <View style={styles.detailCard}>
          <DetailRow icon="shop" text={place.hours} title={place.category} />
          <DetailRow icon="walk" text={place.entrance} title="Entrance" />
          <DetailRow icon="pin" text={place.howToFind} title="How to find it" />
        </View>

        <ContributorRow initials="KM" name="Kabelo M." when="2 days ago" />
      </ScrollView>

      <BottomNav active="place" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  hero: { height: 285, backgroundColor: Palette.soft },
  heroLeft: { position: 'absolute', left: 16 },
  heroRight: { position: 'absolute', right: 16 },
  photoCount: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(20,27,23,0.65)',
  },
  content: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 30 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 },
  headingCopy: { flex: 1 },
  subtitle: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  score: { alignItems: 'flex-end' },
  verified: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.greenSoft,
  },
  actionGrid: { flexDirection: 'row', marginVertical: 18, gap: 8 },
  directions: { flex: 1.35 },
  action: { flex: 1 },
  detailCard: {
    borderTopWidth: 1,
    borderTopColor: Palette.line,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
  },
});
