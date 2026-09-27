import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '@/app/RootNavigator';
import { setPref } from '@/data/prefs';
import { Button, Text } from '@/ui/components';
import { breakpoints, radius, space, useTheme } from '@/ui/theme';
import { AnnotateArt, ImportArt, PedalArt } from './IntroArt';

const STEPS = [
  { key: 'import', Art: ImportArt },
  { key: 'pedal', Art: PedalArt },
  { key: 'annotate', Art: AnnotateArt },
] as const;

/** Content column cap on tablets. */
const MAX_WIDTH = 640;

/**
 * First-run intro: Import · Pedal · Annotate, skippable at any point. Shown once (pref `introDone`),
 * before the library, while the sample scores are added in the background. Can be replayed with
 * `navigate('Intro', { replay: true })`, which returns to the previous screen when finished.
 */
export function IntroScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Intro'>>();
  const replay = route.params?.replay ?? false;
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(window.width);
  const [step, setStep] = useState(0);
  const pager = useRef<ScrollViewInstance>(null);
  const last = step === STEPS.length - 1;

  const finish = useCallback(() => {
    setPref('introDone', true);
    if (replay && nav.canGoBack()) nav.goBack();
    else nav.reset({ index: 0, routes: [{ name: 'Main' }] });
  }, [nav, replay]);

  const goTo = useCallback(
    (i: number) => {
      setStep(i);
      pager.current?.scrollTo({ x: i * pageWidth, animated: !reduceMotion });
    },
    [pageWidth, reduceMotion],
  );

  // TalkBack: announce each step as it arrives (swipes and button presses alike).
  const firstAnnounce = useRef(true);
  useEffect(() => {
    if (firstAnnounce.current) {
      firstAnnounce.current = false;
      return;
    }
    const s = STEPS[step];
    if (s) AccessibilityInfo.announceForAccessibility(`${t('onboarding.stepOf', { step: step + 1, count: STEPS.length })}. ${t(`onboarding.${s.key}.title`)}`);
  }, [step, t]);

  // Back steps back through the intro before leaving it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      goTo(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [goTo, step]);

  // Keep the current step in view when the width changes (rotation, split screen).
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== pageWidth) {
      setPageWidth(w);
      requestAnimationFrame(() => pager.current?.scrollTo({ x: step * w, animated: false }));
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageWidth));
    if (i !== step && i >= 0 && i < STEPS.length) setStep(i);
  };

  const tablet = Math.min(window.width, window.height) >= breakpoints.medium;
  // Art shrinks on short (landscape phone) screens so the text never gets pushed off.
  const artSize = Math.round(Math.max(150, Math.min(tablet ? 320 : 240, window.height * 0.3)));

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.topBar, { paddingLeft: insets.left + space.lg, paddingRight: insets.right + space.sm }]}>
        {!last && <Button label={t('onboarding.skip')} variant="ghost" onPress={finish} accessibilityHint={t('onboarding.skipHint')} />}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={onLayout}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
      >
        {STEPS.map(({ key, Art }, i) => (
          <View
            key={key}
            style={[styles.page, { width: pageWidth, paddingLeft: insets.left, paddingRight: insets.right }]}
            // Off-screen steps stay out of TalkBack's way.
            importantForAccessibility={i === step ? 'auto' : 'no-hide-descendants'}
          >
            <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.column}>
                <View style={styles.art}>
                  <Art size={artSize} />
                </View>
                <Text variant="overline" color="accent" align="center">
                  {t('onboarding.stepOf', { step: i + 1, count: STEPS.length }).toUpperCase()}
                </Text>
                <Text variant="display" align="center" accessibilityRole="header" style={styles.title}>
                  {t(`onboarding.${key}.title`)}
                </Text>
                <Text variant="body" color="textSecondary" align="center" style={styles.body}>
                  {t(`onboarding.${key}.body`)}
                </Text>
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingLeft: insets.left + space.xl, paddingRight: insets.right + space.xl }]}>
        <View style={styles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
          {STEPS.map(({ key }, i) => (
            <View key={key} style={[styles.dot, { backgroundColor: i === step ? colors.accent : colors.borderStrong }, i === step && styles.dotActive]} />
          ))}
        </View>
        <Button
          label={last ? t('onboarding.start') : t('onboarding.next')}
          icon={last ? undefined : 'arrow-right'}
          size="lg"
          onPress={last ? finish : () => goTo(step + 1)}
          accessibilityHint={last ? t('onboarding.startHint') : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { minHeight: 56, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  pager: { flex: 1 },
  pagerContent: { flexGrow: 1 },
  page: { flex: 1 },
  pageScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.lg },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', alignItems: 'center', gap: space.md },
  art: { marginBottom: space.lg },
  title: { marginTop: space.xs },
  body: { maxWidth: 460 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.lg,
    width: '100%',
    maxWidth: MAX_WIDTH + 2 * space.xl,
    alignSelf: 'center',
  },
  dots: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  dotActive: { width: 24 },
});
