import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { AppText } from '@/components/myroute/text';
import {
  IconBadge,
  PrimaryButton,
  RoundButton,
  SectionHeading,
  SoftButton,
  Tap,
  TextField,
} from '@/components/myroute/ui';
import { Palette, Radius } from '@/constants/theme';
import { requestFilters } from '@/data/myroute';
import { COMMUNITY_THREAD_ID, COMMUNITY_THREAD_TITLE } from '@/lib/chat';
import { loadRequests, type SubmittedRequest } from '@/lib/requests';

/** `14:05` today, otherwise `9/10` — avoids `toLocale*` for Hermes/Android. */
function postedLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  if (date.toDateString() === now.toDateString()) {
    return `Today ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>(requestFilters[0]);
  // The filter is a plain dropdown list, not a row of chips: it shows what is
  // being listed, and only opens the options when asked.
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<SubmittedRequest[]>([]);

  // Requests are kept on this device, so a request posted a minute ago is here
  // the moment the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // A search term left in the box from a previous visit would hide the
      // request that was just posted, so the list always opens unfiltered.
      setSearch('');
      setFilterOpen(false);
      void loadRequests().then((list) => {
        if (!cancelled) {
          setRequests(list);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const visible = useMemo(() => {
    // "I can help" lists other people's requests in the community data model;
    // until that exists there is nothing to offer help on.
    if (filter === 'I can help') {
      return [];
    }
    const term = search.trim().toLowerCase();
    return requests.filter(
      (request) =>
        term.length === 0 ||
        request.name.toLowerCase().includes(term) ||
        request.description.toLowerCase().includes(term),
    );
  }, [filter, requests, search]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <SectionHeading
          action={
            <RoundButton
              accessibilityLabel="Create request"
              icon="plus"
              onPress={() => router.push('/create-request')}
              tone="green"
            />
          }
          eyebrow="Community"
          title="Requests"
          titleVariant="sectionTitle"
        />

        <View style={styles.filterBlock}>
          <Tap
            accessibilityLabel="Choose which requests to show"
            onPress={() => setFilterOpen((current) => !current)}
            style={[styles.filterField, filterOpen && styles.filterFieldOpen]}>
            <View style={styles.filterCopy}>
              <AppText color="muted" size={9}>
                Showing
              </AppText>
              <AppText size={13} weight="bold">
                {filter}
              </AppText>
            </View>
            <Icon color={Palette.muted} name={filterOpen ? 'arrow' : 'chevron'} size={16} />
          </Tap>

          {filterOpen ? (
            <View style={styles.filterList}>
              {requestFilters.map((option) => {
                const active = option === filter;
                return (
                  <Tap
                    accessibilityLabel={option}
                    key={option}
                    onPress={() => {
                      setFilter(option);
                      setFilterOpen(false);
                    }}
                    style={[styles.filterItem, active && styles.filterItemActive]}>
                    <AppText
                      color={active ? 'green' : 'ink'}
                      size={13}
                      weight={active ? 'bold' : 'regular'}>
                      {option}
                    </AppText>
                  </Tap>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.searchPill}>
          <Icon color={Palette.muted} name="search" size={18} />
          <TextField
            onChangeText={setSearch}
            placeholder="Search community requests"
            value={search}
          />
        </View>

        <View style={styles.locationHeading}>
          <View style={styles.locationCopy}>
            <Icon color={Palette.green} name="pin" size={17} />
            <AppText size={12} weight="bold">
              {filter === 'My requests' ? 'Your requests' : 'Nearby requests'}
            </AppText>
          </View>
          <AppText color="green" variant="label">
            Gaborone, Botswana
          </AppText>
        </View>

        <View style={styles.list}>
          {visible.length === 0 ? (
            <AppText color="muted" variant="small">
              {filter === 'I can help'
                ? 'Nobody has asked for help with a place you know yet.'
                : filter === 'My requests'
                  ? requests.length === 0
                    ? 'You have not posted a request yet. Post one and neighbours can help you find it.'
                    : 'No request matches that search.'
                  : 'No community requests yet. Post one and neighbours can help you find it.'}
            </AppText>
          ) : (
            visible.map((request) => (
              <Tap
                accessibilityLabel={`Open request ${request.name}`}
                key={request.id}
                onPress={() =>
                  router.push({
                    pathname: '/place',
                    params: {
                      name: request.name,
                      lat: String(request.latitude),
                      lng: String(request.longitude),
                      area: request.description || 'Requested by you',
                    },
                  })
                }
                style={styles.row}>
                <IconBadge icon="request" size={38} tone="amber" />
                <View style={styles.rowCopy}>
                  <AppText variant="name">{request.name}</AppText>
                  <AppText color="muted" size={10} numberOfLines={2}>
                    {request.description || `${request.category} · asked for by you`}
                  </AppText>
                  <AppText color="green" size={9} weight="semibold">
                    {request.category} · {postedLabel(request.createdAt)} · awaiting help
                  </AppText>
                </View>
                <Icon color={Palette.muted} name="chevron" size={17} />
              </Tap>
            ))
          )}
        </View>

        <View style={styles.cta}>
          <LinearGradient
            colors={['#F0F8F2', '#F7FBF6']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.ctaTop}>
            <Icon color={Palette.green} name="request" size={30} />
            <View style={styles.ctaCopy}>
              <AppText size={12} weight="bold">
                Don&apos;t see your place?
              </AppText>
              <AppText color="muted" style={styles.ctaText}>
                Create a request and let your community help.
              </AppText>
            </View>
          </View>
          <PrimaryButton
            label="Create request"
            onPress={() => router.push('/create-request')}
            style={styles.ctaButton}
          />
          <SoftButton
            label="Message neighbours"
            onPress={() =>
              router.push({
                pathname: '/thread',
                params: { id: COMMUNITY_THREAD_ID, title: COMMUNITY_THREAD_TITLE },
              })
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  filterBlock: { marginTop: 18 },
  filterField: {
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
  filterFieldOpen: { borderColor: '#BFE2CB', backgroundColor: Palette.surface },
  filterCopy: { flex: 1, gap: 1 },
  filterList: {
    marginTop: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
  },
  filterItem: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    justifyContent: 'center',
  },
  filterItemActive: { backgroundColor: Palette.greenSoft },
  searchPill: {
    height: 43,
    marginTop: 14,
    marginBottom: 14,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: Palette.surface,
  },
  locationHeading: {
    paddingVertical: 11,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationCopy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 8 },
  row: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: Palette.surface,
  },
  rowCopy: { flex: 1, gap: 2 },
  cta: {
    marginTop: 14,
    padding: 16,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    gap: 10,
  },
  ctaTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaCopy: { flex: 1, gap: 4 },
  ctaText: { lineHeight: 14 },
  ctaButton: { width: '100%' },
});
