import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { getPref, setPref } from '@/data/prefs';
import type { InkPreset } from '@/domain/ink/presets';
import { haptic } from '@/platform/haptics';
import { Button, IconButton, Menu, Surface, type Anchor, type MenuItem } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { elevation, minTouch, motion, radius, space, useTheme } from '@/ui/theme';
import { InkPresetEditor } from './InkPresetEditor';

type ViewRef = React.ComponentRef<typeof View>;

export const ERASER = 'eraser';

type Props = {
  presets: InkPreset[];
  /** Preset id or ERASER. */
  active: string;
  onSelect: (id: string) => void;
  onEditPreset: (preset: InkPreset) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Visible pages that have ink, for "Clear page". */
  clearTargets: { page: number; count: number }[];
  onClearPage: (page: number) => void;
  fingerDraws: boolean;
  onToggleFingerDraws: () => void;
  onDone: () => void;
  /** Phones: docked full-width at the bottom instead of floating. */
  docked: boolean;
  /** Stage size, for keeping the floating bar on screen. */
  bounds: { width: number; height: number };
};

/**
 * The annotation toolbar. Floating and draggable by its grip on tablets (position remembered,
 * normalised so it survives rotation); docked at the bottom on phones. The active tool shows the
 * accent container + the Fill glyph; tapping the active pen again opens its colour/width editor.
 */
export function InkToolbar(props: Props) {
  const { docked, bounds } = props;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0 });
  const limits = useSharedValue({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  const placed = useRef(false);

  // Keep the bar inside the stage (safe area included) and place it from the saved position.
  useEffect(() => {
    if (docked || !size.width || !bounds.width) return;
    const minX = insets.left + space.sm;
    const maxX = Math.max(minX, bounds.width - insets.right - space.sm - size.width);
    const minY = insets.top + space.sm;
    const maxY = Math.max(minY, bounds.height - insets.bottom - space.sm - size.height);
    limits.value = { minX, maxX, minY, maxY };
    const saved = getPref('inkToolbarPos');
    const nx = saved ? saved.x : 0.5;
    const ny = saved ? saved.y : 0;
    x.value = minX + (maxX - minX) * nx;
    y.value = minY + (maxY - minY) * ny;
    placed.current = true;
  }, [docked, size.width, size.height, bounds.width, bounds.height, insets.left, insets.right, insets.top, insets.bottom, limits, x, y]);

  const savePosition = useCallback((nx: number, ny: number) => setPref('inkToolbarPos', { x: nx, y: ny }), []);

  const drag = usePanGesture({
    minDistance: 2,
    onBegin: () => {
      'worklet';
      start.value = { x: x.value, y: y.value };
    },
    onActivate: () => {
      'worklet';
      scheduleOnRN(haptic, 'dragStart');
    },
    onUpdate: e => {
      'worklet';
      const l = limits.value;
      x.value = Math.min(l.maxX, Math.max(l.minX, start.value.x + e.translationX));
      y.value = Math.min(l.maxY, Math.max(l.minY, start.value.y + e.translationY));
    },
    onDeactivate: () => {
      'worklet';
      const l = limits.value;
      // Snap to the nearest horizontal edge or the centre when released close to it.
      const cx = (l.minX + l.maxX) / 2;
      let tx = x.value;
      if (Math.abs(tx - l.minX) < 32) tx = l.minX;
      else if (Math.abs(tx - l.maxX) < 32) tx = l.maxX;
      else if (Math.abs(tx - cx) < 24) tx = cx;
      x.value = withSpring(tx, motion.springSnappy);
      const nx = l.maxX > l.minX ? (tx - l.minX) / (l.maxX - l.minX) : 0.5;
      const ny = l.maxY > l.minY ? (y.value - l.minY) / (l.maxY - l.minY) : 0;
      scheduleOnRN(savePosition, nx, ny);
    },
  });

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(s => (s.width === width && s.height === height ? s : { width, height }));
  };

  if (docked) {
    return (
      <View
        style={[styles.dock, elevation.mid, { paddingBottom: insets.bottom + space.xs, backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }]}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dockRow}>
          <ToolbarItems {...props} />
        </ScrollView>
      </View>
    );
  }

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.float,
        elevation.high,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle, opacity: size.width ? 1 : 0 },
        floatStyle,
      ]}
    >
      <GestureDetector gesture={drag}>
        <View style={styles.grip} accessible={false}>
          <Icon name="dots-six-vertical" size={20} color="textTertiary" />
        </View>
      </GestureDetector>
      <ToolbarItems {...props} />
    </Animated.View>
  );
}

