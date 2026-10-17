import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { InteractiveMap } from '@/components/myroute/interactive-map';
import type { MapMarker, MapRoute } from '@/components/myroute/map-types';
import {
  IconBadge,
  PrimaryButton,
  RoundButton,
  SecondaryButton,
  SectionHeading,
  Tap,
  TextField,
  TopBar,
} from '@/components/myroute/ui';
import { AppText } from '@/components/myroute/text';
import { DEFAULT_MAP_STYLE } from '@/constants/map';
import { Palette, Radius, Shadows, Tones } from '@/constants/theme';
import { placeFromParams } from '@/data/myroute';
import {
  combiRoutesFromPaths,
  planCombiJourney,
  searchCombiRoutes,
  type CombiItinerary,
  type CombiRoute,
} from '@/lib/combi';
import { fetchCommunityPaths } from '@/lib/api';
import { formatDistance } from '@/lib/geo';
import { useDeviceLocation } from '@/lib/location';
import { loadPaths } from '@/lib/paths';

/** "P13" / "P9.50" — pula has no need for trailing zeroes here. */
function formatFare(value: number | null): string {
  if (value == null) {
    return 'fare not set';
  }
  return `P${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function itinerarySummary(itinerary: CombiItinerary): string {
  const combis = `${itinerary.legs.length} combi${itinerary.legs.length === 1 ? '' : 's'}`;
  return `${combis} · ${formatFare(itinerary.totalFare)}`;
}

export default function CombiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    name?: string;
    lat?: string;
    lng?: string;
    area?: string;
  }>();

  const destination = placeFromParams({
    name: params.name,
    latitude: params.lat != null ? parseFloat(params.lat) : undefined,
    longitude: params.lng != null ? parseFloat(params.lng) : undefined,
    area: params.area,
  });

  const { coords } = useDeviceLocation({ auto: true });
  const [routes, setRoutes] = useState<CombiRoute[] | null>(null);
  const [query, setQuery] = useState('');
  const [openRouteId, setOpenRouteId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(320);

  // The combi network is the community's: routes other people recorded come from
  // the database, and anything still on this device is merged in on top (a
  // contributor sees their own pending route before it is approved). Re-read on
  // every focus so a route recorded a moment ago is here when you come back.
  const reload = useCallback(() => {
    let cancelled = false;
    void Promise.all([loadPaths(), fetchCommunityPaths()])
      .then(([local, community]) => {
        if (cancelled) {
          return;
        }
        const byId = new Map(community.map((path) => [path.id, path]));
        local.forEach((path) => byId.set(path.id, path));
        setRoutes(combiRoutesFromPaths([...byId.values()]));
      })
      .catch(() => {
        // Keep what was already on screen rather than clearing it.
        if (!cancelled) {
          setRoutes((current) => current ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(reload);

  const itineraries = useMemo(() => {
    if (!destination || !coords || !routes) {
      return [];
    }
    return planCombiJourney(coords, destination, routes);
  }, [coords, destination, routes]);

  // Search: a combi by its name, by the rank it leaves from, or by any stop it
  // serves — most people search a stop, not a route name.
  const filtered = useMemo(() => searchCombiRoutes(routes ?? [], query), [query, routes]);

  const openRoute = filtered.find((route) => route.id === openRouteId) ?? null;

  const browseMarkers = useMemo<MapMarker[]>(() => {
    // With a combi selected the pins are its stops; otherwise every searchable
    // stop in the filtered list, so the map answers "where can I board?".
    const list = openRoute ? [openRoute] : filtered;
    const pins: MapMarker[] = [];
    for (const route of list) {
      route.stops.forEach((stop, index) => {
        pins.push({
          id: `${route.id}-stop-${index}`,
          latitude: stop.latitude,
          longitude: stop.longitude,
          label: stop.name,
          tone: index === route.stops.length - 1 ? 'blue' : 'green',
          kind: 'destination',
        });
      });
    }
    return pins;
  }, [filtered, openRoute]);

  const browseLine = useMemo<MapRoute | undefined>(() => {
    if (!openRoute) {
      return undefined;
    }
    return {
      coordinates: openRoute.stops.map((stop) => [stop.longitude, stop.latitude]),
      color: Palette.blue,
    };
  }, [openRoute]);

  const active = itineraries[selected] ?? itineraries[0] ?? null;

  const routeLine = useMemo<MapRoute | undefined>(() => {
    if (!active || !coords || !destination) {
      return undefined;
    }
    const points: [number, number][] = [[coords.longitude, coords.latitude]];
    for (const leg of active.legs) {
      leg.route.stops
        .slice(leg.boardIndex, leg.alightIndex + 1)
        .forEach((stop) => points.push([stop.longitude, stop.latitude]));
    }
    points.push([destination.longitude, destination.latitude]);
    return { coordinates: points, color: Palette.blue };
  }, [active, coords, destination]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!active || !destination) {
      return [];
    }
    const pins: MapMarker[] = active.legs.map((leg, index) => ({
      id: `board-${index}`,
      latitude: leg.board.latitude,
      longitude: leg.board.longitude,
      label: leg.board.name,
      tone: index === 0 ? 'green' : 'amber',
      kind: 'request',
    }));
    const last = active.legs[active.legs.length - 1];
    pins.push({
      id: 'alight-last',
      latitude: last.alight.latitude,
      longitude: last.alight.longitude,
      label: last.alight.name,
      tone: 'blue',
      kind: 'destination',
    });
    pins.push({
      id: 'destination',
      latitude: destination.latitude,
      longitude: destination.longitude,
      label: destination.name,
      tone: 'red',
      kind: 'destination',
    });
    return pins;
  }, [active, destination]);

  const openStop = useCallback(
    (marker: MapMarker) => {
      router.push({
        pathname: '/place',
        params: {
          name: marker.label,
          lat: String(marker.latitude),
          lng: String(marker.longitude),
        },
      });
    },
    [router],
  );

  /* ── Journey planner: shown when a place handed us a destination ───────── */
  if (destination) {
    return (
      <View style={styles.screen}>
        <InteractiveMap
          bottomInset={sheetHeight}
          focus="me"
          markers={markers}
          recenterKey={0}
          route={routeLine}
          styleId={DEFAULT_MAP_STYLE}
          userLocation={coords}
        />

        <View style={styles.header}>
          <TopBar
            onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
            style={{ paddingTop: insets.top }}
            title={`Combi to ${destination.name}`}
          />
        </View>

        <View
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <AppText size={13} weight="bold">
            {routes == null
              ? 'Looking up combis…'
              : active
                ? `Option ${selected + 1} of ${itineraries.length}`
                : 'Combi route'}
          </AppText>

          {!coords ? (
            <View style={styles.notice}>
              <Icon color={Palette.blue} name="locate" size={15} />
              <AppText color="muted" size={11} style={styles.noticeText}>
                Waiting for your location — the combi you need depends on where you are standing.
              </AppText>
            </View>
          ) : null}

          {routes != null && routes.length === 0 ? (
            <View style={styles.notice}>
              <Icon color={Tones.amber.foreground} name="alert" size={15} />
              <AppText color="muted" size={11} style={styles.noticeText}>
                No combi routes have been recorded yet. Ride one, mark its stops, and save it as a
                combi route — then it is saved for everybody and can be searched here.
              </AppText>
            </View>
          ) : null}

          {routes != null && routes.length > 0 && coords && itineraries.length === 0 ? (
            <View style={styles.notice}>
              <Icon color={Tones.amber.foreground} name="alert" size={15} />
              <AppText color="muted" size={11} style={styles.noticeText}>
                None of the {routes.length} combi route{routes.length === 1 ? '' : 's'} recorded so
                far cover this trip. If you know the combi that does, record it — it will be saved
                for everyone.
              </AppText>
            </View>
          ) : null}

          {itineraries.length > 1 ? (
            <ScrollView
              contentContainerStyle={styles.optionRow}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {itineraries.map((itinerary, index) => {
                const current = index === selected;
                return (
                  <Tap
                    accessibilityLabel={itinerarySummary(itinerary)}
                    key={itinerary.legs.map((leg) => leg.route.id).join('>')}
                    onPress={() => setSelected(index)}
                    style={[styles.optionChip, current && styles.optionChipActive]}>
                    <AppText
                      color={current ? 'green' : 'muted'}
                      size={11}
                      weight={current ? 'bold' : 'semibold'}>
                      {itinerarySummary(itinerary)}
                    </AppText>
                  </Tap>
                );
              })}
            </ScrollView>
          ) : null}

          {active ? (
            <View style={styles.legs}>
              <View style={styles.legRow}>
                <Icon color={Palette.blue} name="walk" size={15} />
                <AppText color="muted" size={11} style={styles.legText}>
                  Walk {formatDistance(active.walkToBoardMetres)} to {active.legs[0].board.name}
                </AppText>
              </View>

              {active.legs.map((leg, index) => (
                <View key={`${leg.route.id}-${index}`}>
                  {index > 0 ? (
                    <View style={styles.transferRow}>
                      <Icon color={Tones.amber.foreground} name="compass" size={15} />
                      <AppText color="amber" size={11} style={styles.legText} weight="semibold">
                        Change at {leg.board.name}
                        {active.transferMetres > 1
                          ? ` · walk ${formatDistance(active.transferMetres)}`
                          : ''}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={styles.combiRow}>
                    <View style={styles.combiBadge}>
                      <AppText color="white" size={10} weight="bold">
                        {index + 1}
                      </AppText>
                    </View>
                    <View style={styles.combiCopy}>
                      <AppText size={12} weight="bold">
                        {leg.route.name}
                      </AppText>
                      <AppText color="muted" size={10}>
                        Board {leg.board.name} · get off {leg.alight.name} ·{' '}
                        {formatDistance(leg.rideMetres)}
                      </AppText>
                    </View>
                    <AppText color="green" size={11} weight="semibold">
                      {leg.fare == null ? '—' : formatFare(leg.fare)}
                    </AppText>
                  </View>
                </View>
              ))}

              <View style={styles.legRow}>
                <Icon color={Palette.blue} name="walk" size={15} />
                <AppText color="muted" size={11} style={styles.legText}>
                  Walk {formatDistance(active.walkFromAlightMetres)} to {destination.name}
                </AppText>
              </View>

              {active.totalFare == null ? (
                <AppText color="amber" size={10} style={styles.fareNote}>
                  Some stage fares are not recorded for these routes, so the total is unknown.
                </AppText>
              ) : null}
            </View>
          ) : null}

          <PrimaryButton
            label="Record the combi route you use"
            onPress={() => router.push('/draw-path')}
            style={styles.recordButton}
          />
        </View>
      </View>
    );
  }

  /* ── Browse: search the community's combis, their routes and stops ─────── */
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <SectionHeading
          action={
            <RoundButton
              accessibilityLabel="Record a combi route"
              icon="plus"
              onPress={() => router.push('/draw-path')}
            />
          }
          eyebrow="Community network"
          title="Combies"
        />

        <View style={styles.searchShell}>
          <Icon color={Palette.muted} name="search" size={18} />
          <TextField
            onChangeText={setQuery}
            placeholder="Search a combi, rank or stop"
            returnKeyType="search"
            value={query}
          />
          {query.length > 0 ? (
            <Tap accessibilityLabel="Clear search" onPress={() => setQuery('')}>
              <Icon color="#7C867F" name="close" size={16} />
            </Tap>
          ) : null}
        </View>

        <View style={styles.map}>
          <InteractiveMap
            bottomInset={0}
            focus={coords ? 'me' : 'gaborone'}
            markers={browseMarkers}
            onMarkerPress={openStop}
            route={browseLine}
            styleId="positron"
            userLocation={coords}
          />
        </View>

        <View style={styles.summary}>
          <AppText size={13} weight="bold">
            {routes == null
              ? 'Looking up combis…'
              : `${filtered.length} combi route${filtered.length === 1 ? '' : 's'}`}
          </AppText>
          <AppText color="green" size={9}>
            {openRoute
              ? `Showing ${openRoute.name}`
              : `${browseMarkers.length} stop${browseMarkers.length === 1 ? '' : 's'} on the map`}
          </AppText>
        </View>

        {routes != null && routes.length === 0 ? (
          <View style={styles.empty}>
            <Icon color={Palette.green} name="minibus" size={34} />
            <AppText size={13} weight="bold" style={styles.emptyTitle}>
              No combis recorded yet
            </AppText>
            <AppText color="muted" size={11} style={styles.emptyText}>
              Ride one, tap Add stop at each stop along the way, then save it as a combi route. It
              is saved for everybody and searchable right here.
            </AppText>
            <PrimaryButton
              label="Record a combi route"
              onPress={() => router.push('/draw-path')}
              small
              style={styles.emptyButton}
            />
          </View>
        ) : null}

        {routes != null && routes.length > 0 && filtered.length === 0 ? (
          <View style={styles.empty}>
            <Icon color={Palette.green} name="search" size={30} />
            <AppText size={13} weight="bold" style={styles.emptyTitle}>
              Nothing matches that yet
            </AppText>
            <AppText color="muted" size={11} style={styles.emptyText}>
              No combi, rank or stop called “{query.trim()}” has been recorded. Record the route
              you know and it will show up for everyone.
            </AppText>
            <PrimaryButton
              label="Record a combi route"
              onPress={() => router.push('/draw-path')}
              small
              style={styles.emptyButton}
            />
          </View>
        ) : null}

        {filtered.map((route) => {
          const open = openRouteId === route.id;
          return (
            <Tap
              accessibilityLabel={`${route.name}, ${route.stops.length} stops`}
              key={route.id}
              onPress={() => setOpenRouteId(open ? null : route.id)}
              style={[styles.routeCard, open && styles.routeCardOpen]}>
              <View style={styles.routeHeader}>
                <IconBadge icon="minibus" size={38} tone={open ? 'blue' : 'green'} />
                <View style={styles.routeCopy}>
                  <AppText variant="name">{route.name}</AppText>
                  <AppText color="muted" size={11}>
                    {route.rank ? `Leaves from ${route.rank} · ` : ''}
                    {route.stops.length} stops
                  </AppText>
                </View>
                <Icon color={open ? Palette.green : Palette.muted} name="chevron" size={17} />
              </View>

              {open ? (
                <View style={styles.stopList}>
                  {route.stops.map((stop, index) => (
                    <View key={`${route.id}-stop-${index}`} style={styles.stopRow}>
                      <Icon
                        color={Palette.green}
                        name="pin"
                        size={13}
                      />
                      <AppText numberOfLines={1} size={11} style={styles.stopName} weight="semibold">
                        {stop.name}
                      </AppText>
                      <AppText color="muted" size={10}>
                        {stop.fareFromPrevious == null
                          ? index === 0
                            ? 'start'
                            : ''
                          : `from P${stop.fareFromPrevious}`}
                      </AppText>
                    </View>
                  ))}
                  <SecondaryButton
                    label="Where to?"
                    onPress={() => router.push('/search')}
                    small
                    style={styles.whereToButton}
                  />
                </View>
              ) : null}
            </Tap>
          );
        })}

        {routes != null && routes.length > 0 ? (
          <PrimaryButton
            label="Record the combi route you use"
            onPress={() => router.push('/draw-path')}
            style={styles.recordButton}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, ...Shadows.card },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 18,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  searchShell: {
    height: 46,
    marginTop: 14,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#D9E0DA',
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F8FAF8',
  },
  map: {
    height: 190,
    marginTop: 14,
    marginBottom: 10,
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
    marginTop: 14,
    paddingVertical: 24,
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
  emptyButton: { marginTop: 8 },
  routeCard: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  routeCardOpen: { borderColor: '#BFE2CB', backgroundColor: '#FBFDFB' },
  routeHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  routeCopy: { flex: 1, gap: 1 },
  stopList: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.line,
    gap: 7,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopName: { flex: 1 },
  whereToButton: { marginTop: 4 },
  notice: {
    marginTop: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FAFCF9',
  },
  noticeText: { flex: 1, lineHeight: 15 },
  optionRow: { paddingVertical: 11, gap: 8 },
  optionChip: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: 20,
    backgroundColor: '#F7F9F7',
  },
  optionChipActive: { borderColor: '#BFE2CB', backgroundColor: Palette.greenSoft },
  legs: { marginTop: 12, gap: 9 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legText: { flex: 1, lineHeight: 15 },
  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  combiRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  combiBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.blue,
  },
  combiCopy: { flex: 1, gap: 2 },
  fareNote: { lineHeight: 14 },
  recordButton: { marginTop: 14 },
});
