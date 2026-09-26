import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '@/platform/haptics';
import { minTouch, motion, useTheme } from '@/ui/theme';

type Props = {
  value: number;
  min?: number;
  max?: number;
  /** Snap increment. Each crossed step gives a light haptic tick. */
  step?: number;
  onChange: (value: number) => void;
  /** Called once when the user lifts their finger. */
  onCommit?: (value: number) => void;
  label: string;
  /** Formats the value for TalkBack, e.g. v => `${v}%`. */
  formatValue?: (value: number) => string;
};

const THUMB = 22;

export function Slider({ value, min = 0, max = 1, step, onChange, onCommit, label, formatValue }: Props) {
  const { colors, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const pressed = useSharedValue(0);
  const lastStep = useSharedValue(value);
  const track = Math.max(1, width - THUMB);

  useEffect(() => {
    if (pressed.value === 0) x.value = ((value - min) / (max - min)) * track;
  }, [value, min, max, track, x, pressed]);

  const toValue = (px: number) => {
    'worklet';
    const raw = min + (Math.min(Math.max(px, 0), track) / track) * (max - min);
    return step ? Math.round(raw / step) * step : raw;
  };

  const emit = (v: number, stepped: boolean) => {
    if (stepped) haptic('tick');
    onChange(v);
  };

  const update = (px: number) => {
    'worklet';
    const v = toValue(px);
    x.value = step ? ((v - min) / (max - min)) * track : Math.min(Math.max(px, 0), track);
    const stepped = step !== undefined && v !== lastStep.value;
    lastStep.value = v;
    scheduleOnRN(emit, v, stepped);
  };

  const pan = usePanGesture({
    minDistance: 2,
    onBegin: e => {
      'worklet';
      pressed.value = reduceMotion ? 1 : withSpring(1, motion.springSnappy);
      update(e.x - THUMB / 2);
    },
    onUpdate: e => {
      'worklet';
      update(e.x - THUMB / 2);
    },
    onFinalize: () => {
      'worklet';
      pressed.value = reduceMotion ? 0 : withSpring(0, motion.springSnappy);
      if (onCommit) scheduleOnRN(onCommit, toValue(x.value));
    },
  });
  const fill = useAnimatedStyle(() => ({ width: x.value }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: 1 + pressed.value * 0.18 }],
  }));

  const stepSize = step ?? (max - min) / 20;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: formatValue?.(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => {
        const next = e.nativeEvent.actionName === 'increment' ? value + stepSize : value - stepSize;
        const clamped = Math.min(max, Math.max(min, next));
        onChange(clamped);
        onCommit?.(clamped);
      }}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          <View style={[styles.rail, { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle }]} />
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fill]} />
          <Animated.View
            style={[styles.thumb, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, opacity: width ? 1 : 0 }, thumb]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: minTouch, justifyContent: 'center' },
  rail: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  fill: { position: 'absolute', left: THUMB / 2, height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 2.5, elevation: 2, shadowColor: '#000' },
});
