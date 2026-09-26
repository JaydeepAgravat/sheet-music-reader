import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/ui/theme';

/**
 * Line-art illustrations for empty states. Drawn on a 200×160 grid with a 2.5 stroke,
 * using theme roles only, so they read correctly in light and dark.
 */
type Props = { size?: number };

function usePens() {
  const { colors } = useTheme();
  return {
    line: colors.textTertiary,
    ink: colors.accent,
    paper: colors.surface,
    wash: colors.accentContainer,
    shade: colors.surfaceSunken,
  };
}

const stroke = { strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

/** A music stand holding a blank sheet with a faint stave: "your library starts here". */
export function EmptyLibraryArt({ size = 200 }: Props) {
  const p = usePens();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" accessible={false}>
      <Circle cx="100" cy="74" r="58" fill={p.wash} />
      {/* stand */}
      <Path d="M100 118v32M84 150h32" stroke={p.line} {...stroke} />
      <Path d="M52 110h96" stroke={p.line} {...stroke} />
      {/* sheet */}
      <Rect x="66" y="28" width="68" height="82" rx="4" fill={p.paper} stroke={p.line} strokeWidth={2.5} />
      <G stroke={p.ink} strokeWidth={1.6} strokeLinecap="round" opacity={0.85}>
        <Path d="M76 50h48M76 55h48M76 60h48M76 65h48M76 70h48" />
      </G>
      <G stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.55}>
        <Path d="M76 84h48M76 89h48M76 94h48M76 99h30" />
      </G>
      {/* sparkle: new */}
      <Path d="M150 34v12M144 40h12" stroke={p.ink} {...stroke} />
      <Path d="M46 58v8M42 62h8" stroke={p.line} {...stroke} />
    </Svg>
  );
}

/** Three numbered sheets fanned in order: a set list. */
export function EmptySetlistsArt({ size = 200 }: Props) {
  const p = usePens();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" accessible={false}>
      <Circle cx="100" cy="80" r="58" fill={p.wash} />
      <G transform="rotate(-10 70 90)">
        <Rect x="44" y="46" width="52" height="68" rx="4" fill={p.paper} stroke={p.line} strokeWidth={2.5} />
        <Path d="M54 64h32M54 69h32M54 74h32" stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.6} />
      </G>
      <G transform="rotate(8 130 90)">
        <Rect x="104" y="46" width="52" height="68" rx="4" fill={p.paper} stroke={p.line} strokeWidth={2.5} />
        <Path d="M114 64h32M114 69h32M114 74h32" stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.6} />
      </G>
      <Rect x="74" y="38" width="52" height="72" rx="4" fill={p.paper} stroke={p.ink} strokeWidth={2.5} />
      <Path d="M84 58h32M84 63h32M84 68h32M84 73h32M84 78h32" stroke={p.ink} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx="100" cy="126" r="11" fill={p.ink} />
      <Path d="M97 121l4-2v14" stroke={p.paper} {...stroke} strokeWidth={2.2} />
    </Svg>
  );
}

/** Two folders, one holding sheets: collections. */
export function EmptyCollectionsArt({ size = 200 }: Props) {
  const p = usePens();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" accessible={false}>
      <Circle cx="100" cy="80" r="58" fill={p.wash} />
      <Path d="M52 60h26l8 9h44a4 4 0 0 1 4 4v52a4 4 0 0 1-4 4H52a4 4 0 0 1-4-4V64a4 4 0 0 1 4-4Z" fill={p.shade} stroke={p.line} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x="70" y="44" width="50" height="62" rx="3" fill={p.paper} stroke={p.line} strokeWidth={2.2} transform="rotate(-6 95 75)" />
      <Rect x="82" y="40" width="50" height="62" rx="3" fill={p.paper} stroke={p.ink} strokeWidth={2.2} transform="rotate(5 107 71)" />
      <Path d="M92 58h30M92 63h30M92 68h30M92 73h30M92 78h30" stroke={p.ink} strokeWidth={1.4} strokeLinecap="round" transform="rotate(5 107 71)" />
      <Path d="M60 84h86a4 4 0 0 1 4 4.6l-4.4 36A4 4 0 0 1 141.6 128H56a4 4 0 0 1-4-4.4l4-36A4 4 0 0 1 60 84Z" fill={p.paper} stroke={p.line} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M150 44v10M145 49h10" stroke={p.ink} {...stroke} />
    </Svg>
  );
}
