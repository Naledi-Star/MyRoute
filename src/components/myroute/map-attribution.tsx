import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from './icon';
import { AppText } from './text';
import { Tap } from './ui';

import { MAP_PROVIDER, MAP_STYLES, type MapStyleId } from '@/constants/map';
import { Palette, Radius, Shadows } from '@/constants/theme';

/**
 * Attribution for the tile provider and OpenStreetMap.
 *
 * The requirement is to credit the data source, so this stays visible on the map
 * at all times and expands on tap with the full list (the chosen OpenFreeMap style
 * does not carry an `attribution` field of its own, so nothing is credited
 * automatically).
 */
export function MapAttribution({
  styleId,
  style,
}: {
  styleId: MapStyleId;
  style?: StyleProp<ViewStyle>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <View style={[styles.wrapper, style]}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <AppText weight="semibold" size={11}>
              Map attribution
            </AppText>
            <Tap accessibilityLabel="Hide map attribution" onPress={() => setExpanded(false)}>
              <Icon color={Palette.muted} name="close" size={14} />
            </Tap>
          </View>
          {MAP_PROVIDER.attribution.map((entry) => (
            <AppText color="muted" key={entry.label} size={10} style={styles.panelLine}>
              {entry.value}
            </AppText>
          ))}
          <AppText color="muted" size={10} style={styles.panelLine}>
            Style: {MAP_STYLES[styleId].label} · {MAP_PROVIDER.usage}
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <Tap
        accessibilityLabel={`Map attribution: ${MAP_PROVIDER.credit}. Tap for details.`}
        onPress={() => setExpanded(true)}>
        <View style={styles.pill}>
          <AppText color="muted" size={9}>
            {MAP_PROVIDER.credit}
          </AppText>
        </View>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'flex-start' },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: Radius.xs,
    backgroundColor: 'rgba(255,255,255,0.88)',
    ...Shadows.subtle,
  },
  panel: {
    maxWidth: 300,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: Radius.md,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.97)',
    ...Shadows.card,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  panelLine: { lineHeight: 14 },
});
