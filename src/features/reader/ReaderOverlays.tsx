import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Text } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { elevation, motion, radius, space, useTheme } from '@/ui/theme';

/** "End of score" card: a soft stop, never an automatic jump. */
export function EndOfScoreCard({
  title,
  nextTitle,
  onBackToStart,
  onNext,
  onClose,
}: {
  title: string;
  nextTitle: string | null;
  onBackToStart: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(motion.duration.fast) : SlideInDown.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness)}
      exiting={reduceMotion ? FadeOut.duration(motion.duration.fast) : SlideOutDown.duration(motion.duration.base)}
      style={[styles.endWrap, { bottom: insets.bottom + space.xl }]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.endCard, elevation.high, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }]}
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
      >
        <View style={styles.endHeader}>
          <View style={styles.flex}>
            <Text variant="overline" color="textSecondary">
              {t('reader.endOfScore').toUpperCase()}
            </Text>
            <Text variant="titleM" numberOfLines={2}>
              {title}
            </Text>
          </View>
          <IconButton icon="x" label={t('common.close')} onPress={onClose} size="sm" />
        </View>
        <View style={styles.endActions}>
          <Button label={t('reader.backToStart')} icon="arrow-line-left" variant="secondary" onPress={onBackToStart} />
          {nextTitle && (
            <View style={styles.flexShrink}>
              <Button label={t('reader.nextInLibrary')} icon="arrow-right" onPress={onNext} />
              <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.nextTitle}>
                {nextTitle}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/** First-run hint: where to tap. Fades away on its own or on the first tap. */
export function TapZoneHint({ mode, onDone }: { mode: 'sides' | 'anywhere'; onDone: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(onDone, 2800);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <Animated.View entering={FadeIn.duration(motion.duration.slow)} exiting={FadeOut.duration(motion.duration.slow)} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {mode === 'sides' ? (
        <View style={styles.zones}>
          <Zone icon="caret-left" label={t('reader.hintPrev')} flex={3} />
          <View style={[styles.zone, styles.zoneCenter, { flex: 4 }]}>
            <View style={styles.zoneBadge}>
              <Icon name="hand-tap" size={22} tint="#FFFFFF" />
              <Text variant="label" style={styles.zoneText}>
                {t('reader.hintControls')}
              </Text>
            </View>
          </View>
          <Zone icon="caret-right" label={t('reader.hintNext')} flex={3} />
        </View>
      ) : (
        <View style={[styles.zones, styles.column]}>
          <View style={[styles.zone, styles.zoneCenter, { flex: 1 }]}>
            <View style={styles.zoneBadge}>
              <Text variant="label" style={styles.zoneText}>
                {t('reader.hintControlsTop')}
              </Text>
            </View>
          </View>
          <Zone icon="hand-tap" label={t('reader.hintAnywhere')} flex={6} />
        </View>
      )}
    </Animated.View>
  );
}

function Zone({ icon, label, flex }: { icon: 'caret-left' | 'caret-right' | 'hand-tap'; label: string; flex: number }) {
  return (
    <View style={[styles.zone, { flex }]}>
      <View style={styles.zoneBadge}>
        <Icon name={icon} size={22} tint="#FFFFFF" />
        <Text variant="label" style={styles.zoneText}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1, gap: space.xs },
  endWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  endCard: { width: '100%', maxWidth: 480, borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.lg },
  endHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  endActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-start' },
  nextTitle: { maxWidth: 240, paddingHorizontal: space.xs },
  zones: { flex: 1, flexDirection: 'row' },
  column: { flexDirection: 'column' },
  zone: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(28, 27, 25, 0.10)', margin: 2, borderRadius: radius.md },
  zoneCenter: { backgroundColor: 'rgba(28, 27, 25, 0.04)' },
  zoneBadge: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(28, 27, 25, 0.78)', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  zoneText: { color: '#FFFFFF' },
});
