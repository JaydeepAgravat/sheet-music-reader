import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { elevation, motion, radius, space, useTheme } from '@/ui/theme';
import type { Anchor } from './Menu';

type Props = {
  visible: boolean;
  anchor: Anchor | null;
  onClose: () => void;
  width: number;
  /** Announced when the popover opens. */
  accessibilityLabel: string;
  children: React.ReactNode;
};

const MARGIN = space.sm;

/**
 * Anchored card with arbitrary content (the Menu's placement rules): below the anchor when it
 * fits, otherwise above; hugs the anchor's nearer edge; stays inside the safe area.
 */
export function Popover({ visible, anchor, onClose, width, accessibilityLabel, children }: Props) {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(0);
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
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }));

  if (!mounted || !anchor) return null;

  const w = Math.min(width, win.width - insets.left - insets.right - MARGIN * 2);
  const below = anchor.y + anchor.height + MARGIN;
  const fitsBelow = below + height <= win.height - insets.bottom - MARGIN;
  const top = fitsBelow ? below : Math.max(insets.top + MARGIN, anchor.y - height - MARGIN);
  const rawLeft = anchor.x + anchor.width / 2 - w / 2;
  const left = Math.min(Math.max(rawLeft, insets.left + MARGIN), win.width - insets.right - MARGIN - w);

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent onRequestClose={onClose} animationType="none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} importantForAccessibility="no" />
      <Animated.View
        onLayout={e => setHeight(e.nativeEvent.layout.height)}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.card,
          elevation.high,
          { top, left, width: w, backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle, opacity: height ? undefined : 0 },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
