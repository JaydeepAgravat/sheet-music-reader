import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { haptic } from '@/platform/haptics';
import { Icon } from '@/ui/icons';
import { elevation, space, useTheme } from '@/ui/theme';

type Props = {
  /** Fitted page rect inside the stage (px, dp). */
  top: number;
  height: number;
  split: number;
  onChange: (split: number) => void;
  onCommit: (split: number) => void;
};

const MIN = 0.2;
const MAX = 0.8;
const HANDLE = 44;

/** Drag handle on the half-page divider (shown with the controls): move where the page splits. */
export function HalfSplitHandle({ top, height, split, onChange, onCommit }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const y = useSharedValue(top + height * split);
  const start = useSharedValue(0);

  useEffect(() => {
    y.value = top + height * split;
  }, [top, height, split, y]);

  const change = useCallback((v: number) => onChange(Math.round(v * 100) / 100), [onChange]);
  const commit = useCallback(
    (v: number) => {
      haptic('drop');
      onCommit(Math.round(v * 100) / 100);
    },
    [onCommit],
  );

  const pan = usePanGesture({
    minDistance: 2,
    onActivate: () => {
      'worklet';
      start.value = y.value;
      scheduleOnRN(haptic, 'dragStart');
    },
    onUpdate: e => {
      'worklet';
      const next = Math.min(top + height * MAX, Math.max(top + height * MIN, start.value + e.translationY));
      y.value = next;
      scheduleOnRN(change, (next - top) / height);
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(commit, (y.value - top) / height);
    },
  });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - HANDLE / 2 }] }));
  const step = (d: number) => {
    const v = Math.min(MAX, Math.max(MIN, split + d));
    onCommit(Math.round(v * 100) / 100);
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.wrap, style]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('reader.splitHandle')}
        accessibilityValue={{ min: 20, max: 80, now: Math.round(split * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => step(e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)}
      >
        <View style={[styles.pill, elevation.mid, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }]}>
          <Icon name="arrows-down-up" size={18} color="textSecondary" />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, right: space.lg, width: 72, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 56, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
