import { Image, type ImageProps } from 'expo-image';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icon';
import { AppText } from './text';
import { IconBadge, Tap } from './ui';

import { Palette, Radius, Shadows, type Tone } from '@/constants/theme';
import type { CommunityRequest, Place } from '@/data/myroute';

export function ListRow({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  onPress,
  trailing,
  iconSize = 19,
  style,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  tone?: Tone;
  onPress?: () => void;
  trailing?: ReactNode;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={title} onPress={onPress} style={[styles.listRow, style]}>
      <IconBadge icon={icon} iconSize={iconSize} size={38} tone={tone} />
      <View style={styles.copy}>
        <AppText variant="name">{title}</AppText>
        {subtitle ? (
          <AppText color="muted" variant="small">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </Tap>
  );
}

export function PlaceResultRow({
  place,
  subtitle,
  onPress,
  trailing,
  style,
}: {
  place: Place;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap accessibilityLabel={place.name} onPress={onPress} style={[styles.placeResult, style]}>
      <IconBadge icon={place.icon} radius={15} size={47} tone={place.tone} />
      <View style={styles.copy}>
        <AppText variant="name">{place.name}</AppText>
        <AppText color="muted" variant="small">
          {subtitle ?? `${place.category} · ${place.area}`}
        </AppText>
      </View>
      {trailing ?? (
        <AppText color="muted" variant="small">
          {place.distance}
        </AppText>
      )}
    </Tap>
  );
}

export function RequestCard({ request }: { request: CommunityRequest }) {
  return (
    <View style={styles.requestCard}>
      <IconBadge icon={request.icon} radius={21} size={42} tone={request.tone} />
      <View style={styles.requestCopy}>
        <View style={styles.requestName}>
          <AppText variant="name">{request.name}</AppText>
          <AppText color="muted" variant="tiny">
            {request.time}
          </AppText>
        </View>
        <AppText style={styles.requestDetail}>{request.detail}</AppText>
        <AppText color="muted" variant="tiny">
          {request.meta}
        </AppText>
      </View>
      {request.urgent ? (
        <AppText color="red" size={8} style={styles.urgent} weight="bold">
          Urgent
        </AppText>
      ) : null}
    </View>
  );
}

export function DetailRow({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Icon color={Palette.green} name={icon} size={19} />
      </View>
      <View style={styles.detailCopy}>
        <AppText size={12} weight="bold">
          {title}
        </AppText>
        <AppText size={11} style={styles.detailText}>
          {text}
        </AppText>
      </View>
    </View>
  );
}

export function ContributorRow({
  initials,
  name,
  when,
}: {
  initials: string;
  name: string;
  when: string;
}) {
  return (
    <View style={styles.contributor}>
      <View style={styles.avatar}>
        <AppText color="white" size={10} weight="bold">
          {initials}
        </AppText>
      </View>
      <View style={styles.copy}>
        <AppText color="muted" variant="tiny">
          Added by
        </AppText>
        <AppText variant="label">{name}</AppText>
      </View>
      <AppText color="muted" variant="small">
        {when}
      </AppText>
    </View>
  );
}

export function CategoryTile({
  icon,
  label,
  tone = 'green',
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: Tone;
  onPress?: () => void;
}) {
  return (
    <Tap accessibilityLabel={label} onPress={onPress} style={styles.category}>
      <IconBadge icon={icon} iconSize={21} radius={16} size={46} tone={tone} />
      <AppText size={11} weight="semibold">
        {label}
      </AppText>
    </Tap>
  );
}

export function FeaturedPlaceCard({
  place,
  image,
  onPress,
}: {
  place: Place;
  image: ImageProps['source'];
  onPress?: () => void;
}) {
  return (
    <Tap accessibilityLabel={place.name} onPress={onPress} style={styles.featured}>
      <Image contentFit="cover" source={image} style={styles.featuredImage} />
      <View style={styles.copy}>
        <View style={styles.featuredTop}>
          <AppText numberOfLines={1} size={14} style={styles.featuredTitle} weight="bold">
            {place.name}
          </AppText>
          <AppText color="amber" size={12} weight="bold">
            {place.rating}
          </AppText>
        </View>
        <AppText color="muted" variant="small">
          {place.meta}
        </AppText>
      </View>
      <Icon name="chevron" size={18} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  listRow: {
    minHeight: 61,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  placeResult: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  copy: { flex: 1, gap: 3 },
  requestCard: {
    position: 'relative',
    padding: 13,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: 15,
    backgroundColor: Palette.surface,
    flexDirection: 'row',
    gap: 11,
    ...Shadows.subtle,
  },
  requestCopy: { flex: 1, gap: 6 },
  requestName: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  requestDetail: { paddingRight: 15, lineHeight: 15 },
  urgent: { position: 'absolute', right: 10, bottom: 12 },
  detailRow: {
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1EF',
  },
  detailIcon: { width: 30, alignItems: 'center' },
  detailCopy: { flex: 1, gap: 3 },
  detailText: { color: '#4F5B54', lineHeight: 16 },
  contributor: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C6950',
  },
  category: { flex: 1, alignItems: 'center', gap: 6 },
  featured: {
    padding: 8,
    borderWidth: 1,
    borderColor: Palette.line,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  featuredImage: { width: 74, height: 62, borderRadius: 11 },
  featuredTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featuredTitle: { flex: 1 },
});
