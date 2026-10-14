import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './icon';
import { AppText } from './text';

import { FontFamily, Palette, Radius, Shadows, Tones, type Tone } from '@/constants/theme';

type TapProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
  hitSlop?: number;
};

/** Pressable with the wireframes' shared press feedback. */
export function Tap({ children, onPress, style, accessibilityLabel, disabled, hitSlop = 6 }: TapProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled || !onPress}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && onPress ? styles.pressed : null]}>
      {children}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  small = false,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={style}>
      <LinearGradient
        colors={['#05924E', '#067D45']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.button, styles.primary, small && styles.buttonSmall]}>
        {icon ? <Icon color={Palette.surface} name={icon} size={18} /> : null}
        <AppText color="white" variant="button">
          {label}
        </AppText>
      </LinearGradient>
    </Tap>
  );
}

export function SecondaryButton({
  label,
  icon,
  onPress,
  small = false,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={style}>
      <View style={[styles.button, styles.secondary, small && styles.buttonSmall]}>
        {icon ? <Icon name={icon} size={18} /> : null}
        <AppText variant="button">{label}</AppText>
      </View>
    </Tap>
  );
}

export function SoftButton({
  label,
  icon,
  onPress,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={style}>
      <View style={styles.soft}>
        {icon ? <Icon color={Palette.green} name={icon} size={18} /> : null}
        <AppText color="green" variant="button">
          {label}
        </AppText>
      </View>
    </Tap>
  );
}

export function SquareActionButton({
  label,
  icon,
  onPress,
  active = false,
  style,
}: {
  label: string;
  icon: IconName;
  onPress?: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={style}>
      <View style={[styles.button, styles.square, active && styles.squareActive]}>
        <Icon color={active ? Palette.green : Palette.ink} name={icon} size={19} />
        <AppText color={active ? 'green' : 'ink'} style={styles.squareLabel} variant="label">
          {label}
        </AppText>
      </View>
    </Tap>
  );
}

export function RoundButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'surface',
  size = 42,
  iconSize = 20,
  iconColor,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  tone?: 'surface' | 'green' | 'glass';
  size?: number;
  iconSize?: number;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const color = iconColor ?? (tone === 'green' ? Palette.surface : Palette.ink);
  return (
    <Tap accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>
      <View
        style={[
          styles.round,
          { width: size, height: size, borderRadius: size / 2 },
          tone === 'surface' && Shadows.round,
          tone === 'green' && styles.roundGreen,
          tone === 'glass' && styles.roundGlass,
        ]}>
        <Icon color={tone === 'glass' && !iconColor ? Palette.surface : color} name={icon} size={iconSize} />
      </View>
    </Tap>
  );
}

export function BareIconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
  color = Palette.ink,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
}) {
  return (
    <Tap accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.bare}>
      <Icon color={color} name={icon} size={size} />
    </Tap>
  );
}

export function TextButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={style}>
      <AppText color="green" style={styles.textButton} variant="button">
        {label}
      </AppText>
    </Tap>
  );
}

export function TopBar({
  title,
  onBack,
  action,
  style,
}: {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.topBar, style]}>
      <View style={styles.topSide}>
        {onBack ? <BareIconButton accessibilityLabel="Go back" icon="back" onPress={onBack} /> : null}
      </View>
      <AppText size={17} weight="bold">
        {title}
      </AppText>
      <View style={[styles.topSide, styles.topSideRight]}>{action}</View>
    </View>
  );
}

export function SheetHandle() {
  return <View style={styles.handle} />;
}

export function SectionHeading({
  eyebrow,
  title,
  titleVariant = 'sectionTitle',
  action,
}: {
  eyebrow?: string;
  title: string;
  titleVariant?: 'sectionTitle' | 'sectionTitleSmall';
  action?: ReactNode;
}) {
  return (
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        {eyebrow ? (
          <AppText color="green" variant="eyebrow">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant={titleVariant}>{title}</AppText>
      </View>
      {action}
    </View>
  );
}

export function IconBadge({
  icon,
  tone = 'green',
  size = 38,
  radius = 12,
  iconSize,
  style,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  radius?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { background, foreground } = Tones[tone];
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: radius, backgroundColor: background },
        style,
      ]}>
      <Icon color={foreground} name={icon} size={iconSize ?? Math.round(size * 0.47)} />
    </View>
  );
}

export function TextField({ style, ...rest }: TextInputProps) {
  return <TextInput placeholderTextColor="#8B958F" style={[styles.textField, style]} {...rest} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Segmented({
  options,
  value,
  onChange,
  style,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Tap
            accessibilityLabel={option}
            key={option}
            onPress={() => onChange(option)}
            style={[styles.segment, active && styles.segmentActive]}>
            <AppText color={active ? 'white' : 'ink'} style={styles.segmentLabel}>
              {option}
            </AppText>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  button: {
    minHeight: 45,
    paddingHorizontal: 18,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: 13 },
  soft: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Palette.greenSoft,
  },
  primary: { ...Shadows.green },
  secondary: {
    borderWidth: 1,
    borderColor: '#CFD8D1',
    backgroundColor: Palette.surface,
  },
  square: {
    minHeight: 45,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#DCE3DE',
    backgroundColor: Palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  squareActive: { backgroundColor: Palette.greenSoft, borderColor: '#BFE2CB' },
  squareLabel: { fontSize: 11 },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  roundGreen: { backgroundColor: Palette.green },
  roundGlass: { backgroundColor: 'rgba(22,30,25,0.48)' },
  bare: { padding: 7 },
  textButton: { paddingVertical: 6 },
  handle: {
    width: 42,
    height: 4,
    marginBottom: 17,
    borderRadius: 3,
    alignSelf: 'center',
    backgroundColor: '#D5DBD6',
  },
  topBar: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
    backgroundColor: Palette.surface,
  },
  topSide: { flex: 1 },
  topSideRight: { alignItems: 'flex-end' },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headingCopy: { gap: 3 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  textField: {
    flex: 1,
    padding: 0,
    color: Palette.ink,
    fontFamily: FontFamily.regular,
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
  },
  segmented: {
    height: 39,
    padding: 3,
    borderRadius: Radius.md,
    flexDirection: 'row',
    backgroundColor: '#F0F3F1',
  },
  segment: {
    flex: 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: Palette.green },
  segmentLabel: { fontFamily: FontFamily.semibold, fontSize: 10 },
});
