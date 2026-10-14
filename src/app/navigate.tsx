import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/myroute/bottom-nav';
import { Icon } from '@/components/myroute/icon';
import { MapCanvas } from '@/components/myroute/map-canvas';
import { AppText } from '@/components/myroute/text';
import { RoundButton, SoftButton, Tap } from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { navigationDemo, shopImage } from '@/data/myroute';

const TURN_BANNER_HEIGHT = 115;

/** Emphasises the landmark the driver should look for. */
function InstructionText({ text }: { text: string }) {
  const [head, tail] = text.split('blue shop');
  return (
    <AppText style={styles.instructionText} variant="body">
      {head}
      <AppText color="ink" variant="body" weight="bold">
        blue shop
      </AppText>
      {tail}
    </AppText>
  );
}

export default function NavigateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [arrived, setArrived] = useState(false);
  const { place, turn, instruction } = navigationDemo;

  if (arrived) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <LinearGradient
          colors={['#07924E', '#067A42']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.arrivalBanner, { paddingTop: insets.top + 20 }]}>
          <View style={styles.arrivalCheck}>
            <Icon color={Palette.surface} name="check" />
          </View>
          <AppText color="white" size={17} weight="bold">
            You have arrived
          </AppText>
        </LinearGradient>

        <ScrollView contentContainerStyle={styles.arrivalContent}>
          <AppText variant="placeTitle">{place.name}</AppText>
          <Image contentFit="cover" source={shopImage} style={styles.arrivalImage} />
          <AppText size={16} style={styles.arrivalQuestion} weight="bold">
            Is this the correct place?
          </AppText>
          <View style={styles.arrivalActions}>
            <Tap
              accessibilityLabel="Yes, that is it"
              onPress={() => router.navigate('/')}
              style={[styles.arrivalButton, styles.yesButton]}>
              <Icon color={Palette.greenDark} name="check" size={18} />
              <AppText color="greenDark" size={13} weight="bold">
                Yes, that&apos;s it
              </AppText>
            </Tap>
            <Tap
              accessibilityLabel="No, it is not"
              onPress={() => router.push('/create-request')}
              style={[styles.arrivalButton, styles.noButton]}>
              <Icon color="#CA453B" name="close" size={18} />
              <AppText color="red" size={13} weight="bold">
                No, it&apos;s not
              </AppText>
            </Tap>
          </View>
          <Tap accessibilityLabel="Add a better photo" onPress={() => router.push('/add')}>
            <View style={styles.photoButton}>
              <Icon color={Palette.green} name="camera" size={19} />
              <AppText color="green" size={13} weight="bold">
                Add a better photo
              </AppText>
            </View>
          </Tap>
        </ScrollView>

        <BottomNav active="explore" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#069450', '#067941']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.turnBanner, { paddingTop: insets.top, height: TURN_BANNER_HEIGHT + insets.top }]}>
        <Icon color={Palette.surface} name="arrow" size={42} strokeWidth={2.2} />
        <View style={styles.turnCopy}>
          <AppText color="white" size={27} weight="bold">
            {turn.distance}
          </AppText>
          <AppText color="white" size={15}>
            {turn.instruction}
          </AppText>
        </View>
        <RoundButton
          accessibilityLabel="Exit navigation"
          icon="close"
          iconSize={19}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          tone="glass"
        />
      </LinearGradient>

      <View style={[styles.mapArea, { top: TURN_BANNER_HEIGHT + insets.top }]}>
        <MapCanvas navigation route />
      </View>

      <View style={[styles.instructionCard, { bottom: insets.bottom + 18 }]}>
        <AppText size={20} weight="bold">
          {instruction.distance}
        </AppText>
        <View style={styles.instructionContent}>
          <InstructionText text={instruction.text} />
          <Image contentFit="cover" source={shopImage} style={styles.instructionImage} />
        </View>
        <SoftButton label="Simulate arrival" onPress={() => setArrived(true)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.mapBase },
  turnBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 7,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  turnCopy: { flex: 1, gap: 2 },
  mapArea: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  instructionCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 7,
    padding: 17,
    borderRadius: Radius.xl,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  instructionContent: { marginTop: 8, marginBottom: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  instructionText: { flex: 1, fontSize: 13, lineHeight: 18 },
  instructionImage: { width: 85, height: 65, borderRadius: 10 },
  arrivalBanner: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  arrivalCheck: {
    width: 31,
    height: 31,
    borderWidth: 1,
    borderColor: Palette.surface,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 30 },
  arrivalImage: { width: '100%', height: 245, marginTop: 13, borderRadius: Radius.lg },
  arrivalQuestion: { marginTop: 22, marginBottom: 13 },
  arrivalActions: { flexDirection: 'row', gap: 10 },
  arrivalButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  yesButton: { borderColor: '#BDE1CA', backgroundColor: Palette.greenSoft },
  noButton: { borderColor: '#F1C8C3', backgroundColor: '#FFF0EE' },
  photoButton: {
    marginTop: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
});
