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
import { deletePathRemote, fetchMyPaths } from '@/lib/api';
import { formatDistance } from '@/lib/geo';
import { labelledEndpoints, type SavedPath } from '@/lib/paths';
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

/** "Start → End" (or the names of the first and last stop) for a path row. */
function endpointLabel(path: SavedPath): string | null {
  const points = labelledEndpoints(path.coordinates, path.waypoints ?? []);
  if (points.length < 2) {
    return null;
  }
  return `${points[0].label} → ${points[points.length - 1].label}`;
}

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [paths, setPaths] = useState<SavedPath[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { coords } = useDeviceLocation({ auto: true });

  const reload = useCallback(async () => {
    // Paths come from the database (the device's own pending uploads included),
    // not from on-device storage; the local copy is only the offline fallback.
    const [nextPaths, nextPlaces] = await Promise.all([fetchMyPaths(), loadPlaces()]);
    setPaths(nextPaths);
    setPlaces(nextPlaces);
    setError(null);
  }, []);

  // Reload every time the tab gains focus so a path saved in draw-path appears.
  useFocusEffect(
    useCallback(() => {
      void reload();
      setConfirmDelete(null);
    }, [reload]),
  );

  const selected = paths.find((path) => path.id === selectedId) ?? null;

  // Every path carries a Start and an End — the two points a route actually
  // needs — plus any stops marked in between. A path recorded without a single
  // stop gets its first and last coordinate labelled here.
  const labelPoints = selected ? labelledEndpoints(selected.coordinates, selected.waypoints ?? []) : [];

  const markers: MapMarker[] = [
    ...places.map((place, index) => ({
      id: `place-${index}`,
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.name,
      tone: 'green' as const,
      kind: 'place' as const,
    })),
    ...labelPoints.map((point) => ({
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
      label: point.label,
      tone: (point.label === 'Start' ? 'blue' : 'green') as 'blue' | 'green',
      kind: 'destination' as const,
    })),
  ];

  // The route is drawn dotted: it is a preview over the map, not a live
  // navigation line, so it should read as "this is the path" and stay visually
  // distinct from the map's own roads.
  const route: MapRoute | undefined = selected
    ? { coordinates: selected.coordinates, color: Palette.blue, dashed: true }
    : undefined;

  const deletePath = useCallback(
    async (path: SavedPath) => {
      try {
        await deletePathRemote(path);
        setPaths(await fetchMyPaths());
        if (selectedId === path.id) {
          setSelectedId(null);
        }
        setConfirmDelete(null);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not delete on the server: ${err.message}`
            : 'Could not delete this path.',
        );
      }
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
            fitRoute={selected != null}
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

        {error ? (
          <AppText color="red" size={10} style={styles.error}>
            {error}
          </AppText>
        ) : null}

        {isEmpty ? (
          <View style={styles.empty}>
            <Icon color={Palette.green} name="bookmark" size={26} />
            <AppText size={13} weight="bold" style={styles.emptyTitle}>
              Nothing saved yet
            </AppText>
            <AppText color="muted" size={11} style={styles.emptyText}>
              Save a place from its page, or draw a path to add a road or direction
              to the map.
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
                  Paths
                </AppText>
                <AppText color="muted" size={10} style={styles.sectionNote}>
                  Map data recorded by everyone — each one is on the map for all. Edit
                  or remove your own from here.
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
                          <AppText color="green" size={10} weight="semibold">
                            {endpointLabel(path) ?? 'Start → End'}
                          </AppText>
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
                            void deletePath(path);
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
  sectionNote: { paddingBottom: 8, marginTop: -4, lineHeight: 14 },
  error: { marginTop: 8, lineHeight: 14 },
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
