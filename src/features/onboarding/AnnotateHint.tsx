import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { getPref, setPref } from '@/data/prefs';
import { IconButton, Text } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { elevation, motion, radius, space, useTheme } from '@/ui/theme';

/** How long the tip stays up once shown (it outlives the controls, which hide after 3 s). */
const SHOW_MS = 8000;

/**
 * One-time reader tip: the first time the reader's controls appear (`trigger`), a small pill under
 * the top bar points at the pencil. It leaves on its close button, after 8 s, or as soon as
 * annotating or performance mode starts (`blocked`), and is never shown again (pref
 * `annotateHintShown`).
 */
export function AnnotateHint({ trigger, blocked, top }: { trigger: boolean; blocked: boolean; top: number }) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  // Decided once per reader session: only a reader that hasn't shown the tip yet can show it.
  const [eligible] = useState(() => !getPref('annotateHintShown'));
  // "With a stylus, just write" only holds when the stylus may write outside annotate mode.
  const [stylusAnywhere] = useState(() => getPref('inkStylusAnywhere'));
  const [phase, setPhase] = useState<'waiting' | 'showing' | 'done'>('waiting');

  useEffect(() => {
    if (!eligible || phase !== 'waiting' || !trigger || blocked) return;
    setPhase('showing');
    setPref('annotateHintShown', true);
  }, [eligible, phase, trigger, blocked]);

  useEffect(() => {
    if (phase !== 'showing') return;
    if (blocked) {
      setPhase('done');
      return;
    }
    const timer = setTimeout(() => setPhase('done'), SHOW_MS);
    return () => clearTimeout(timer);
  }, [phase, blocked]);

  if (phase !== 'showing') return null;
  const fade = reduceMotion ? motion.duration.instant : motion.duration.base;
  return (
    <Animated.View entering={FadeIn.duration(fade)} exiting={FadeOut.duration(fade)} style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View
        style={[styles.pill, elevation.mid, { backgroundColor: colors.inverseSurface }]}
        accessibilityLiveRegion="polite"
      >
        <Icon name="pencil-simple" size={18} tint={colors.inverseAccent} />
        <Text variant="caption" style={[styles.text, { color: colors.onInverseSurface }]}>
          {stylusAnywhere ? t('onboarding.annotateHint') : t('onboarding.annotateHintNoStylus')}
        </Text>
        <IconButton icon="x" label={t('onboarding.dismissHint')} size="sm" color="onInverseSurface" onPress={() => setPhase('done')} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 520,
    borderRadius: radius.pill,
    paddingLeft: space.lg,
    paddingRight: space.xs,
  },
  text: { flexShrink: 1, paddingVertical: space.sm },
});
