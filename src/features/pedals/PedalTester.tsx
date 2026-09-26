import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import NativeKeyEvents, { type LearnedKeyEvent } from '@/specs/NativeKeyEvents';
import { useLiveQuery } from '@/data/db/live';
import { usePref } from '@/data/prefs';
import { listLearned } from '@/data/repos/pedals';
import { effectiveMappings, keyLabel, type PedalAction } from '@/domain/pedals/keymap';
import { Text } from '@/ui/components';
import { Icon, type IconName } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

/**
 * Live pedal check: the tile for the action a key triggers lights up. The screen hosting this
 * must enable learning mode (NativeKeyEvents.setLearning) so keys arrive here instead of moving focus.
 */
export function PedalTester({ lastKey }: { lastKey: LearnedKeyEvent | null }) {
  const { t } = useTranslation();
  const learned = useLiveQuery(['pedal_mappings'], listLearned, []);
  const [volumeKeys] = usePref('volumeKeysTurn');
  const action = lastKey ? effectiveMappings(learned, volumeKeys).get(lastKey.keyCode) : undefined;
  const [pulse, setPulse] = useState<{ action: PedalAction | 'UNMAPPED'; n: number } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (lastKey) setPulse({ action: action ?? 'UNMAPPED', n: ++seq.current });
  }, [lastKey, action]);

  return (
    <View style={styles.tester}>
      <View style={styles.tiles}>
        <PedalTile icon="caret-left" label={t('pedals.actions.PREV')} pulse={pulse?.action === 'PREV' ? pulse.n : 0} />
        <PedalTile icon="caret-right" label={t('pedals.actions.NEXT')} pulse={pulse?.action === 'NEXT' ? pulse.n : 0} />
      </View>
      <Text variant="caption" color="textSecondary" style={styles.status} accessibilityLiveRegion="polite">
        {!lastKey
          ? t('pedals.pressToTest')
          : action
            ? t('pedals.keyDoes', { key: keyLabel(lastKey.keyCode, lastKey.keyName), action: t(`pedals.actions.${action}`) })
            : t('pedals.keyUnassigned', { key: keyLabel(lastKey.keyCode, lastKey.keyName) })}
        {lastKey?.deviceName ? ` · ${lastKey.deviceName}` : ''}
      </Text>
    </View>
  );
}

function PedalTile({ icon, label, pulse }: { icon: IconName; label: string; pulse: number }) {
  const { colors, reduceMotion } = useTheme();
  const lit = useSharedValue(0);
  useEffect(() => {
    if (pulse) lit.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: reduceMotion ? 200 : 700 }));
  }, [pulse, lit, reduceMotion]);
  const glow = useAnimatedStyle(() => ({ opacity: lit.value, transform: [{ scale: 0.96 + 0.04 * lit.value }] }));
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.tileGlow, { backgroundColor: colors.accentContainer, borderColor: colors.accent }, glow]} />
      <Icon name={icon} size={30} color="textPrimary" />
      <Text variant="label">{label}</Text>
    </View>
  );
}

/** Captures keys (learn mode) while mounted and returns the latest one. */
export function useKeyCapture(enabled: boolean): LearnedKeyEvent | null {
  const [last, setLast] = useState<LearnedKeyEvent | null>(null);
  useEffect(() => {
    if (!enabled) return;
    NativeKeyEvents.setLearning(true);
    const sub = NativeKeyEvents.onKeyLearned(e => setLast({ ...e }));
    return () => {
      sub.remove();
      NativeKeyEvents.setLearning(false);
    };
  }, [enabled]);
  return last;
}

const styles = StyleSheet.create({
  tester: { gap: space.md },
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { flex: 1, height: 104, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: space.xs, overflow: 'hidden' },
  tileGlow: { opacity: 0, borderRadius: radius.md, borderWidth: 2 },
  status: { textAlign: 'center', minHeight: 17 },
});

