import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from './bottom-nav';
import { Icon } from './icon';
import { MapCanvas } from './map-canvas';
import { AppText } from './text';
import { PrimaryButton, Tap, TextField, TopBar } from './ui';

import { Palette, Radius } from '@/constants/theme';
import { featuredPlace, placeCategories, shopImage } from '@/data/myroute';

const demoDescription =
  'Behind the blue house near the big tree. From the main road, take the second dirt road on the left.';

/**
 * The wireframes use one form for both entry points: adding a place and asking
 * the community to help locate one.
 */
export function PlaceFormScreen({ request = false }: { request?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState(placeCategories[0].label);
  const [name, setName] = useState(request ? '' : featuredPlace.name);
  const [description, setDescription] = useState(demoDescription);
  const [pinDropped, setPinDropped] = useState(false);
  const [done, setDone] = useState(false);

  const leave = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  const finish = () => {
    if (request) {
      router.navigate('/requests');
      return;
    }
    router.navigate({
      pathname: '/place',
      params: { name: name.trim() || featuredPlace.name },
    });
  };

  if (done) {
    return (
      <View style={[styles.success, { paddingTop: insets.top }]}>
        <View style={styles.successIcon}>
          <Icon color={Palette.surface} name="check" size={38} />
        </View>
        <AppText variant="pageTitle">{request ? 'Request posted' : 'Place added'}</AppText>
        <AppText color="muted" style={styles.successText}>
          {request
            ? 'The community can now help you locate this place.'
            : 'Thanks for making Botswana easier to explore.'}
        </AppText>
        <PrimaryButton label="Done" onPress={finish} style={styles.successButton} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar
        onBack={leave}
        style={{ paddingTop: insets.top }}
        title={request ? 'Create request' : 'Add a place'}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.infoBanner}>
            <Icon color={Palette.green} name="request" size={21} />
            <View style={styles.infoCopy}>
              <AppText color="greenDark" size={11} weight="bold">
                {request ? 'Not sure of the exact location?' : 'Help others find this place'}
              </AppText>
              <AppText style={styles.infoText} size={9}>
                Add as much detail as you can. Botswana&apos;s community will help verify it.
              </AppText>
            </View>
          </View>

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            What are you looking for?
          </AppText>
          <View style={styles.categoryGrid}>
            {placeCategories.map((item) => {
              const active = item.label === category;
              return (
                <Tap
                  accessibilityLabel={item.label}
                  key={item.label}
                  onPress={() => setCategory(item.label)}
                  style={[styles.category, active && styles.categoryActive]}>
                  <Icon color={active ? Palette.green : Palette.ink} name={item.icon} />
                  <AppText
                    color={active ? 'green' : 'ink'}
                    size={9}
                    weight={active ? 'semibold' : 'regular'}>
                    {item.label}
                  </AppText>
                </Tap>
              );
            })}
          </View>

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            Name of the place
          </AppText>
          <View style={styles.standardInput}>
            <TextField onChangeText={setName} placeholder="e.g. Rotterdam Shop" value={name} />
          </View>

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            Where is it?
          </AppText>
          <AppText color="muted" size={9} style={styles.fieldHint}>
            {pinDropped ? 'Pin dropped. Drag to fine tune.' : 'Drop a pin near the area.'}
          </AppText>
          <View style={styles.miniMap}>
            <MapCanvas zoom={0.65} />
            {pinDropped ? (
              <View style={styles.droppedPin}>
                <Icon color={Palette.red} name="pin" size={30} strokeWidth={2.1} />
              </View>
            ) : null}
            <Tap
              accessibilityLabel="Drop pin on map"
              onPress={() => setPinDropped(true)}
              style={styles.dropPin}>
              <Icon color={Palette.green} name="pin" size={17} />
              <AppText color="green" size={11} weight="bold">
                {pinDropped ? 'Pin dropped' : 'Drop pin on map'}
              </AppText>
            </Tap>
          </View>

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            Describe how to find it
          </AppText>
          <TextField
            multiline
            onChangeText={setDescription}
            style={styles.description}
            value={description}
          />

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            Add photos <AppText color="muted" size={11}> (optional)</AppText>
          </AppText>
          <View style={styles.photoRow}>
            <Image contentFit="cover" source={shopImage} style={styles.photo} />
            <View style={styles.addPhoto}>
              <Icon name="camera" />
              <AppText size={9}>Add photo</AppText>
            </View>
          </View>

          <PrimaryButton
            label={request ? 'Submit request' : 'Add this place'}
            onPress={() => setDone(true)}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNav active={request ? 'create-request' : 'add'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  flex: { flex: 1 },
  content: { paddingHorizontal: 17, paddingTop: 15, paddingBottom: 28 },
  infoBanner: {
    marginBottom: 21,
    padding: 13,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#EDF8F0',
  },
  infoCopy: { flex: 1, gap: 3 },
  infoText: { color: '#4F6959', lineHeight: 13 },
  fieldLabel: { marginTop: 17, marginBottom: 7 },
  fieldHint: { marginTop: -4, marginBottom: 9 },
  categoryGrid: { flexDirection: 'row', gap: 7 },
  category: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.surface,
  },
  categoryActive: { borderWidth: 1.5, borderColor: Palette.green, backgroundColor: '#F1FAF4' },
  standardInput: {
    height: 45,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniMap: {
    height: 160,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
  },
  droppedPin: { position: 'absolute', top: 44, alignSelf: 'center' },
  dropPin: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    height: 40,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Palette.surface,
  },
  description: {
    minHeight: 90,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    backgroundColor: Palette.surface,
    fontSize: 11,
    lineHeight: 16,
    textAlignVertical: 'top',
  },
  photoRow: { flexDirection: 'row', gap: 10 },
  photo: { width: 98, height: 82, borderRadius: Radius.sm },
  addPhoto: {
    width: 82,
    height: 82,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#BDC7BF',
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F8FAF8',
  },
  submit: { marginTop: 24 },
  success: {
    flex: 1,
    padding: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  successIcon: {
    width: 74,
    height: 74,
    marginBottom: 20,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green,
  },
  successText: { marginTop: 12, maxWidth: 280, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  successButton: { minWidth: 170, marginTop: 15 },
});
