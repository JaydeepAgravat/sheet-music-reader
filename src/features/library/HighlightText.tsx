import React, { memo } from 'react';
import type { TextProps } from 'react-native';
import { highlightRanges } from '@/domain/search/query';
import { Text } from '@/ui/components';
import type { TypographyRole } from '@/ui/theme';
import { useTheme, type ColorTokens } from '@/ui/theme';

type Props = Omit<TextProps, 'children'> & {
  text: string;
  query: string;
  variant?: TypographyRole;
  color?: keyof ColorTokens;
};

/** Text with the parts matching the search query marked (accent-insensitive, word prefixes). */
export const HighlightText = memo(function HighlightTextImpl({ text, query, variant, color, ...rest }: Props) {
  const { colors } = useTheme();
  const ranges = query.trim() ? highlightRanges(text, query) : [];
  if (!ranges.length) {
    return (
      <Text variant={variant} color={color} {...rest}>
        {text}
      </Text>
    );
  }
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], i) => {
    if (s > at) parts.push(text.slice(at, s));
    parts.push(
      <Text key={i} variant={variant} style={{ color: colors.onAccentContainer, backgroundColor: colors.accentContainer }}>
        {text.slice(s, e)}
      </Text>,
    );
    at = e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return (
    <Text variant={variant} color={color} {...rest}>
      {parts}
    </Text>
  );
});
