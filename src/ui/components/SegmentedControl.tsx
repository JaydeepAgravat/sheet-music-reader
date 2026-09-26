import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Icon, type IconName } from '@/ui/icons';
import { haptic } from '@/platform/haptics';
import { motion, radius, useTheme } from '@/ui/theme';
import { Text } from './Text';

export type Segment<T extends string> = { value: T; label: string; icon?: IconName };

type Props<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Hide labels and show icons only (labels are still used for accessibility). */
  iconOnly?: boolean;
};

export function SegmentedControl<T extends string>({ segments, value, onChange, iconOnly }: Props<T>) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex(s => s.value === value));
  const segW = width > 0 ? (width - 8) / segments.length : 0;

  const indicator = useAnimatedStyle(() => {
    const x = 4 + index * segW;
    return {
      width: segW,
      transform: [{ translateX: reduceMotion ? x : withSpring(x, motion.spring) }],
    };
  });

  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surfaceSunken }]}
    >
      {segW > 0 && <Animated.View style={[styles.indicator, { backgroundColor: colors.surfaceRaised }, indicator]} />}
      {segments.map(s => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            style={styles.segment}
            onPress={() => {
              if (!active) {
                haptic('tick');
                onChange(s.value);
              }
            }}
            accessibilityRole="radio"
            accessibilityLabel={s.label}
            accessibilityState={{ selected: active }}
          >
            {s.icon && <Icon name={s.icon} size={20} weight={active ? 'fill' : 'regular'} color={active ? 'textPrimary' : 'textSecondary'} />}
            {!iconOnly && (
              <Text variant="label" color={active ? 'textPrimary' : 'textSecondary'} numberOfLines={1}>
                {s.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 44, borderRadius: radius.md, padding: 4 },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: radius.sm,
    elevation: 1,
    shadowColor: '#000',
  },
  segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
});
