import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/ui/theme';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Ripple colour override; defaults to the theme's neutral ripple. */
  rippleColor?: string;
  /** Unbounded ripples suit icon buttons; bounded suits rows/cards. */
  borderless?: boolean;
  /** Ripple radius for borderless ripples. */
  rippleRadius?: number;
};

/**
 * Pressable with the native Android ripple tuned to our palette. All tappable UI builds on this,
 * so press feedback is consistent and costs zero JS work.
 */
export function Surface({ rippleColor, borderless = false, rippleRadius, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      android_ripple={{ color: rippleColor ?? colors.ripple, borderless, radius: rippleRadius, foreground: !borderless }}
      style={style as PressableProps['style']}
      {...rest}
    />
  );
}
