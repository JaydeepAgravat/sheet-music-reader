import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '@/platform/haptics';
import { motion, useTheme } from '@/ui/theme';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Label of the row this switch belongs to (announced by TalkBack). */
  label: string;
  disabled?: boolean;
};

const TRACK_W = 52;
const TRACK_H = 32;
const THUMB_OFF = 16;
const THUMB_ON = 24;

export function Switch({ value, onValueChange, label, disabled }: Props) {
  const { colors, reduceMotion } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion ? (value ? 1 : 0) : withSpring(value ? 1 : 0, motion.springSnappy);
  }, [value, reduceMotion, progress]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surfaceSunken, colors.accent]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.borderStrong, colors.accent]),
  }));
  const thumb = useAnimatedStyle(() => {
    const size = THUMB_OFF + (THUMB_ON - THUMB_OFF) * progress.value;
    const travel = TRACK_W - 8 - THUMB_ON;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      transform: [{ translateX: 4 + (THUMB_ON - size) / 2 + travel * progress.value }],
      backgroundColor: interpolateColor(progress.value, [0, 1], [colors.textSecondary, colors.onAccent]),
    };
  });

  return (
    <Pressable
      onPress={() => {
        haptic('tick');
        onValueChange(!value);
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      style={{ opacity: disabled ? 0.38 : 1 }}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.thumb, thumb]} />
      </Animated.View>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, borderWidth: 2, justifyContent: 'center' },
  thumb: { position: 'absolute', left: -2 },
});
