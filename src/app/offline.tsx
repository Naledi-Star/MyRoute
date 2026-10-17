import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/myroute/icon';
import { AppText } from '@/components/myroute/text';
import { PrimaryButton, Tap, TopBar } from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import {
  OFFLINE_REGIONS,
  deleteOfflineRegion,
  downloadRegion,
  listOfflineRegions,
  type OfflineDownloadStatus,
} from '@/lib/offline';

export default function OfflineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [packs, setPacks] = useState<OfflineDownloadStatus[]>([]);
  const [busyRegion, setBusyRegion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPacks(await listOfflineRegions());
  }, []);

  useEffect(() => {
    let active = true;
    listOfflineRegions().then((regions) => {
      if (active) {
        setPacks(regions);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const start = useCallback(
    async (regionId: string) => {
      const region = OFFLINE_REGIONS.find((item) => item.id === regionId);
      if (!region) {
        return;
      }
      setBusyRegion(regionId);
      setError(null);
      try {
        await downloadRegion(region, (status) => {
          setPacks((current) => {
            const others = current.filter((pack) => pack.regionId !== status.regionId);
            return [...others, status];
          });
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the download.');
      } finally {
        setBusyRegion(null);
        void refresh();
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteOfflineRegion(id);
      await refresh();
    },
    [refresh],
  );

  const statusFor = (regionId: string) => packs.find((pack) => pack.regionId === regionId);

  return (
    <View style={styles.screen}>
      <TopBar
        onBack={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        style={{ paddingTop: insets.top }}
        title="Offline maps"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Icon color={Palette.green} name="map" size={20} />
          <AppText color="greenDark" size={11} style={styles.bannerText}>
            Downloaded regions keep working without a connection. Each region is kept small to stay
            within the free tile provider&apos;s offline limit.
          </AppText>
        </View>

        {error ? (
          <AppText color="red" size={12} style={styles.error}>
            {error}
          </AppText>
        ) : null}

        {OFFLINE_REGIONS.map((region) => {
          const status = statusFor(region.id);
          const complete = status?.state === 'complete';
          const active = status?.state === 'active';
          const percentage = Math.round((status?.percentage ?? 0) * 100);

          return (
            <View key={region.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <AppText size={14} weight="bold">
                  {region.name}
                </AppText>
                <AppText color="muted" variant="small">
                  {complete
                    ? 'Available offline'
                    : active
                      ? `Downloading… ${percentage}%`
                      : 'Not downloaded'}
                </AppText>
              </View>

              {complete && status ? (
                <Tap
                  accessibilityLabel={`Delete ${region.name} offline map`}
                  onPress={() => void remove(status.id)}
                  style={styles.smallAction}>
                  <Icon color={Palette.red} name="close" size={16} />
                  <AppText color="red" size={11} weight="semibold">
                    Remove
                  </AppText>
                </Tap>
              ) : (
                <PrimaryButton
                  label={busyRegion === region.id || active ? 'Downloading…' : 'Download'}
                  onPress={() => void start(region.id)}
                  small
                  style={styles.download}
                />
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surface },
  content: { paddingHorizontal: 18, paddingVertical: 18, paddingBottom: 40 },
  banner: {
    marginBottom: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#EDF8F0',
  },
  bannerText: { flex: 1, lineHeight: 15 },
  error: { marginBottom: 12 },
  row: {
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Palette.surface,
    ...Shadows.subtle,
  },
  rowCopy: { flex: 1, gap: 3 },
  download: { minWidth: 116 },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
});
