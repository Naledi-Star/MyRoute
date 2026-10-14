import type { ViewStyle } from 'react-native';

/**
 * myroute design tokens.
 *
 * These mirror the custom properties of the wireframes in `Design/src/index.css`,
 * so the mobile screens match the agreed design. The app is light-only, so the
 * screens style themselves from this single palette.
 */
export const Palette = {
  green: '#078C4B',
  greenDark: '#056F3C',
  greenSoft: '#E8F6ED',
  ink: '#17211B',
  muted: '#68736C',
  line: '#E3E8E4',
  surface: '#FFFFFF',
  soft: '#F5F7F5',
  red: '#E84C3D',
  blue: '#2779E8',
  /** Stylised map surface used by the wireframes. */
  mapBase: '#E8EADF',
  mapWater: '#CAE8ED',
  mapLabel: '#819086',
} as const;

/** DM Sans weights loaded in `src/app/_layout.tsx`. */
export const FontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

export const Radius = {
  xs: 8,
  sm: 10,
  md: 13,
  lg: 16,
  xl: 22,
  sheet: 25,
  round: 999,
} as const;

/** Tints used by result icons, category tiles and community requests. */
export const Tones = {
  neutral: { foreground: '#67746C', background: '#F0F3F1' },
  peach: { foreground: '#D86242', background: '#FFEBE5' },
  blue: { foreground: '#347AD8', background: '#E8F1FF' },
  green: { foreground: Palette.green, background: Palette.greenSoft },
  amber: { foreground: '#CA821F', background: '#FFF3DC' },
  red: { foreground: '#CF4F3D', background: '#FEE9E5' },
} as const;

export type Tone = keyof typeof Tones;

export const Shadows: Record<'card' | 'subtle' | 'round' | 'sheet' | 'bar' | 'green', ViewStyle> = {
  card: {
    shadowColor: '#2D4133',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 4,
  },
  subtle: {
    shadowColor: '#17211B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  round: {
    shadowColor: '#17211B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 3,
  },
  sheet: {
    shadowColor: '#17211B',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.12,
    shadowRadius: 35,
    elevation: 12,
  },
  bar: {
    shadowColor: '#17211B',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 10,
  },
  green: {
    shadowColor: Palette.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
};
