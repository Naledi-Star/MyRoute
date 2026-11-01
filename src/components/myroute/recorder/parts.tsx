import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/myroute/icon';
import { AppText } from '@/components/myroute/text';
import { BareIconButton, SheetHandle, Tap, TextField } from '@/components/myroute/ui';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { formatDistance } from '@/lib/geo';
import type { PathWaypoint } from '@/lib/paths';

/**
 * Height of the on-screen keyboard, or 0 when it is closed.
 *
 * A React Native `Modal` renders in its own window on Android, so the window is
 * never resized when the keyboard opens and a `KeyboardAvoidingView` inside it
 * has nothing to shrink — the fields end up behind the keyboard. Reading the
 * height and lifting the sheet by exactly that much works on both platforms.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) =>
      setHeight(Math.round(event.endCoordinates.height)),
    );
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * A bottom sheet that stays above the keyboard.
 *
 * The sheet is lifted by the keyboard's height and its own maximum height is
 * reduced by the same amount, so every field inside it is reachable rather than
 * hidden under the keys.
 */
export function KeyboardSafeModal({
  children,
  onClose,
  title,
  visible,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const available = Math.max(240, Math.round(windowHeight * 0.92) - keyboard);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        {/* Both the lift and the height limit matter: lifting keeps the sheet
            above the keys, and the limit keeps a long stop list scrollable
            instead of pushing the name field off the top of the screen. */}
        <View style={[styles.modalSheet, { marginBottom: keyboard, maxHeight: available }]}>
          <View style={styles.modalHandle}>
            <SheetHandle />
          </View>
          <View style={styles.modalHeader}>
            <BareIconButton
              accessibilityLabel="Close"
              color={Palette.ink}
              icon="close"
              onPress={onClose}
            />
            <AppText size={16} weight="bold" style={styles.modalTitle}>
              {title}
            </AppText>
            <View style={styles.modalHeaderSide} />
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.modalContent,
              { paddingBottom: insets.bottom + 18 },
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The panel the recorder keeps at the bottom of the map. */
export function BottomPanel({
  bottomInset,
  children,
  maxHeight,
  onLayout,
}: {
  bottomInset: number;
  children: ReactNode;
  maxHeight?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.panel,
        { paddingBottom: bottomInset + 16 },
        maxHeight ? { maxHeight } : null,
      ]}>
      <SheetHandle />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

/** A row with a label, supporting text and a green switch. */
export function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Tap
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <AppText size={12} weight="bold">
          {label}
        </AppText>
        {description ? (
          <AppText color="muted" size={10} style={styles.toggleHint}>
            {description}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
      </View>
    </Tap>
  );
}

export type SelectOption = { key: string; label: string; icon?: IconName };

/** A conventional dropdown: one field, and a vertical list when it opens. */
export function SelectField({
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  label?: string;
  onChange: (key: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string | null;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.key === value) ?? null;

  return (
    <View>
      {label ? (
        <AppText size={11} style={styles.selectLabel} weight="bold">
          {label}
        </AppText>
      ) : null}
      <Tap
        accessibilityLabel={label ?? placeholder}
        onPress={() => setOpen((current) => !current)}
        style={[styles.select, open && styles.selectOpen]}>
        <Icon
          color={selected ? Palette.green : Palette.muted}
          name={selected?.icon ?? 'compass'}
          size={19}
        />
        <AppText
          color={selected ? 'ink' : 'muted'}
          size={13}
          style={styles.selectValue}
          weight={selected ? 'semibold' : 'regular'}>
          {selected?.label ?? placeholder}
        </AppText>
        <Icon color={Palette.muted} name={open ? 'arrow' : 'chevron'} size={16} />
      </Tap>

      {open ? (
        <View style={styles.selectList}>
          {options.map((option) => {
            const active = option.key === value;
            return (
              <Tap
                accessibilityLabel={option.label}
                key={option.key}
                onPress={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                style={[styles.selectItem, active && styles.selectItemActive]}>
                {option.icon ? (
                  <Icon color={active ? Palette.green : Palette.muted} name={option.icon} size={16} />
                ) : null}
                <AppText size={12} style={styles.selectItemLabel} weight={active ? 'bold' : 'regular'}>
                  {option.label}
                </AppText>
                {active ? <Icon color={Palette.green} name="check" size={15} /> : null}
              </Tap>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** The timer and distance while a route is being recorded. */
export function TripStats({ elapsedSeconds, metres }: { elapsedSeconds: number; metres: number }) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.stat}>
        <AppText color="muted" size={10}>
          Time
        </AppText>
        <AppText size={22} weight="bold">
          {formatClock(elapsedSeconds)}
        </AppText>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.stat}>
        <AppText color="muted" size={10}>
          Distance
        </AppText>
        <AppText size={22} weight="bold">
          {formatDistance(metres)}
        </AppText>
      </View>
    </View>
  );
}

/** The \"a stop was added\" moment, cleared by the contributor or by time. */
export function ConfirmationCard({
  body,
  children,
  onDismiss,
  title,
}: {
  body: string;
  children?: ReactNode;
  onDismiss: () => void;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.successDot}>
          <Icon color={Palette.surface} name="check" size={14} />
        </View>
        <View style={styles.cardCopy}>
          <AppText size={12} weight="bold">
            {title}
          </AppText>
          <AppText color="muted" size={10}>
            {body}
          </AppText>
        </View>
        <BareIconButton
          accessibilityLabel="Dismiss"
          color={Palette.muted}
          icon="close"
          onPress={onDismiss}
          size={16}
        />
      </View>
      {children}
    </View>
  );
}

/**
 * The stops a route is saved with, each with a name and — for a combi route —
 * an optional stage fare and an optional photo. Nothing here is ever required
 * beyond a name: a stop without a photo is still a stop.
 */
export function StopsEditor({
  emptyHint,
  onFare,
  onLabel,
  onPhoto,
  showFare = false,
  fareHelp = false,
  stops,
}: {
  emptyHint?: string;
  onFare?: (stopId: string, value: string) => void;
  onLabel: (stopId: string, value: string) => void;
  onPhoto: (stopId: string) => void;
  showFare?: boolean;
  fareHelp?: boolean;
  stops: PathWaypoint[];
}) {
  if (stops.length === 0) {
    return emptyHint ? (
      <AppText color="amber" size={10} style={styles.emptyHint}>
        {emptyHint}
      </AppText>
    ) : null;
  }

  return (
    <View style={styles.stops}>
      {stops.map((stop, index) => (
        <View key={stop.id} style={styles.stop}>
          <View style={styles.stopNameRow}>
            <AppText color="muted" size={10} style={styles.stopIndex}>
              {index + 1}
            </AppText>
            <View style={styles.stopField}>
              <TextField
                maxLength={60}
                onChangeText={(value) => onLabel(stop.id, value)}
                placeholder={`Stop ${index + 1}`}
                value={stop.label}
              />
            </View>
          </View>

          <View style={styles.stopMetaRow}>
            {showFare && onFare ? (
              <View style={styles.fareField}>
                <AppText color="muted" size={9}>
                  Fare from previous (P, optional)
                </AppText>
                <TextField
                  keyboardType="decimal-pad"
                  onChangeText={(value) => onFare(stop.id, value)}
                  placeholder="e.g. 9"
                  value={stop.fareFromPrevious == null ? '' : String(stop.fareFromPrevious)}
                />
              </View>
            ) : null}

            <Tap accessibilityLabel={`Photo for ${stop.label}`} onPress={() => onPhoto(stop.id)}>
              <View style={styles.photoAction}>
                <Icon color={Palette.green} name="camera" size={15} />
                <AppText color="green" size={10} weight="semibold">
                  {stop.photoUri ? 'Change photo' : 'Add photo'}
                </AppText>
              </View>
            </Tap>

            {stop.photoUri ? (
              <Image contentFit="cover" source={{ uri: stop.photoUri }} style={styles.photo} />
            ) : null}
          </View>
        </View>
      ))}
      {fareHelp ? (
        <AppText color="muted" size={10}>
          Every stop can carry a stage fare and a photo, but neither is needed to save the route.
        </AppText>
      ) : null}
    </View>
  );
}

/** HH:MM:SS for the recording timer. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,19,0.35)' },
  modalSheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },
  modalHandle: { alignItems: 'center', paddingTop: 8 },
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
  },
  modalTitle: { flex: 1, textAlign: 'center' },
  modalHeaderSide: { width: 36 },
  modalContent: { paddingHorizontal: 18, paddingTop: 18 },

  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 18,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Palette.surface,
    ...Shadows.sheet,
  },

  toggleRow: {
    minHeight: 54,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: { flex: 1, gap: 2 },
  toggleHint: { lineHeight: 13 },
  switch: {
    width: 44,
    height: 26,
    padding: 3,
    borderRadius: 13,
    justifyContent: 'center',
    backgroundColor: '#DDE3DE',
  },
  switchOn: { backgroundColor: Palette.green },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Palette.surface,
    ...Shadows.subtle,
  },
  switchKnobOn: { alignSelf: 'flex-end' },

  selectLabel: { marginBottom: 6 },
  select: {
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
  selectOpen: { borderColor: '#BFE2CB', backgroundColor: Palette.surface },
  selectValue: { flex: 1 },
  selectList: {
    marginTop: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    ...Shadows.card,
  },
  selectItem: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectItemActive: { backgroundColor: Palette.greenSoft },
  selectItemLabel: { flex: 1 },

  statsRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 34, backgroundColor: Palette.line },

  card: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBE7D5',
    borderRadius: Radius.md,
    gap: 10,
    backgroundColor: '#F3FAF5',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  successDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green,
  },
  cardCopy: { flex: 1, gap: 2 },

  stops: { gap: 8 },
  stop: { gap: 6, paddingVertical: 4 },
  stopNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopIndex: { width: 14, textAlign: 'center' },
  stopField: {
    flex: 1,
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  stopMetaRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  fareField: {
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
    paddingTop: 3,
    borderWidth: 1,
    borderColor: '#DCE2DD',
    borderRadius: Radius.sm,
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  photoAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  photo: { width: 40, height: 40, borderRadius: Radius.sm },
  emptyHint: { marginTop: 8, lineHeight: 14 },
});
