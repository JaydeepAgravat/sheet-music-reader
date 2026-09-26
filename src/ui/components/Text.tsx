import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { typography, useTheme, type ColorTokens, type TypographyRole } from '@/ui/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyRole;
  color?: keyof ColorTokens;
  align?: 'left' | 'center' | 'right';
};

/** The only text primitive. Supports up to 200% system font scale (Android 14 max). */
export function Text({ variant = 'body', color = 'textPrimary', align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={2}
      {...rest}
      style={[typography[variant], { color: colors[color] }, align && { textAlign: align }, style]}
    />
  );
}
