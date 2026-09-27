import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Sheet, Surface, Text } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { elevation, minTouch, radius, space, useTheme } from '@/ui/theme';

/** Last page of a song in a setlist: where the next pedal press goes. Tapping it goes there too. */
export function NextSongPill({ title, bottom, onPress }: { title: string; bottom: number; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.pillWrap, { bottom }]} pointerEvents="box-none">
      <Surface
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('setlistPlay.nextA11y', { title })}
        style={[styles.pill, elevation.mid, { backgroundColor: colors.inverseSurface }]}
      >
        <Text variant="labelSmall" style={{ color: colors.inverseAccent }}>
          {t('setlistPlay.next').toUpperCase()}
        </Text>
        <Text variant="label" numberOfLines={1} style={[styles.pillTitle, { color: colors.onInverseSurface }]}>
          {title}
        </Text>
        <Icon name="arrow-right" size={18} tint={colors.onInverseSurface} />
      </Surface>
    </Animated.View>
  );
}

export type JumpListSong = { key: string; title: string; subtitle: string | null; missing: boolean };

/** The setlist at a glance while playing: jump to any song. */
export function SetlistJumpSheet({
  visible,
  name,
  songs,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  name: string;
  songs: JumpListSong[];
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={name}>
      <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
        {songs.map((s, i) => {
          const active = i === current;
          return (
            <Surface
              key={s.key}
              onPress={() => {
                onClose();
                if (!s.missing) onPick(i);
              }}
              disabled={s.missing}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: s.missing }}
              accessibilityLabel={`${i + 1}. ${s.title}${s.missing ? `, ${t('setlists.missing')}` : ''}`}
              style={[styles.row, active && { backgroundColor: colors.accentContainer }]}
            >
              <Text variant="numeric" color={active ? 'onAccentContainer' : 'textTertiary'} style={styles.num}>
                {i + 1}
              </Text>
              <View style={styles.rowText}>
                <Text variant="bodyStrong" numberOfLines={1} color={s.missing ? 'textTertiary' : active ? 'onAccentContainer' : 'textPrimary'}>
                  {s.title}
                </Text>
                {(s.missing || s.subtitle) && (
                  <Text variant="caption" numberOfLines={1} color={s.missing ? 'danger' : 'textSecondary'}>
                    {s.missing ? t('setlists.missing') : s.subtitle}
                  </Text>
                )}
              </View>
              {active && <Icon name="play" weight="fill" size={18} color="onAccentContainer" />}
            </Surface>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pillWrap: { position: 'absolute', right: space.lg, maxWidth: 420 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: minTouch, paddingHorizontal: space.lg, borderRadius: radius.pill },
  pillTitle: { flexShrink: 1 },
  list: { maxHeight: 560 },
  listBody: { paddingHorizontal: space.sm, paddingBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.md },
  num: { width: 24, textAlign: 'right' },
  rowText: { flex: 1 },
});
