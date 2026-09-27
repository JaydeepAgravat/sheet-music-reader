import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/ui/theme';

/**
 * Line-art for the three intro steps, drawn like the empty-state illustrations
 * (src/ui/illustrations/Illustrations.tsx): a 200×160 grid, 2.5 strokes, theme roles only so they
 * read correctly in light and dark. Decorative — the step's title and text carry the meaning.
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

/** A tablet holding a score, a PDF dropping in, and a check: "your PDFs stay on this device". */
export function ImportArt({ size = 200 }: Props) {
  const p = usePens();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" accessible={false}>
      <Circle cx="100" cy="82" r="58" fill={p.wash} />
      {/* incoming PDF */}
      <G transform="rotate(10 146 34)">
        <Rect x="130" y="14" width="32" height="40" rx="3" fill={p.paper} stroke={p.line} strokeWidth={2.2} />
        <Path d="M137 26h18M137 31h18M137 36h12" stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.6} />
      </G>
      {/* tablet */}
      <Rect x="62" y="36" width="76" height="112" rx="9" fill={p.shade} stroke={p.line} strokeWidth={2.5} />
      <Rect x="71" y="46" width="58" height="84" rx="3" fill={p.paper} stroke={p.ink} strokeWidth={2.2} />
      <G stroke={p.ink} strokeWidth={1.5} strokeLinecap="round" opacity={0.85}>
        <Path d="M79 60h42M79 65h42M79 70h42M79 75h42M79 80h42" />
      </G>
      <G stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.55}>
        <Path d="M79 94h42M79 99h42M79 104h42M79 109h28" />
      </G>
      <Path d="M92 139h16" stroke={p.line} {...stroke} />
      <Path d="M158 60c-1 9-6 15-14 19" stroke={p.ink} {...stroke} />
      <Path d="M145 72l-2 7 7 1" stroke={p.ink} {...stroke} />
      {/* on this device */}
      <Circle cx="60" cy="126" r="14" fill={p.ink} />
      <Path d="M53.5 126l4.5 4.5 8.5-9" stroke={p.paper} {...stroke} />
      <Path d="M46 48v8M42 52h8" stroke={p.line} {...stroke} />
    </Svg>
  );
}

/** A two-pad page-turn pedal sending a signal up to a page whose corner is turning. */
export function PedalArt({ size = 200 }: Props) {
  const p = usePens();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" accessible={false}>
      <Circle cx="100" cy="78" r="58" fill={p.wash} />
      {/* page, corner turning */}
      <Rect x="66" y="18" width="64" height="82" rx="3" fill={p.paper} stroke={p.line} strokeWidth={2.5} />
      <G stroke={p.ink} strokeWidth={1.5} strokeLinecap="round" opacity={0.85}>
        <Path d="M75 36h36M75 41h40M75 46h40M75 51h40M75 56h40" />
      </G>
      <G stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.55}>
        <Path d="M75 70h40M75 75h40M75 80h40M75 85h26" />
      </G>
      <Path d="M130 42V18h-20c7 7 13 15 20 24Z" fill={p.shade} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M141 28c8 7 10 17 6 27" stroke={p.ink} {...stroke} />
      <Path d="M141 51l6 5 4-7" stroke={p.ink} {...stroke} />
      {/* pedal */}
      <Rect x="54" y="120" width="92" height="28" rx="10" fill={p.shade} stroke={p.line} strokeWidth={2.5} />
      <Rect x="62" y="110" width="36" height="22" rx="6" fill={p.paper} stroke={p.line} strokeWidth={2.2} />
      <Rect x="102" y="113" width="36" height="22" rx="6" fill={p.wash} stroke={p.ink} strokeWidth={2.2} />
      {/* wireless */}
      <Path d="M154 116c4 4 4 10 0 14" stroke={p.ink} {...stroke} />
      <Path d="M160 110c8 7 8 19 0 26" stroke={p.ink} {...stroke} opacity={0.6} />
      <Path d="M44 64v8M40 68h8" stroke={p.line} {...stroke} />
    </Svg>
  );
}

/** A pencil marking a score: a slur over the stave and a circled note. */
export function AnnotateArt({ size = 200 }: Props) {
  const p = usePens();
  return (
    <Svg width={size} height={size * 0.8} viewBox="0 0 200 160" accessible={false}>
      <Circle cx="100" cy="80" r="58" fill={p.wash} />
      <Rect x="50" y="28" width="82" height="104" rx="4" fill={p.paper} stroke={p.line} strokeWidth={2.5} />
      <G stroke={p.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.6}>
        <Path d="M60 56h62M60 61h62M60 66h62M60 71h62M60 76h62" />
        <Path d="M60 96h62M60 101h62M60 106h62M60 111h62M60 116h62" />
      </G>
      {/* notes */}
      <G fill={p.line} opacity={0.8}>
        <Circle cx="72" cy="68.5" r="3" />
        <Circle cx="88" cy="63.5" r="3" />
        <Circle cx="104" cy="66" r="3" />
        <Circle cx="86" cy="106" r="3" />
      </G>
      {/* ink */}
      <Path d="M66 52c12-12 34-13 46-2" stroke={p.ink} {...stroke} />
      <Circle cx="86" cy="106" r="9" stroke={p.ink} strokeWidth={2.2} fill="none" />
      <Path d="M97 104c6-2 12-5 18-7" stroke={p.ink} strokeWidth={2} strokeLinecap="round" fill="none" />
      {/* pencil */}
      <G transform="rotate(35 138 66)">
        <Rect x="131" y="20" width="14" height="8" rx="2" fill={p.shade} stroke={p.ink} strokeWidth={2.2} />
        <Rect x="131" y="28" width="14" height="54" rx="2" fill={p.wash} stroke={p.ink} strokeWidth={2.2} />
        <Path d="M131 82l7 14 7-14Z" fill={p.paper} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M136 92l2 4 2-4Z" fill={p.ink} />
      </G>
      <Path d="M154 110v10M149 115h10" stroke={p.ink} {...stroke} />
    </Svg>
  );
}
