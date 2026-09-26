import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, type IconName } from '@/ui/icons';
import { elevation, minTouch, motion, radius, space, useTheme } from '@/ui/theme';
import { Divider } from './Divider';
import { Surface } from './Surface';
import { Text } from './Text';

export type MenuItem = {
  key: string;
  label: string;
  /** Secondary line, e.g. "Follows how you hold the device". */
  hint?: string;
  icon?: IconName;
  /** Custom leading element (e.g. a colour swatch) instead of an icon. */
  leading?: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
  /** Draw a divider above this item. */
  dividerBefore?: boolean;
};

/** Window rect of the element the menu drops from (from measureInWindow). */
export type Anchor = { x: number; y: number; width: number; height: number };

type Props = {
  visible: boolean;
  anchor: Anchor | null;
  items: MenuItem[];
  onClose: () => void;
  title?: string;
  /** Menus over the score use the dark stage palette in performance mode. */
  minWidth?: number;
};

const MARGIN = space.sm;

/**
 * Anchored popover menu. Opens below the anchor (above when there is no room), aligned to the
 * anchor's nearer edge, and never leaves the safe area. Picking an item closes the menu first.
 */
export function Menu({ visible, anchor, items, onClose, title, minWidth = 264 }: Props) {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [size, setSize] = useState({ height: 0 });
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: reduceMotion ? 0 : motion.duration.fast, easing: motion.easing.decelerate });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: reduceMotion ? 0 : 110, easing: Easing.in(Easing.quad) }, done => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }, { translateY: (1 - progress.value) * -4 }],
  }));

  if (!mounted || !anchor) return null;

  // Placement: below if it fits, else above; horizontally hug the anchor's nearer edge.
  const maxH = win.height - insets.top - insets.bottom - MARGIN * 2;
  const h = Math.min(size.height, maxH);
  const below = anchor.y + anchor.height + MARGIN / 2;
  const fitsBelow = below + h <= win.height - insets.bottom - MARGIN;
  const top = fitsBelow ? below : Math.max(insets.top + MARGIN, anchor.y - h - MARGIN / 2);
  const anchorCenter = anchor.x + anchor.width / 2;
  // Explicit width: auto-sized absolute boxes mis-measure wrapped text (last row gets clipped).
  const w = Math.min(Math.max(minWidth, 300), win.width - insets.left - insets.right - MARGIN * 2);
  const rawLeft = anchorCenter > win.width / 2 ? anchor.x + anchor.width - w : anchor.x;
  const left = Math.min(Math.max(rawLeft, insets.left + MARGIN), win.width - insets.right - MARGIN - w);

  const pick = (item: MenuItem) => {
    onClose();
    item.onPress();
  };

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent onRequestClose={onClose} animationType="none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={title} importantForAccessibility="no" />
      <Animated.View
        onLayout={e => setSize({ height: e.nativeEvent.layout.height })}
        style={[
          styles.menu,
          elevation.high,
          { top, left, width: w, maxHeight: maxH, backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle, opacity: size.height ? undefined : 0 },
          style,
        ]}
        accessibilityViewIsModal
      >
        <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
          {title && (
            <Text variant="overline" color="textSecondary" style={styles.title}>
              {title.toUpperCase()}
            </Text>
          )}
          {items.map(item => (
            <View key={item.key}>
              {item.dividerBefore && (
                <View style={styles.divider}>
                  <Divider />
                </View>
              )}
              <Surface
                onPress={() => pick(item)}
                disabled={item.disabled}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: item.selected, disabled: item.disabled }}
                accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
                style={[styles.item, item.selected && { backgroundColor: colors.accentContainer }, item.disabled && styles.disabled]}
              >
                {item.leading ??
                  (item.icon && (
                    <Icon
                      name={item.icon}
                      weight={item.selected ? 'fill' : 'regular'}
                      size={20}
                      color={item.destructive ? 'danger' : item.selected ? 'onAccentContainer' : 'textSecondary'}
                    />
                  ))}
                <View style={styles.itemText}>
                  <Text variant="label" color={item.destructive ? 'danger' : item.selected ? 'onAccentContainer' : 'textPrimary'}>
                    {item.label}
                  </Text>
                  {item.hint && (
                    <Text variant="caption" color={item.selected ? 'onAccentContainer' : 'textSecondary'}>
                      {item.hint}
                    </Text>
                  )}
                </View>
                {item.selected && <Icon name="check" size={18} color="onAccentContainer" />}
              </Surface>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', },
  scroll: { flexGrow: 0 },
  content: { paddingVertical: space.xs },
  title: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTouch, paddingHorizontal: space.lg, paddingVertical: space.sm, marginHorizontal: space.xs, borderRadius: radius.sm },
  itemText: { flex: 1, gap: 1 },
  disabled: { opacity: 0.38 },
  divider: { marginVertical: space.xs },
});
