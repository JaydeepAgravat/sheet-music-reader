import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '@/ui/icons';
import { elevation, motion, radius, space, useTheme } from '@/ui/theme';
import { Text } from './Text';

type Props = {
  label: string;
  /** 0..1 */
  progress: number;
  icon?: IconName;
};

/** Floating, non-blocking progress for background work (imports, backups). */
export function ProgressPill({ label, progress, icon = 'tray-arrow-down' }: Props) {
  const { colors } = useTheme();
  const p = useSharedValue(progress);
  useEffect(() => {
    p.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: motion.duration.slow });
  }, [progress, p]);
  const bar = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={[styles.pill, elevation.mid, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }]}
    >
      <Icon name={icon} size={18} color="accent" />
      <View style={styles.text}>
        <Text variant="label" numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.track, { backgroundColor: colors.surfaceSunken }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, bar]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.lg, borderWidth: StyleSheet.hairlineWidth, minWidth: 220 },
  text: { flex: 1, gap: 6 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
