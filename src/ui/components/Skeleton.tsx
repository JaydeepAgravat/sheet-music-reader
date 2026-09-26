import React, { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius, useTheme } from '@/ui/theme';

type Props = { width?: DimensionValue; height: number; rounded?: number; style?: StyleProp<ViewStyle> };

/** Calm "breathing" placeholder (no shimmer sweep). Static under reduce-motion. */
export function Skeleton({ width = '100%', height, rounded = radius.sm, style }: Props) {
  const { colors, reduceMotion } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduceMotion) o.value = withRepeat(withTiming(0.55, { duration: 900 }), -1, true);
    return () => cancelAnimation(o);
  }, [o, reduceMotion]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: rounded, backgroundColor: colors.skeleton }, a, style]}
    />
  );
}
