import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { MapCanvas } from '@/components/myroute/map-canvas';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  PrimaryButton,
  RoundButton,
  SheetHandle,
  Tap,
  TopBar,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { findPlace, travelModes, type TravelModeKey } from '@/data/myroute';

export default function RouteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();
  const destination = findPlace(params.name);
  const [mode, setMode] = useState<TravelModeKey>('car');
  const active = travelModes.find((travel) => travel.key === mode) ?? travelModes[0];

  return (
    <View style={styles.screen}>
      <MapCanvas route />

      <View style={styles.panel}>
        <TopBar
          action={<BareIconButton accessibilityLabel="More options" icon="more" />}
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={{ paddingTop: insets.top }}
          title="Directions"
        />
        <View style={styles.routeInputs}>
          <View style={styles.routeDots}>
            <View style={styles.dotStart} />
            <View style={styles.dotLine} />
            <View style={styles.dotEnd} />
          </View>
          <View style={styles.routeFields}>
            <View style={styles.routeInput}>
              <AppText size={12}>My location</AppText>
              <Icon color={Palette.muted} name="locate" size={17} />
            </View>
            <View style={styles.routeInput}>
              <AppText numberOfLines={1} size={12}>
                {destination.name}
              </AppText>
              <Icon color={Palette.muted} name="close" size={16} />
            </View>
          </View>
        </View>
        <View style={styles.travelModes}>
          {travelModes.map((travel) => {
            const isActive = travel.key === mode;
            return (
              <Tap
                accessibilityLabel={travel.label}
                key={travel.key}
                onPress={() => setMode(travel.key)}
                style={[styles.modeButton, isActive && styles.modeButtonActive]}>
                <Icon color={isActive ? Palette.blue : '#5E6861'} name={travel.icon} size={18} />
                <AppText
                  size={11}
                  style={{ color: isActive ? Palette.blue : '#5E6861' }}
                  weight={isActive ? 'bold' : 'regular'}>
                  {travel.label}
                </AppText>
              </Tap>
            );
          })}
        </View>
      </View>

      <View style={styles.routeTime}>
        <AppText color="white" size={11} weight="bold">
          {active.summary}
        </AppText>
      </View>

      <RoundButton
        accessibilityLabel="Locate me"
        icon="locate"
        iconColor={Palette.blue}
        style={[styles.routeLocate, { bottom: insets.bottom + 205 }]}
      />

      <View style={[styles.routeSheet, { paddingBottom: insets.bottom + 20 }]}>
        <SheetHandle />
        <View style={styles.routeSummary}>
          <View style={styles.summaryCopy}>
            <AppText size={20} weight="bold">
              {active.summary}
            </AppText>
            <AppText color="muted" variant="small">
              {active.detail}
            </AppText>
          </View>
          <View style={styles.trafficNote}>
            <AppText color="green" size={11}>
              {active.note}
            </AppText>
          </View>
        </View>
        <PrimaryButton
          label="Start navigation"
          onPress={() => router.push('/navigate')}
          style={styles.startButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  routeInputs: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 8,
  },
  routeDots: { width: 20, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dotStart: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: Palette.blue,
    borderRadius: 5,
  },
  dotLine: { width: 2, height: 25, backgroundColor: '#AEB7B0' },
  dotEnd: {
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: Palette.red,
    borderRadius: 5,
    backgroundColor: Palette.red,
  },
  routeFields: { flex: 1, gap: 5 },
  routeInput: {
    height: 38,
    paddingLeft: 12,
    paddingRight: 5,
    borderRadius: Radius.sm + 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#F3F5F3',
  },
  travelModes: {
    height: 52,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Palette.line,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeButtonActive: { backgroundColor: '#EDF5FF' },
  routeTime: {
    position: 'absolute',
    top: 405,
    left: 180,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 2,
    borderColor: Palette.surface,
    borderRadius: Radius.sm,
    backgroundColor: Palette.blue,
  },
  routeLocate: { position: 'absolute', right: 16 },
  routeSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  routeSummary: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryCopy: { gap: 3 },
  trafficNote: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Palette.greenSoft,
  },
  startButton: { width: '100%' },
});
