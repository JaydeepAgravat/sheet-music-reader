import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/ui/icons';
import { Surface } from '@/ui/components/Surface';
import { Text } from '@/ui/components/Text';
import { elevation, motion, radius, space, useTheme } from '@/ui/theme';
import { useFeedback, type SnackbarSpec, type ToastSpec } from './store';

/** Mount once near the app root, above navigation. Renders the current snackbar and toast. */
export function FeedbackHost() {
  const snackbar = useFeedback(s => s.snackbar);
  const toast = useFeedback(s => s.toast);
  const obstruction = useFeedback(s => s.bottomObstruction);
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {toast && <Toast key={toast.id} spec={toast} top={insets.top + space.md} />}
      {snackbar && <Snackbar key={snackbar.id} spec={snackbar} bottom={Math.max(insets.bottom, obstruction) + space.md} />}
    </View>
  );
}

function Snackbar({ spec, bottom }: { spec: SnackbarSpec; bottom: number }) {
  const { colors, reduceMotion } = useTheme();
  const dismiss = useFeedback(s => s.dismissSnackbar);
  const dx = useSharedValue(0);
  const duration = spec.duration ?? (spec.action ? 6000 : 4000);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(spec.message);
    const t = setTimeout(() => dismiss(spec.id), duration);
    return () => clearTimeout(t);
  }, [spec, duration, dismiss]);

  const swipe = usePanGesture({
    activeOffsetX: [-12, 12],
    onUpdate: e => {
      'worklet';
      dx.value = e.translationX;
    },
    onDeactivate: e => {
      'worklet';
      if (Math.abs(e.translationX) > 90 || Math.abs(e.velocityX) > 800) {
        dx.value = withTiming(Math.sign(e.translationX) * 500, { duration: motion.duration.fast });
        scheduleOnRN(dismiss, spec.id);
      } else {
        dx.value = withSpring(0, motion.spring);
      }
    },
  });
  const drag = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }], opacity: 1 - Math.min(Math.abs(dx.value) / 300, 0.6) }));

  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(motion.duration.fast) : SlideInDown.springify().damping(motion.spring.damping).stiffness(motion.spring.stiffness)}
      exiting={reduceMotion ? FadeOut.duration(motion.duration.fast) : SlideOutDown.duration(motion.duration.base)}
      style={[styles.snackWrap, { bottom }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={swipe}>
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[styles.snack, elevation.high, { backgroundColor: colors.inverseSurface }, drag]}
        >
          <Text variant="body" color="onInverseSurface" style={styles.snackText} numberOfLines={2}>
            {spec.message}
          </Text>
          {spec.action && (
            <Surface
              onPress={() => {
                spec.action?.onPress();
                useFeedback.setState({ snackbar: null });
              }}
              accessibilityRole="button"
              accessibilityLabel={spec.action.label}
              rippleColor="rgba(174,185,244,0.2)"
              style={styles.snackAction}
            >
              <Text variant="label" color="inverseAccent">
                {spec.action.label}
              </Text>
            </Surface>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

function Toast({ spec, top }: { spec: ToastSpec; top: number }) {
  const { colors } = useTheme();
  const dismiss = useFeedback(s => s.dismissToast);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(spec.message);
    const t = setTimeout(() => dismiss(spec.id), spec.duration ?? 2000);
    return () => clearTimeout(t);
  }, [spec, dismiss]);

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.base)}
      exiting={FadeOut.duration(motion.duration.base)}
      style={[styles.toastWrap, { top }]}
      pointerEvents="none"
    >
      <View style={[styles.toast, elevation.mid, { backgroundColor: colors.inverseSurface }]}>
        {spec.icon && <Icon name={spec.icon} size={18} color="onInverseSurface" />}
        <Text variant="label" color="onInverseSurface" numberOfLines={1}>
          {spec.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  snackWrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  snack: {
    width: '100%',
    maxWidth: 560,
    minHeight: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.lg,
    paddingRight: space.xs,
  },
  snackText: { flex: 1, paddingVertical: space.md },
  snackAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.sm },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
});
