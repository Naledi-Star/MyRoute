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
import { InteractiveMap } from './interactive-map';
import { AppText } from './text';
import { PrimaryButton, Tap, TextField, TopBar } from './ui';
import { useKeyboardHeight } from './recorder/parts';

import { Palette, Radius } from '@/constants/theme';
import { placeCategories } from '@/data/myroute';
import { submitPlace, uploadPhoto } from '@/lib/api';
import { useDeviceLocation } from '@/lib/location';
import { addRequest } from '@/lib/requests';
import { addStopPhoto } from '@/lib/stop-photos';

/**
 * Adding a place, and asking the community to help find one.
 *
 * The two are different jobs and no longer share a category grid:
 *
 * - `place`   — pin where you are standing, name it, describe it, add a photo.
 * - `request` — ask neighbours for a place you cannot find, choosing its kind
 *               from a plain dropdown list.
 *
 * The pin starts at the device's own position, because "add this shop" almost
 * always means "the shop I am in front of"; tapping the map adjusts it.
 */
export function PlaceFormScreen({ mode = 'place' }: { mode?: 'place' | 'request' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Inside a form the keyboard must never sit over a field: the content is
  // padded by its height so every field can be scrolled into view.
  const keyboard = useKeyboardHeight();
  const isRequest = mode === 'request';

  const [category, setCategory] = useState(placeCategories[0].label);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // The place being added is where the contributor is standing, so the pin
  // falls back to the device position until they tap the map themselves. It is
  // derived rather than copied into state by an effect, so a moving fix never
  // triggers a render loop.
  const [pinOverride, setPinOverride] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const { coords, enable, permission } = useDeviceLocation({ auto: true });
  const pin = pinOverride ?? (!isRequest && coords ? coords : null);

  const leave = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  const addPhoto = async () => {
    setPhotoNotice(null);
    const outcome = await addStopPhoto('camera', `place-${Date.now().toString(36)}`);
    if (outcome.status === 'saved') {
      setPhotoUri(outcome.uri);
    } else if (outcome.status === 'failed') {
      setPhotoNotice(outcome.message);
    }
  };

  /**
   * Send the contribution.
   *
   * A place goes to the community database (pending review) and its photo is
   * uploaded afterwards, best-effort: the place is the contribution, the photo
   * is optional detail that must never block it. A request is kept on the device
   * so it appears under Requests → My requests immediately.
   */
  const submit = async () => {
    const placeName = name.trim();
    if (!placeName) {
      setSaveError('Give the place a name first.');
      return;
    }
    if (!pin) {
      setSaveError(
        'Drop a pin on the map, or turn on location, so the place has coordinates.',
      );
      return;
    }
    setSaving(true);
    setSaveError(null);

    if (isRequest) {
      await addRequest({
        name: placeName,
        category,
        description: description.trim(),
        latitude: pin.latitude,
        longitude: pin.longitude,
      });
      setSaving(false);
      setDone(true);
      return;
    }

    try {
      const saved = await submitPlace({
        name: placeName,
        category,
        description: description.trim(),
        area: '',
        latitude: pin.latitude,
        longitude: pin.longitude,
      });
      setQueued(saved.status === 'local');
      if (photoUri && saved.serverId) {
        try {
          await uploadPhoto(photoUri, saved.serverId, 'place');
        } catch {
          // The photo is optional and re-tryable from the place screen.
        }
      }
      setDone(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this place.');
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    if (isRequest) {
      router.navigate('/requests');
      return;
    }
    const placeName = name.trim() || 'Unnamed place';
    router.navigate({
      pathname: '/place',
      params: pin
        ? { name: placeName, lat: String(pin.latitude), lng: String(pin.longitude) }
        : { name: placeName },
    });
  };

  if (done) {
    return (
      <View style={[styles.success, { paddingTop: insets.top }]}>
        <View style={styles.successIcon}>
          <Icon color={Palette.surface} name="check" size={38} />
        </View>
        <AppText variant="pageTitle">{isRequest ? 'Request posted' : 'Place added'}</AppText>
        <AppText color="muted" style={styles.successText}>
          {isRequest
            ? 'Your request is under Requests → My requests while the community helps you find it.'
            : queued
              ? 'Saved on this device. It will be sent to the community database as soon as you are online.'
              : 'Sent to the community database for review. Once approved it appears on everyone’s map.'}
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
        title={isRequest ? 'Create request' : 'Add a place'}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 58 : 0}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 + keyboard },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.infoBanner}>
            <Icon color={Palette.green} name={isRequest ? 'request' : 'pin'} size={21} />
            <View style={styles.infoCopy}>
              <AppText color="greenDark" size={11} weight="bold">
                {isRequest
                  ? 'Not sure of the exact location?'
                  : coords
                    ? 'Pinned at your location'
                    : 'Add as much detail as you can'}
              </AppText>
              <AppText style={styles.infoText} size={9}>
                {isRequest
                  ? 'Describe what you are looking for. Botswana’s community will help verify it.'
                  : 'The pin starts where you are standing. Tap the map to adjust it.'}
              </AppText>
            </View>
          </View>

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            Name of the place
          </AppText>
          <View style={styles.standardInput}>
            <TextField onChangeText={setName} placeholder="e.g. Rotterdam Shop" value={name} />
          </View>

          {/* Requests pick a kind from a dropdown list; adding a place no longer
              asks the question at all. */}
          {isRequest ? (
            <>
              <AppText size={11} style={styles.fieldLabel} weight="bold">
                What are you looking for?
              </AppText>
              <Tap
                accessibilityLabel="Select a category"
                onPress={() => setCategoryOpen((current) => !current)}
                style={[styles.dropdown, categoryOpen && styles.dropdownOpen]}>
                <AppText size={13} style={styles.dropdownLabel} weight="semibold">
                  {category}
                </AppText>
                <Icon color={Palette.muted} name={categoryOpen ? 'arrow' : 'chevron'} size={16} />
              </Tap>
              {categoryOpen ? (
                <View style={styles.dropdownList}>
                  {placeCategories.map((item) => {
                    const active = item.label === category;
                    return (
                      <Tap
                        accessibilityLabel={item.label}
                        key={item.label}
                        onPress={() => {
                          setCategory(item.label);
                          setCategoryOpen(false);
                        }}
                        style={[styles.dropdownItem, active && styles.dropdownItemActive]}>
                        <AppText
                          color={active ? 'green' : 'ink'}
                          size={13}
                          style={styles.dropdownLabel}
                          weight={active ? 'bold' : 'regular'}>
                          {item.label}
                        </AppText>
                        {active ? <Icon color={Palette.green} name="check" size={16} /> : null}
                      </Tap>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          <AppText size={11} style={styles.fieldLabel} weight="bold">
            Where is it?
          </AppText>
          <AppText color="muted" size={9} style={styles.fieldHint}>
            {pin
              ? coords && pin.latitude === coords.latitude && pin.longitude === coords.longitude
                ? 'Pinned at your location. Tap the map to adjust.'
                : 'Pin dropped. Tap again to adjust.'
              : 'Tap the map to drop a pin, or turn on location.'}
          </AppText>
          <View style={styles.miniMap}>
            <InteractiveMap
              bottomInset={0}
              droppedPin={pin}
              focus={pin ? 'me' : 'gaborone'}
              onMapPress={setPinOverride}
              styleId="positron"
              userLocation={coords}
            />
          </View>
          {!pin && permission === 'denied' ? (
            <Tap
              accessibilityLabel="Turn on location"
              onPress={() => void enable()}
              style={styles.locationHint}>
              <Icon color={Palette.red} name="locate" size={13} />
              <AppText color="muted" size={10}>
                Location is off — turn it on to pin where you are.
              </AppText>
            </Tap>
          ) : null}

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
            Add a photo <AppText color="muted" size={11}> (optional)</AppText>
          </AppText>
          <View style={styles.photoRow}>
            {photoUri ? (
              <Tap
                accessibilityLabel="Replace photo"
                onPress={() => void addPhoto()}
                style={styles.photoTap}>
                <Image contentFit="cover" source={{ uri: photoUri }} style={styles.photo} />
              </Tap>
            ) : (
              <Tap
                accessibilityLabel="Add photo"
                onPress={() => void addPhoto()}
                style={styles.addPhoto}>
                <Icon name="camera" />
                <AppText size={9}>Add photo</AppText>
              </Tap>
            )}
            {photoUri ? (
              <Tap accessibilityLabel="Remove photo" onPress={() => setPhotoUri(null)}>
                <AppText color="muted" size={10}>
                  Remove
                </AppText>
              </Tap>
            ) : null}
          </View>
          {photoNotice ? (
            <AppText color="muted" size={10} style={styles.photoNotice}>
              {photoNotice}
            </AppText>
          ) : null}

          <PrimaryButton
            label={saving ? 'Sending…' : isRequest ? 'Submit request' : 'Add this place'}
            onPress={() => void submit()}
            style={styles.submit}
          />

          {saveError ? (
            <AppText color="red" size={11} style={styles.submitError}>
              {saveError}
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNav active={isRequest ? 'create-request' : 'add'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  flex: { flex: 1 },
  content: { paddingHorizontal: 17, paddingTop: 15 },
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
  standardInput: {
    height: 45,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdown: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#D9E0DA',
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAF8',
  },
  dropdownOpen: { borderColor: '#BFE2CB', backgroundColor: Palette.surface },
  dropdownLabel: { flex: 1 },
  dropdownList: {
    marginTop: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
  },
  dropdownItem: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownItemActive: { backgroundColor: Palette.greenSoft },
  miniMap: {
    height: 160,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
  },
  locationHint: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photoTap: { borderRadius: Radius.sm, overflow: 'hidden' },
  photo: { width: 96, height: 80, borderRadius: Radius.sm },
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
  photoNotice: { marginTop: 7, lineHeight: 14 },
  submit: { marginTop: 24 },
  submitError: { marginTop: 9, lineHeight: 15 },
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
