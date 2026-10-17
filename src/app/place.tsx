import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, useEffect } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/myroute/bottom-nav';
import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker } from '@/components/myroute/map-types';
import { DetailRow } from '@/components/myroute/rows';
import { AppText } from '@/components/myroute/text';
import {
  PrimaryButton,
  RoundButton,
  SoftButton,
  SquareActionButton,
  Tap,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { placeFromParams } from '@/data/myroute';
import { loadPlaces, savePlace, samePlace, unsavePlace, type SavedPlace } from '@/lib/places';

export default function PlaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    name?: string;
    lat?: string;
    lng?: string;
    area?: string;
  }>();

  // Places arrive from search or a submitted pin, and always carry coordinates.
  const place = useMemo(
    () =>
      placeFromParams({
        name: params.name,
        latitude: params.lat != null ? parseFloat(params.lat) : undefined,
        longitude: params.lng != null ? parseFloat(params.lng) : undefined,
        area: params.area,
      }),
    [params.area, params.lat, params.lng, params.name],
  );

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[] | null>(null);

  // The bookmark list lives on the device, so Save survives a restart and the
  // Saved tab can list it. Reload whenever this place changes.
  useEffect(() => {
    let cancelled = false;
    void loadPlaces().then((list) => {
      if (!cancelled) {
        setSavedPlaces(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [place]);

  const saved = place != null && (savedPlaces ?? []).some((item) => samePlace(item, place));

  const toggleSaved = () => {
    if (!place) {
      return;
    }
    void (saved ? unsavePlace(place) : savePlace(place)).then(setSavedPlaces);
  };

  const markers: MapMarker[] = useMemo(
    () =>
      place
        ? [
            {
              id: `place-${place.name}`,
              latitude: place.latitude,
              longitude: place.longitude,
              label: place.name,
              tone: 'green' as const,
              kind: 'place' as const,
            },
          ]
        : [],
    [place],
  );

  if (!place) {
    return (
      <View style={styles.missing}>
        <StatusBar style="dark" />
        <Icon color={Palette.green} name="map" size={40} />
        <AppText size={16} weight="bold">
          We couldn&apos;t open this place
        </AppText>
        <AppText color="muted" size={12} style={styles.missingText}>
          This place has no saved location yet. Search for it, or add it to myroute.
        </AppText>
        <PrimaryButton
          label="Search for a place"
          onPress={() => router.replace('/search')}
          style={styles.missingButton}
        />
      </View>
    );
  }

  const sharePlace = () =>
    Share.share({
      message: `${place.name} — ${place.area}. Find it on myroute.`,
    });

  const placeParams = {
    name: place.name,
    lat: String(place.latitude),
    lng: String(place.longitude),
    area: place.area,
  };

  const startDirections = () => router.push({ pathname: '/route', params: placeParams });

  // The second way to get there: whichever combis cover the trip from here.
  const startCombi = () => router.push({ pathname: '/combi', params: placeParams });

  const reportWrongLocation = () =>
    Alert.alert(
      'Report wrong location',
      'Thanks for helping. This will flag the pin for the community to re-verify.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Reported',
              'The community will check this pin. You can also drop a correct pin from the Add screen.',
            ),
        },
      ],
    );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* ── Hero photo ─────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <View style={styles.heroPhoto} />
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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* ── Title row ──────────────────────────────────────────────── */}
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

        {/* ── Community verification badge ──────────────────────────── */}
        <View style={styles.verifiedRow}>
          <View style={styles.verified}>
            <Icon color={Palette.greenDark} name="check" size={14} />
            <AppText color="greenDark" size={10} weight="semibold">
              Verified by community
            </AppText>
          </View>
          <Tap
            accessibilityLabel="Report wrong location"
            onPress={reportWrongLocation}
            style={styles.reportTap}>
            <Icon color={Palette.muted} name="alert" size={13} />
            <AppText color="muted" size={10} weight="semibold">
              Wrong location?
            </AppText>
          </Tap>
        </View>

        {/* ── Mini-map preview ──────────────────────────────────────── */}
        <View style={styles.mapPreview}>
          <InteractiveMap
            bottomInset={0}
            focus="gaborone"
            markers={markers}
            styleId="positron"
          />
          <View pointerEvents="none" style={styles.mapShade} />
        </View>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <View style={styles.actionGrid}>
          <PrimaryButton
            icon="arrow"
            label="Directions"
            onPress={startDirections}
            style={styles.directions}
          />
          <SquareActionButton
            active={saved}
            icon="bookmark"
            label={saved ? 'Saved' : 'Save'}
            onPress={toggleSaved}
            style={styles.action}
          />
          <SquareActionButton
            icon="share"
            label="Share"
            onPress={sharePlace}
            style={styles.action}
          />
        </View>

        <SoftButton
          icon="minibus"
          label="Take a combi"
          onPress={startCombi}
          style={styles.combiButton}
        />

        {/* ── Detail rows ───────────────────────────────────────────── */}
        <View style={styles.detailCard}>
          <DetailRow icon="shop" text={place.hours} title={place.category} />
          <DetailRow icon="walk" text={place.entrance} title="Entrance" />
          <DetailRow icon="pin" text={place.howToFind} title="How to find it" />
        </View>

        {/* ── Bottom help: add more info ────────────────────────────── */}
        <Tap
          accessibilityLabel="Add a photo or fix details"
          onPress={() => router.push('/add')}
          style={styles.contributeTap}>
          <View style={styles.contributeCard}>
            <View style={styles.contributeIcon}>
              <Icon color={Palette.green} name="plus" size={20} />
            </View>
            <View style={styles.contributeCopy}>
              <AppText size={13} weight="bold">
                Help improve this place
              </AppText>
              <AppText color="muted" size={11}>
                Add a photo, fix the details, or confirm the pin.
              </AppText>
            </View>
            <Icon name="chevron" size={18} />
          </View>
        </Tap>
      </ScrollView>

      <BottomNav active="place" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 9,
    backgroundColor: Palette.surface,
  },
  missingText: { textAlign: 'center', lineHeight: 17 },
  missingButton: { marginTop: 10 },

  // Hero
  hero: { height: 285, backgroundColor: Palette.soft },
  heroPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.soft,
  },
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

  // Content
  content: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 40 },

  // Title
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 },
  headingCopy: { flex: 1 },
  subtitle: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  score: { alignItems: 'flex-end' },

  // Verification row
  verifiedRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  verified: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.greenSoft,
  },
  reportTap: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Map preview
  mapPreview: {
    height: 190,
    marginTop: 16,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
    borderWidth: 1,
    borderColor: Palette.line,
    ...Shadows.subtle,
  },
  mapShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderRadius: Radius.lg,
  },

  // Action grid
  actionGrid: { flexDirection: 'row', marginTop: 18, gap: 8 },
  combiButton: { marginTop: 9, marginBottom: 18 },
  directions: { flex: 1.35 },
  action: { flex: 1 },

  // Details
  detailCard: {
    borderTopWidth: 1,
    borderTopColor: Palette.line,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
  },

  // Contribute card
  contributeTap: { marginTop: 22 },
  contributeCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F3FAF5',
  },
  contributeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.greenSoft,
  },
  contributeCopy: { flex: 1, gap: 2 },
});