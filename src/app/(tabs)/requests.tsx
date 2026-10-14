import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { RequestCard } from '@/components/myroute/rows';
import { AppText } from '@/components/myroute/text';
import { PrimaryButton, RoundButton, SectionHeading, Segmented, TextField } from '@/components/myroute/ui';
import { Palette, Radius } from '@/constants/theme';
import { communityRequests, requestFilters } from '@/data/myroute';

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState(requestFilters[0]);
  const [search, setSearch] = useState('');

  const visibleRequests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return communityRequests.filter((request) => {
      const matchesFilter =
        filter === 'My requests' ? request.mine : filter === 'I can help' ? request.canHelp : true;
      const matchesSearch =
        needle.length === 0 || `${request.name} ${request.detail}`.toLowerCase().includes(needle);
      return matchesFilter && matchesSearch;
    });
  }, [filter, search]);

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

        <Segmented onChange={setFilter} options={requestFilters} style={styles.segmented} value={filter} />

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
              Nearby requests
            </AppText>
          </View>
          <AppText color="green" variant="label">
            Gaborone, Botswana
          </AppText>
        </View>

        <View style={styles.list}>
          {visibleRequests.length > 0 ? (
            visibleRequests.map((request) => <RequestCard key={request.name} request={request} />)
          ) : (
            <AppText color="muted" variant="small">
              No requests match your search yet.
            </AppText>
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
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  segmented: { marginTop: 18 },
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
