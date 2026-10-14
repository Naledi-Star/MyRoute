import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from './icon';
import { AppText } from './text';

import { Palette } from '@/constants/theme';

/**
 * The wireframes draw the map with a stylised, fixed 430x828 canvas (roads,
 * water, labels, pins). Reproducing that layout in design units and scaling it
 * keeps the same proportions on every device instead of a real map tile.
 */
const DESIGN_WIDTH = 430;
const DESIGN_HEIGHT = 828;

export type MapCanvasProps = {
  /** Draws the blue route to a destination pin. */
  route?: boolean;
  /** Dashed green route (turn-by-turn view) without the place pins. */
  navigation?: boolean;
  /** Overrides the scale, used by the small map previews. */
  zoom?: number;
  style?: StyleProp<ViewStyle>;
};

export function MapCanvas({ route = false, navigation = false, zoom, style }: MapCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const scale = zoom ?? (size.width ? size.width / DESIGN_WIDTH : 1);
  const isReady = zoom != null || size.width > 0;

  return (
    <View onLayout={onLayout} pointerEvents="none" style={[styles.canvas, style]}>
      {isReady && (
        <View
          style={[
            styles.layer,
            {
              left: (size.width - DESIGN_WIDTH) / 2,
              top: (size.height - DESIGN_HEIGHT) / 2,
              transform: [{ scale }],
            },
          ]}>
          {/* Soft landmass outlines */}
          <View style={[styles.landmass, styles.landmassOne]} />
          <View style={[styles.landmass, styles.landmassTwo]} />

          {/* Water bodies */}
          <View style={[styles.water, styles.waterOne]} />
          <View style={[styles.water, styles.waterTwo]} />

          {/* Roads */}
          <View style={[styles.road, styles.roadOne]} />
          <View style={[styles.road, styles.roadTwo]} />
          <View style={[styles.road, styles.roadThree]} />
          <View style={[styles.road, styles.roadFour]} />

          {/* Neighbourhood labels */}
          <AppText color="mapLabel" style={[styles.label, styles.labelOne]} variant="mapLabel">
            CBD
          </AppText>
          <AppText color="mapLabel" style={[styles.label, styles.labelTwo]} variant="mapLabel">
            Broadhurst
          </AppText>
          <AppText color="mapLabel" style={[styles.label, styles.labelThree]} variant="mapLabel">
            Gaborone West
          </AppText>

          {route && (
            <>
              <View style={[styles.routeLine, navigation && styles.routeLineNavigation]} />
              <View style={[styles.routeLineSecond, navigation && styles.routeLineSecondNavigation]} />
            </>
          )}

          {/* Current position */}
          <View style={styles.userMarker}>
            <View style={styles.userDot} />
          </View>

          {!navigation && (
            <>
              <View style={[styles.pin, styles.pinOne]}>
                <View style={styles.pinIcon}>
                  <Icon color={Palette.surface} name="shop" size={17} />
                </View>
              </View>
              <View style={[styles.pin, styles.pinTwo]}>
                <View style={styles.pinIcon}>
                  <Icon color={Palette.surface} name="home" size={17} />
                </View>
              </View>
              <View style={[styles.pin, styles.pinThree]}>
                <View style={styles.pinIcon}>
                  <Icon color={Palette.surface} name="heart" size={17} />
                </View>
              </View>
            </>
          )}

          {route && (
            <View style={styles.destinationPin}>
              <Icon color={Palette.red} name="pin" size={30} strokeWidth={2.1} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Palette.mapBase,
  },
  layer: {
    position: 'absolute',
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  landmass: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 999,
  },
  landmassOne: {
    width: 330,
    height: 510,
    top: 70,
    left: -140,
    transform: [{ rotate: '-24deg' }],
  },
  landmassTwo: {
    width: 440,
    height: 220,
    top: 340,
    left: 80,
    transform: [{ rotate: '25deg' }],
  },
  water: {
    position: 'absolute',
    backgroundColor: Palette.mapWater,
    opacity: 0.9,
    borderRadius: 999,
  },
  waterOne: { width: 80, height: 220, top: 120, left: 400, transform: [{ rotate: '30deg' }] },
  waterTwo: { width: 35, height: 150, top: 598, left: 30, transform: [{ rotate: '-25deg' }] },
  road: {
    position: 'absolute',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(212,214,202,0.7)',
  },
  roadOne: { width: 530, top: 190, left: -30, transform: [{ rotate: '18deg' }] },
  roadTwo: { width: 520, top: 480, left: -40, transform: [{ rotate: '-13deg' }] },
  roadThree: { width: 430, top: 60, left: 120, transform: [{ rotate: '76deg' }] },
  roadFour: { width: 360, top: 380, left: 20, transform: [{ rotate: '63deg' }] },
  label: { position: 'absolute' },
  labelOne: { top: 340, left: 185 },
  labelTwo: { top: 250, right: 44 },
  labelThree: { top: 485, left: 42 },
  routeLine: {
    position: 'absolute',
    width: 190,
    height: 110,
    top: 360,
    left: 73,
    borderLeftWidth: 7,
    borderBottomWidth: 7,
    borderColor: Palette.blue,
    borderBottomLeftRadius: 28,
    transform: [{ rotate: '-12deg' }],
  },
  routeLineSecond: {
    position: 'absolute',
    width: 105,
    height: 140,
    top: 306,
    left: 229,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderColor: Palette.blue,
    borderTopRightRadius: 28,
    transform: [{ rotate: '23deg' }],
  },
  routeLineNavigation: {
    top: 210,
    borderColor: Palette.green,
    borderStyle: 'dashed',
  },
  routeLineSecondNavigation: {
    top: 160,
    borderColor: Palette.green,
    borderStyle: 'dashed',
  },
  userMarker: {
    position: 'absolute',
    width: 30,
    height: 30,
    top: 364,
    left: 206,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(39,121,232,0.2)',
  },
  userDot: {
    width: 15,
    height: 15,
    borderWidth: 3,
    borderColor: Palette.surface,
    borderRadius: 8,
    backgroundColor: Palette.blue,
  },
  pin: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderWidth: 3,
    borderColor: Palette.surface,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    backgroundColor: Palette.green,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
  },
  pinIcon: { transform: [{ rotate: '45deg' }] },
  pinOne: { top: 280, left: 60 },
  pinTwo: { top: 365, right: 50, backgroundColor: '#E69D3B' },
  pinThree: { top: 500, left: 100, backgroundColor: '#E26454' },
  destinationPin: {
    position: 'absolute',
    top: 288,
    right: 67,
  },
});
