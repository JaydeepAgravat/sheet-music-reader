import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '@/app/RootNavigator';
import { haptic } from '@/platform/haptics';
import { Button, IconButton, Skeleton, Text } from '@/ui/components';
import { Icon, type IconName } from '@/ui/icons';
import { breakpoints, motion, radius, space, useTheme } from '@/ui/theme';
import { acknowledgeUnlock, buyPro, FREE_SCORE_LIMIT, refreshPrice, restorePurchases, usePro, type ProReason } from './entitlement';

const CLOSE_AFTER_UNLOCK_MS = 1800;

/**
 * The one paywall (docs/PLAN.md §1.4): honest, single screen, only ever opened by a Pro action.
 * No countdowns, no fake discounts, obvious close. Tablet: centred card over a scrim; phone: full
 * screen. The price always comes from Play.
 */
export function PaywallScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const nav = useNavigation();
  const { reason } = useRoute<RouteProp<RootStackParamList, 'Paywall'>>().params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= breakpoints.medium;

  const isPro = usePro(s => s.isPro);
  const justUnlocked = usePro(s => s.justUnlocked);
  // Already Pro when it opened (e.g. restored elsewhere): a quiet thank-you, no celebration.
  const proAtOpen = useRef(isPro).current;

  const close = () => {
    if (nav.canGoBack()) nav.goBack();
  };

  useEffect(() => {
    if (usePro.getState().price === null) refreshPrice().catch(() => undefined);
    return acknowledgeUnlock;
  }, []);

  const celebrating = justUnlocked || (isPro && !proAtOpen);
  useEffect(() => {
    if (!celebrating) return;
    haptic('confirm');
    const timer = setTimeout(() => {
      if (nav.canGoBack()) nav.goBack();
    }, CLOSE_AFTER_UNLOCK_MS);
    return () => clearTimeout(timer);
  }, [celebrating, nav]);

  const body = celebrating ? (
    <Unlocked title={t('billing.paywall.unlockedTitle')} body={t('billing.paywall.unlockedBody')} onDone={close} />
  ) : isPro ? (
    <Unlocked title={t('billing.paywall.alreadyProTitle')} body={t('billing.paywall.alreadyProBody')} onDone={close} />
  ) : (
    <Offer reason={reason} />
  );

  const closeButton = (
    <View style={styles.closeRow}>
      <IconButton icon="x" label={t('common.close')} onPress={close} />
    </View>
  );

  if (!wide) {
    return (
      <View style={[styles.phone, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {closeButton}
        <ScrollView contentContainerStyle={styles.phoneContent}>{body}</ScrollView>
      </View>
    );
  }
  return (
    <View style={[styles.scrim, { backgroundColor: colors.scrim, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
      {/* Scrim: tap outside to close. Hidden from TalkBack (the card has its own Close button). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} importantForAccessibility="no" />
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surfaceRaised }]}>
        {closeButton}
        <ScrollView contentContainerStyle={styles.cardContent}>{body}</ScrollView>
      </View>
    </View>
  );
}

function contextLine(reason: ProReason, t: ReturnType<typeof useTranslation>['t']): string {
  switch (reason) {
    case 'imports':
      return t('billing.paywall.reasonImports', { limit: FREE_SCORE_LIMIT });
    case 'setlists':
      return t('billing.paywall.reasonSetlists');
    default:
      return t('billing.paywall.reasonSettings');
  }
}

const BENEFITS: ReadonlyArray<{ key: 'scores' | 'setlists' | 'tools' | 'devices' | 'offline'; icon: IconName }> = [
  { key: 'scores', icon: 'infinity' },
  { key: 'setlists', icon: 'playlist' },
  { key: 'tools', icon: 'sparkle' },
  { key: 'devices', icon: 'devices' },
  { key: 'offline', icon: 'wifi-slash' },
];

function Offer({ reason }: { reason: ProReason }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const price = usePro(s => s.price);
  const available = usePro(s => s.available);
  const busy = usePro(s => s.busy);
  const error = usePro(s => s.error);
  const pending = usePro(s => s.state === 'pending');

  const unavailable = available === false || error === 'unavailable';
  const loadingPrice = price === null && !unavailable && error !== 'notFound';
  const status: { icon: IconName; text: string; tone: 'neutral' | 'danger' } | null = pending
    ? { icon: 'hourglass-medium', text: t('billing.paywall.pending'), tone: 'neutral' }
    : unavailable
    ? { icon: 'info', text: t('billing.paywall.unavailable'), tone: 'neutral' }
    : error === 'notFound'
    ? { icon: 'warning-circle', text: t('billing.paywall.notFound'), tone: 'danger' }
    : error === 'failed'
    ? { icon: 'warning-circle', text: t('billing.paywall.failed'), tone: 'danger' }
    : null;

  return (
    <View style={styles.offer}>
      <View style={[styles.badge, { backgroundColor: colors.accentContainer }]}>
        <Icon name="sparkle" weight="fill" size={16} color="onAccentContainer" />
        <Text variant="labelSmall" color="onAccentContainer">
          {t('billing.pro')}
        </Text>
      </View>
      <Text variant="display" accessibilityRole="header">
        {t('billing.paywall.headline')}
      </Text>
      <Text variant="body" color="textSecondary">
        {contextLine(reason, t)}
      </Text>

      <View style={styles.benefits}>
        {BENEFITS.map(b => (
          <View key={b.key} style={styles.benefit}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.surfaceSunken }]}>
              <Icon name={b.icon} size={22} color="accent" />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{t(`billing.benefits.${b.key}.title`)}</Text>
              <Text variant="caption" color="textSecondary">
                {t(`billing.benefits.${b.key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.priceBlock, { borderColor: colors.borderSubtle }]}>
        {loadingPrice ? (
          <View accessible accessibilityLabel={t('billing.paywall.loadingPrice')}>
            <Skeleton width={120} height={34} />
          </View>
        ) : (
          <Text variant="titleL" accessibilityLabel={price ?? t('billing.paywall.priceUnknown')}>
            {price ?? '—'}
          </Text>
        )}
        <Text variant="caption" color="textSecondary" align="center">
          {t('billing.paywall.terms')}
        </Text>
      </View>

      {status && (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.status, { backgroundColor: status.tone === 'danger' ? colors.dangerContainer : colors.surfaceSunken }]}
        >
          <Icon name={status.icon} size={20} color={status.tone === 'danger' ? 'onDangerContainer' : 'textSecondary'} />
          <Text variant="caption" color={status.tone === 'danger' ? 'onDangerContainer' : 'textSecondary'} style={styles.flex}>
            {status.text}
          </Text>
        </View>
      )}

      <Button
        label={price ? t('billing.paywall.buyWithPrice', { price }) : t('billing.paywall.buy')}
        size="lg"
        block
        loading={busy}
        disabled={!price || unavailable || pending}
        onPress={buyPro}
      />
      <Button label={t('billing.restore.action')} variant="ghost" block disabled={busy} onPress={restorePurchases} />
      <Text variant="caption" color="textTertiary" align="center">
        {t('billing.paywall.keepYours')}
      </Text>
    </View>
  );
}

function Unlocked({ title, body, onDone }: { title: string; body: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(motion.duration.base)} style={styles.unlocked} accessibilityLiveRegion="polite">
      <Animated.View
        entering={reduceMotion ? undefined : ZoomIn.springify().damping(22).stiffness(260).withInitialValues({ transform: [{ scale: 0.8 }] })}
        style={[styles.check, { backgroundColor: colors.accentContainer }]}
      >
        <Icon name="check" size={40} color="onAccentContainer" />
      </Animated.View>
      <Text variant="display" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {body}
      </Text>
      <Button label={t('common.done')} variant="tonal" onPress={onDone} style={styles.done} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  phone: { flex: 1 },
  phoneContent: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  card: { width: '100%', maxWidth: 560, maxHeight: '100%', borderRadius: radius.sheet, overflow: 'hidden', elevation: 16, shadowColor: '#000' },
  cardContent: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.sm, paddingTop: space.sm },
  offer: { gap: space.md },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill },
  benefits: { gap: space.lg, marginVertical: space.md },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  benefitIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  priceBlock: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  unlocked: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  check: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  done: { marginTop: space.lg },
});
