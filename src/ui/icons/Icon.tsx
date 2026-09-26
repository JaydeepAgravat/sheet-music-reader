import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { iconSize, useTheme, type ColorTokens } from '@/ui/theme';
import { glyphs, type IconName } from './glyphs';

export type { IconName };

type Props = {
  name: IconName;
  /** Regular for idle, fill for active/selected (Phosphor pairing). */
  weight?: 'regular' | 'fill';
  size?: number;
  color?: keyof ColorTokens;
  /** Raw colour override (e.g. ink swatches). Prefer `color`. */
  tint?: string;
};

/** Decorative by default: the pressable around it owns the accessibility label. */
export const Icon = memo(function IconImpl({ name, weight = 'regular', size = iconSize.md, color = 'textPrimary', tint }: Props) {
  const { colors } = useTheme();
  const fill = tint ?? colors[color];
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" accessible={false} importantForAccessibility="no-hide-descendants">
      {glyphs[name][weight].map((p, i) =>
        'stroke' in p && p.stroke ? (
          <Path key={i} d={p.d} fill="none" stroke={fill} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <Path key={i} d={p.d} fill={fill} />
        ),
      )}
    </Svg>
  );
});
