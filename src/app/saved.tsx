import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/myroute/bottom-nav';
import { Icon, type IconName } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker, MapRoute } from '@/components/myroute/map-types';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  IconBadge,
  PrimaryButton,
  RoundButton,
  SectionHeading,
  Tap,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { formatDistance } from '@/lib/geo';
import { loadPaths, removePath, type SavedPath } from '@/lib/paths';
import { useDeviceLocation } from '@/lib/location';
import { loadPlaces, unsavePlace, type SavedPlace } from '@/lib/places';
import { formatDuration } from '@/lib/routing';

const PROFILE_ICON: Record<SavedPath['profile'], IconName> = {
  car: 'car',
  bike: 'bike',
  foot: 'walk',
};

const STATUS_LABEL: Record<SavedPath['status'], string> = {
  local: 'On this device',
  pending: 'Awaiting review',
  approved: 'Approved',
};

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [paths, setPaths] = useState<SavedPath[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { coords } = useDeviceLocation({ auto: true });

  const reload = useCallback(async () => {
    const [nextPaths, nextPlaces] = await Promise.all([loadPaths(), loadPlaces()]);
    setPaths(nextPaths);
    setPlaces(nextPlaces);
  }, []);

  // Reload every time the tab gains focus so a path saved in draw-path appears.
  useFocusEffect(
    useCallback(() => {
      void reload();
      setConfirmDelete(null);
    }, [reload]),
  );

  const selected = paths.find((path) => path.id === selectedId) ?? null;

  const markers: MapMarker[] = [
    ...places.map((place, index) => ({
      id: `place-${index}`,
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.name,
      tone: 'green' as const,
      kind: 'place' as const,
    })),
    ...(selected?.coordinates[0]
      ? [
          {
            id: 'path-start',
            latitude: selected.coordinates[0][1],
            longitude: selected.coordinates[0][0],
            label: `${selected.name} start`,
            tone: 'blue' as const,
            kind: 'destination' as const,
          },
        ]
      : []),
  ];

  const route: MapRoute | undefined = selected
    ? { coordinates: selected.coordinates, color: Palette.blue }
    : undefined;

  const deletePath = useCallback(
    async (id: string) => {
      setPaths(await removePath(id));
      if (selectedId === id) {
        setSelectedId(null);
      }
      setConfirmDelete(null);
    },
    [selectedId],
  );

  const deletePlace = useCallback(async (place: SavedPlace) => {
    setPlaces(await unsavePlace(place));
    setConfirmDelete(null);
  }, []);

  const isEmpty = paths.length === 0 && places.length === 0;

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
          <InteractiveMap
            bottomInset={0}
            focus="gaborone"
            markers={markers}
            route={route}
            styleId="positron"
            userLocation={coords}
          />
        </View>

        <View style={styles.summary}>
          <AppText size={14} weight="bold">
            {isEmpty
              ? 'Nothing saved yet'
              : `${paths.length} path${paths.length === 1 ? '' : 's'} · ${places.length} place${
                  places.length === 1 ? '' : 's'
                }`}
          </AppText>
          <AppText color="green" size={9}>
            {selected ? `Showing ${selected.name}` : 'Tap a path to preview it'}
          </AppText>
        </View>

        {isEmpty ? (
          <View style={styles.empty}>
            <Icon color={Palette.green} name="bookmark" size={26} />
            <AppText size={13} weight="bold" style={styles.emptyTitle}>
              Nothing saved yet
            </AppText>
            <AppText color="muted" size={11} style={styles.emptyText}>
              Save a place from its page, or draw a path to keep it here.
            </AppText>
            <View style={styles.emptyActions}>
              <PrimaryButton
                label="Find a place"
                onPress={() => router.push('/search')}
                small
                style={styles.emptyButton}
              />
              <PrimaryButton
                label="Draw a path"
                onPress={() => router.push('/draw-path')}
                small
                style={styles.emptyButton}
              />
            </View>
          </View>
        ) : (
          <>
            {paths.length > 0 ? (
              <View style={styles.section}>
                <AppText size={12} weight="bold" style={styles.sectionTitle}>
                  Your paths
                </AppText>
                {paths.map((path) => {
                  const confirming = confirmDelete === path.id;
                  const selecting = selectedId === path.id;
                  return (
                    <View key={path.id} style={styles.row}>
                      <Tap
                        accessibilityLabel={`Preview ${path.name}`}
                        onPress={() => {
                          setSelectedId(selecting ? null : path.id);
                          setConfirmDelete(null);
                        }}
                        style={styles.rowMain}>
                        <IconBadge
                          icon={PROFILE_ICON[path.profile]}
                          size={38}
                          tone={selecting ? 'blue' : 'green'}
                        />
                        <View style={styles.rowCopy}>
                          <AppText variant="name">{path.name}</AppText>
                          <AppText color="muted" variant="small">
                            {formatDistance(path.distanceMetres)} ·{' '}
                            {formatDuration(path.durationSeconds)} · {STATUS_LABEL[path.status]}
                          </AppText>
                          {confirming ? (
                            <AppText color="red" variant="tiny">
                              Tap the bin again to delete this path
                            </AppText>
                          ) : null}
                        </View>
                      </Tap>
                      <BareIconButton
                        accessibilityLabel={`Edit ${path.name}`}
                        color={Palette.muted}
                        icon="chevron"
                        onPress={() =>
                          router.push({ pathname: '/draw-path', params: { id: path.id } })
                        }
                      />
                      <BareIconButton
                        accessibilityLabel={`Delete ${path.name}`}
                        color={confirming ? Palette.red : Palette.muted}
                        icon="trash"
                        onPress={() => {
                          if (confirming) {
                            void deletePath(path.id);
                          } else {
                            setConfirmDelete(path.id);
                          }
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            ) : null}

            {places.length > 0 ? (
              <View style={styles.section}>
                <AppText size={12} weight="bold" style={styles.sectionTitle}>
                  Saved places
                </AppText>
                {places.map((place) => {
                  const key = `place:${place.savedAt}`;
                  const confirming = confirmDelete === key;
                  return (
                    <View key={key} style={styles.row}>
                      <Tap
                        accessibilityLabel={`Open ${place.name}`}
                        onPress={() => {
                          setConfirmDelete(null);
                          router.push({
                            pathname: '/place',
                            params: {
                              name: place.name,
                              lat: place.latitude,
                              lng: place.longitude,
                              area: place.area,
                            },
                          });
                        }}
                        style={styles.rowMain}>
                        <IconBadge icon={place.icon} size={38} tone={place.tone} />
                        <View style={styles.rowCopy}>
                          <AppText variant="name">{place.name}</AppText>
                          <AppText color="muted" variant="small">
                            {place.area}
                          </AppText>
                          {confirming ? (
                            <AppText color="red" variant="tiny">
                              Tap the bin again to remove this place
                            </AppText>
                          ) : null}
                        </View>
                      </Tap>
                      <BareIconButton
                        accessibilityLabel={`Remove ${place.name} from saved`}
                        color={confirming ? Palette.red : Palette.muted}
                        icon="trash"
                        onPress={() => {
                          if (confirming) {
                            void deletePlace(place);
                          } else {
                            setConfirmDelete(key);
                          }
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                label="Find a place"
                onPress={() => router.push('/search')}
                small
                style={styles.action}
              />
              <PrimaryButton
                label="Draw a path"
                onPress={() => router.push('/draw-path')}
                small
                style={styles.action}
              />
            </View>
          </>
        )}
      </ScrollView>

      <BottomNav active="combi" />
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    marginTop: 18,
    paddingVertical: 26,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CAD5CC',
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAFCF9',
    ...Shadows.card,
  },
  emptyTitle: { textAlign: 'center' },
  emptyText: { maxWidth: 260, textAlign: 'center', lineHeight: 15 },
  emptyActions: { flexDirection: 'row', marginTop: 8, gap: 8 },
  emptyButton: { flex: 1 },
  section: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  sectionTitle: { paddingVertical: 8 },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: Palette.line,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  rowCopy: { flex: 1, gap: 1 },
  actions: { flexDirection: 'row', marginTop: 18, gap: 8 },
  action: { flex: 1 },
});