function ToolbarItems({
  presets,
  active,
  onSelect,
  onEditPreset,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  clearTargets,
  onClearPage,
  fingerDraws,
  onToggleFingerDraws,
  onDone,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [editing, setEditing] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [more, setMore] = useState<Anchor | null>(null);
  const moreRef = useRef<ViewRef>(null);

  const pickPreset = (p: InkPreset, ref: ViewRef | null) => {
    if (active === p.id) {
      ref?.measureInWindow((ax, ay, width, height) => setEditing({ id: p.id, anchor: { x: ax, y: ay, width, height } }));
      return;
    }
    haptic('tick');
    onSelect(p.id);
  };

  const moreItems: MenuItem[] = [
    ...(clearTargets.length
      ? clearTargets.map((c, i) => ({
          key: `clear-${c.page}`,
          label: clearTargets.length > 1 ? t('ink.clearPageN', { page: c.page + 1 }) : t('ink.clearPage'),
          hint: t('ink.strokes', { count: c.count }),
          icon: 'broom' as const,
          destructive: true,
          disabled: c.count === 0,
          onPress: () => onClearPage(c.page),
          dividerBefore: i === 0 ? false : undefined,
        }))
      : [{ key: 'clear', label: t('ink.clearPage'), icon: 'broom' as const, disabled: true, onPress: () => {} }]),
    {
      key: 'finger',
      label: t('ink.fingerDraws'),
      hint: t('ink.fingerDrawsHint'),
      icon: 'hand' as const,
      selected: fingerDraws,
      onPress: onToggleFingerDraws,
      dividerBefore: true,
    },
  ];

  const editingPreset = editing ? presets.find(p => p.id === editing.id) : undefined;

  return (
    <>
      {presets.map(p => (
        <PresetButton key={p.id} preset={p} selected={active === p.id} onPress={ref => pickPreset(p, ref)} />
      ))}
      <IconButton icon="eraser" label={t('ink.eraser')} selected={active === ERASER} onPress={() => onSelect(ERASER)} />
      <View style={[styles.sep, { backgroundColor: colors.borderSubtle }]} />
      <IconButton icon="arrow-counter-clockwise" label={t('ink.undo')} disabled={!canUndo} onPress={onUndo} />
      <IconButton icon="arrow-clockwise" label={t('ink.redo')} disabled={!canRedo} onPress={onRedo} />
      <View ref={moreRef} collapsable={false}>
        <IconButton
          icon="dots-three-vertical"
          label={t('common.moreOptions')}
          onPress={() => moreRef.current?.measureInWindow((ax, ay, width, height) => setMore({ x: ax, y: ay, width, height }))}
        />
      </View>
      <View style={styles.done}>
        <Button label={t('ink.done')} icon="check" onPress={onDone} />
      </View>
      <Menu visible={more !== null} anchor={more} items={moreItems} onClose={() => setMore(null)} />
      <InkPresetEditor
        visible={!!editingPreset}
        anchor={editing?.anchor ?? null}
        preset={editingPreset ?? presets[0]!}
        onChange={onEditPreset}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

/** A pen/highlighter swatch: the tool glyph in the preset's colour, with a width bar under it. */
function PresetButton({ preset, selected, onPress }: { preset: InkPreset; selected: boolean; onPress: (ref: ViewRef | null) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const ref = useRef<ViewRef>(null);
  const isHighlighter = preset.kind === 'HIGHLIGHTER';
  const barH = Math.max(2, Math.min(6, isHighlighter ? preset.width / 2.5 : preset.width * 2));
  return (
    <View ref={ref} collapsable={false}>
      <Surface
        onPress={() => onPress(ref.current)}
        accessibilityRole="togglebutton"
        accessibilityState={{ selected }}
        accessibilityLabel={t(isHighlighter ? 'ink.highlighter' : 'ink.pen')}
        accessibilityHint={selected ? t('ink.editHint') : undefined}
        borderless
        rippleRadius={22}
        style={styles.presetTarget}
      >
        <View style={[styles.presetVisual, { borderColor: selected ? colors.accent : colors.borderSubtle, borderWidth: selected ? 2 : StyleSheet.hairlineWidth }]}>
          {/* Highlighter colours are too pale for a glyph on paper; the bar carries the colour. */}
          <Icon name={isHighlighter ? 'highlighter' : 'pen-nib'} weight={selected ? 'fill' : 'regular'} size={22} tint={isHighlighter ? '#5F5B54' : preset.color} />
          <View style={[styles.widthBar, { height: barH, backgroundColor: preset.color, opacity: isHighlighter ? 0.7 : 1 }]} />
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  float: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingRight: space.xs,
  },
  grip: { width: 28, height: minTouch + space.sm, alignItems: 'center', justifyContent: 'center', marginLeft: space.xs },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs },
  dockRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, minWidth: '100%', justifyContent: 'center' },
  sep: { width: StyleSheet.hairlineWidth * 2, height: 24, marginHorizontal: space.xs },
  done: { marginLeft: space.xs, marginRight: space.xs },
  presetTarget: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  // Ink colours always sit on paper, so every preset reads in both themes.
  presetVisual: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: '#FFFEFB' },
  widthBar: { width: 16, borderRadius: 3 },
});
