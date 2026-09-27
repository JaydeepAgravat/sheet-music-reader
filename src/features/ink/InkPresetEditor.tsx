import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { DEFAULT_OPACITY, INK_PALETTE, WIDTH_STEPS, nearestWidthStep, type InkKind, type InkPreset } from '@/domain/ink/presets';
import { haptic } from '@/platform/haptics';
import { Popover, SegmentedControl, Surface, Text, type Anchor } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { minTouch, radius, space, useTheme } from '@/ui/theme';

type Props = {
  visible: boolean;
  anchor: Anchor | null;
  preset: InkPreset;
  onChange: (preset: InkPreset) => void;
  onClose: () => void;
};

/** A preview stroke at roughly the size it will appear on a fitted page. */
const PREVIEW_PX_PER_PT = 1.6;

/** Colour + width (+ pen/highlighter) editor for one preset slot. Changes apply immediately. */
export function InkPresetEditor({ visible, anchor, preset, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const steps = WIDTH_STEPS[preset.kind];
  const width = nearestWidthStep(preset.kind, preset.width);

  const setKind = (kind: InkKind) => {
    if (kind === preset.kind) return;
    onChange({ ...preset, kind, opacity: DEFAULT_OPACITY[kind], width: nearestWidthStep(kind, kind === 'HIGHLIGHTER' ? 9 : 1.2) });
  };

  return (
    <Popover visible={visible} anchor={anchor} onClose={onClose} width={320} accessibilityLabel={t('ink.editPreset')}>
      <View style={styles.body}>
        <SegmentedControl<InkKind>
          segments={[
            { value: 'PEN', label: t('ink.pen'), icon: 'pen-nib' },
            { value: 'HIGHLIGHTER', label: t('ink.highlighter'), icon: 'highlighter' },
          ]}
          value={preset.kind}
          onChange={setKind}
        />

        <View style={[styles.preview, { backgroundColor: '#FFFEFB', borderColor: colors.borderSubtle }]}>
          <Svg width="100%" height={44} viewBox="0 0 260 44" preserveAspectRatio="xMidYMid meet">
            <Path
              d="M14 30 C 50 6, 86 6, 112 22 S 176 40, 206 18 S 240 10, 246 16"
              stroke={preset.color}
              strokeOpacity={preset.opacity}
              strokeWidth={Math.max(1, preset.width * PREVIEW_PX_PER_PT)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>

        <Text variant="overline" color="textSecondary">
          {t('ink.color').toUpperCase()}
        </Text>
        <View style={styles.palette}>
          {INK_PALETTE.map(c => {
            const selected = c.color.toUpperCase() === preset.color.toUpperCase();
            return (
              <Surface
                key={c.id}
                onPress={() => {
                  haptic('tick');
                  onChange({ ...preset, color: c.color });
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(`ink.colors.${c.id}` as 'ink.colors.graphite')}
                borderless
                rippleRadius={20}
                style={styles.swatchTarget}
              >
                <View style={[styles.swatchRing, { borderColor: selected ? colors.accent : 'transparent' }]}>
                  <View style={[styles.swatch, { backgroundColor: c.color, borderColor: colors.borderStrong }]}>
                    {selected && <Icon name="check" size={14} tint={isLight(c.color) ? '#1C1B19' : '#FFFFFF'} />}
                  </View>
                </View>
              </Surface>
            );
          })}
        </View>

        <Text variant="overline" color="textSecondary">
          {t('ink.width').toUpperCase()}
        </Text>
        <View style={styles.widths}>
          {steps.map(w => {
            const selected = w === width;
            const dot = preset.kind === 'HIGHLIGHTER' ? 6 + w : 4 + w * 4;
            return (
              <Surface
                key={w}
                onPress={() => {
                  haptic('tick');
                  onChange({ ...preset, width: w });
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t('ink.widthPt', { width: w })}
                style={[styles.widthTarget, { borderColor: selected ? colors.accent : colors.borderSubtle, backgroundColor: selected ? colors.accentContainer : 'transparent' }]}
              >
                <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.textPrimary }} />
              </Surface>
            );
          })}
        </View>
      </View>
    </Popover>
  );
}

function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
  preview: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs },
  palette: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  swatchTarget: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  swatchRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  widths: { flexDirection: 'row', gap: space.sm },
  widthTarget: { flex: 1, height: minTouch, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
