import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';
import { Surface } from './Surface';
import { Text } from './Text';

export type ScoreCardProps = {
  title: string;
  composer?: string;
  /** Top-staff crop of page 1 (file:// URI). Falls back to a drawn placeholder. */
  coverUri?: string;
  favorite?: boolean;
  annotated?: boolean;
  inSetlist?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
};

/** Cover aspect: the top ~60% of a portrait page — enough to see title + first systems. */
export const COVER_ASPECT = 0.8;

export const ScoreCard = memo(function ScoreCardImpl({
  title,
  composer,
  coverUri,
  favorite,
  annotated,
  inSetlist,
  onPress,
  onLongPress,
  selected,
}: ScoreCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const badges: IconName[] = [];
  if (favorite) badges.push('star');
  if (annotated) badges.push('pencil-simple');
  if (inSetlist) badges.push('playlist');

  return (
    <Surface
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[title, composer, favorite && t('library.badges.favorite'), annotated && t('library.badges.annotated'), inSetlist && t('library.badges.inSetlist')]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ selected }}
      style={styles.card}
    >
      <View
        style={[
          styles.cover,
          { backgroundColor: '#FFFEFB', borderColor: selected ? colors.accent : colors.borderSubtle, borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth * 2 },
        ]}
      >
        {coverUri ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <CoverPlaceholder />}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.coverDim }]} />
        {selected && (
          <View style={[styles.check, { backgroundColor: colors.accent }]}>
            <Icon name="check" size={16} color="onAccent" />
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text variant="titleS" numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.subRow}>
          {composer ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.composer}>
              {composer}
            </Text>
          ) : (
            <View style={styles.composer} />
          )}
          {badges.map(b => (
            <Icon key={b} name={b} weight="fill" size={14} color={b === 'star' ? 'accent' : 'textTertiary'} />
          ))}
        </View>
      </View>
    </Surface>
  );
});

/** Stand-in "engraving": title rule + staves. Used before thumbnails exist and in the showcase. */
function CoverPlaceholder() {
  const staff = (y: number) => `M14 ${y}h72M14 ${y + 3}h72M14 ${y + 6}h72M14 ${y + 9}h72M14 ${y + 12}h72`;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 125" preserveAspectRatio="xMidYMin slice">
      <Rect x="32" y="12" width="36" height="4" rx="2" fill="#2A2926" opacity={0.8} />
      <Rect x="62" y="20" width="24" height="2.5" rx="1.25" fill="#2A2926" opacity={0.45} />
      <Path d={`${staff(32)} ${staff(56)} ${staff(80)} ${staff(104)}`} stroke="#2A2926" strokeWidth={0.6} opacity={0.55} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space.xs },
  cover: { aspectRatio: COVER_ASPECT, borderRadius: radius.sm + 2, overflow: 'hidden' },
  check: { position: 'absolute', top: space.sm, right: space.sm, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meta: { paddingTop: space.sm, paddingHorizontal: 2, gap: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 17 },
  composer: { flex: 1 },
});
