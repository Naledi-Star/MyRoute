import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily, Palette } from '@/constants/theme';

const textColors = {
  ink: Palette.ink,
  muted: Palette.muted,
  green: Palette.green,
  greenDark: Palette.greenDark,
  blue: Palette.blue,
  red: Palette.red,
  white: '#FFFFFF',
  mapLabel: Palette.mapLabel,
  amber: '#B46B0C',
} as const;

export type TextColor = keyof typeof textColors;

export type TextVariant =
  | 'brand'
  | 'eyebrow'
  | 'pageTitle'
  | 'sectionTitle'
  | 'sectionTitleSmall'
  | 'placeTitle'
  | 'name'
  | 'body'
  | 'small'
  | 'tiny'
  | 'label'
  | 'button'
  | 'amount'
  | 'mapLabel';

export type TextWeight = keyof typeof FontFamily;

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: TextColor;
  /** Overrides the weight of the chosen variant. */
  weight?: TextWeight;
  /** Overrides the size of the chosen variant. */
  size?: number;
};

/** Text primitive wired to the DM Sans scale used across the design. */
export function AppText({
  variant = 'body',
  color = 'ink',
  weight,
  size,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        styles[variant],
        weight ? { fontFamily: FontFamily[weight] } : null,
        size ? { fontSize: size } : null,
        { color: textColors[color] },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  brand: { fontFamily: FontFamily.bold, fontSize: 25, letterSpacing: -1, lineHeight: 30 },
  eyebrow: { fontFamily: FontFamily.bold, fontSize: 10, letterSpacing: 1.4 },
  pageTitle: { fontFamily: FontFamily.bold, fontSize: 22, letterSpacing: -0.7 },
  sectionTitle: { fontFamily: FontFamily.bold, fontSize: 22, letterSpacing: -0.7 },
  sectionTitleSmall: { fontFamily: FontFamily.bold, fontSize: 17 },
  placeTitle: { fontFamily: FontFamily.bold, fontSize: 23, letterSpacing: -0.7 },
  name: { fontFamily: FontFamily.bold, fontSize: 13 },
  body: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 17 },
  small: { fontFamily: FontFamily.regular, fontSize: 11, lineHeight: 16 },
  tiny: { fontFamily: FontFamily.regular, fontSize: 9, lineHeight: 13 },
  label: { fontFamily: FontFamily.bold, fontSize: 11 },
  button: { fontFamily: FontFamily.bold, fontSize: 13 },
  amount: { fontFamily: FontFamily.bold, fontSize: 18 },
  mapLabel: { fontFamily: FontFamily.semibold, fontSize: 10, letterSpacing: 0.2 },
});
