import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { ListRow, PlaceResultRow } from '@/components/myroute/rows';
import { AppText } from '@/components/myroute/text';
import {
  BareIconButton,
  PrimaryButton,
  SecondaryButton,
  Tap,
  TextField,
} from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { places, recentSearches } from '@/data/myroute';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const trimmed = query.trim();
  const matches = useMemo(() => {
    const needle = trimmed.toLowerCase();
    return places.filter((place) => `${place.name} ${place.area}`.toLowerCase().includes(needle));
  }, [trimmed]);

  const askingForRotterdam = trimmed.toLowerCase().includes('rotterdam');
  const results = matches.length > 0 ? matches : places.slice(0, 1);

  const openPlace = (name: string) => router.push({ pathname: '/place', params: { name } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.searchBar}>
        <BareIconButton
          accessibilityLabel="Go back"
          icon="back"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        />
        <View style={styles.inputShell}>
          <Icon color={Palette.muted} name="search" size={19} />
          <TextField
            autoFocus
            onChangeText={setQuery}
            placeholder="Search a place or address"
            returnKeyType="search"
            value={query}
          />
          {query.length > 0 ? (
            <Tap
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              style={styles.clearButton}>
              <Icon color="#7C867F" name="close" size={16} />
            </Tap>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {trimmed.length === 0 ? (
          <>
            <View style={styles.recentHeading}>
              <AppText variant="sectionTitleSmall">Recent searches</AppText>
            </View>
            {recentSearches.map((item) => (
              <ListRow
                icon="search"
                key={item}
                onPress={() => setQuery(item)}
                subtitle="Gaborone, Botswana"
                title={item}
                trailing={<Icon name="arrow" size={17} />}
              />
            ))}
            <Tap
              accessibilityLabel="Browse popular places"
              onPress={() => router.navigate('/')}
              style={styles.discoverBanner}>
              <LinearGradient
                colors={['#E6F5EB', '#F2F8ED']}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.discoverIcon}>
                <Icon color={Palette.surface} name="compass" />
              </View>
              <View style={styles.discoverCopy}>
                <AppText size={13} weight="bold">
                  Discover something new
                </AppText>
                <AppText color="muted" variant="small">
                  Browse popular places around you
                </AppText>
              </View>
              <Icon name="chevron" size={18} />
            </Tap>
          </>
        ) : (
          <>
            <AppText color="muted" style={styles.resultCount} variant="small">
              {matches.length || 1} places found
            </AppText>
            {results.map((place) => {
              const name = askingForRotterdam ? 'Rotterdam Shop' : place.name;
              return (
                <PlaceResultRow
                  key={place.name}
                  onPress={() => openPlace(name)}
                  place={askingForRotterdam ? { ...place, name } : place}
                />
              );
            })}
            {askingForRotterdam ? (
              <View style={styles.missing}>
                <Icon color={Palette.green} name="map" size={38} />
                <AppText size={13} weight="bold" style={styles.missingTitle}>
                  Can&apos;t find the exact place?
                </AppText>
                <AppText color="muted" style={styles.missingText}>
                  Add it to myroute or ask the community for help.
                </AppText>
                <View style={styles.missingActions}>
                  <PrimaryButton
                    label="Add place"
                    onPress={() => router.push('/add')}
                    small
                    style={styles.missingButton}
                  />
                  <SecondaryButton
                    label="Ask community"
                    onPress={() => router.push('/create-request')}
                    small
                    style={styles.missingButton}
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  searchBar: {
    paddingLeft: 9,
    paddingRight: 14,
    paddingBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
  },
  inputShell: {
    flex: 1,
    height: 47,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D9E0DA',
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F8FAF8',
  },
  clearButton: {
    padding: 4,
    borderRadius: Radius.round,
    backgroundColor: '#E7EBE8',
  },
  body: { paddingHorizontal: 18, paddingVertical: 20, paddingBottom: 40 },
  recentHeading: { marginBottom: 8 },
  discoverBanner: {
    marginTop: 26,
    padding: 16,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  discoverIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green,
  },
  discoverCopy: { flex: 1, gap: 3 },
  resultCount: { marginBottom: 9 },
  missing: {
    marginTop: 25,
    paddingHorizontal: 14,
    paddingVertical: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CAD5CC',
    borderRadius: 18,
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FAFCF9',
    ...Shadows.card,
  },
  missingTitle: { textAlign: 'center' },
  missingText: { maxWidth: 250, textAlign: 'center' },
  missingActions: { flexDirection: 'row', marginTop: 9, gap: 8 },
  missingButton: { flex: 1 },
});
