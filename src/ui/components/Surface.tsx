import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
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
 * so press feedback is consistent and costs zero JS work. Keyboard / D-pad focus draws a ring in
 * the focus colour, following the control's own corner radius.
 */
export function Surface({ rippleColor, borderless = false, rippleRadius, style, children, onFocus, onBlur, ...rest }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const resolve = (pressed: boolean) => (typeof style === 'function' ? style({ pressed }) : style);
  return (
    <Pressable
      android_ripple={{ color: rippleColor ?? colors.ripple, borderless, radius: rippleRadius, foreground: !borderless }}
      style={state => resolve(state.pressed)}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    >
      {state => (
        <>
          {typeof children === 'function' ? children(state) : children}
          {focused && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.ring,
                {
                  borderColor: colors.focusRing,
                  borderRadius: borderless ? 999 : (StyleSheet.flatten(resolve(false))?.borderRadius as number | undefined) ?? 8,
                },
              ]}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, margin: -2 },
});
