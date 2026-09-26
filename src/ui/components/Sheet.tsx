import React, { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { breakpoints, motion, radius, space, useTheme } from '@/ui/theme';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/**
 * Bottom sheet: drag the handle/header down (or tap the scrim, or press back) to close.
 * On tablets it floats centred with a max width, instead of spanning a 14" screen edge to edge.
 */
export function Sheet({ visible, onClose, title, children }: Props) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const isWide = width >= breakpoints.medium;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      progress.value = reduceMotion ? withTiming(1, { duration: motion.duration.fast }) : withSpring(1, motion.spring);
    } else if (mounted) {
      progress.value = withTiming(0, { duration: motion.duration.base, easing: Easing.in(Easing.quad) }, done => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
  }, [visible, mounted, progress, drag, reduceMotion]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const pan = usePanGesture({
    activeOffsetY: 6,
    onUpdate: e => {
      'worklet';
      drag.value = Math.max(0, e.translationY);
    },
    onDeactivate: e => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) {
        scheduleOnRN(onClose);
      } else {
        drag.value = withSpring(0, motion.spring);
      }
    },
  });

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (reduceMotion ? 24 : height * 0.6) + drag.value }],
    opacity: reduceMotion ? progress.value : 1,
  }));

  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrim]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceRaised,
              paddingBottom: insets.bottom + space.lg,
              maxHeight: height - insets.top - space.xxl,
            },
            isWide && styles.sheetWide,
            sheet,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
              {title && (
                <Text variant="titleM" accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
              )}
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    elevation: 12,
    shadowColor: '#000',
  },
  sheetWide: { left: '50%', right: undefined, width: 640, marginLeft: -320 },
  header: { paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: space.xl, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: space.md },
  title: { alignSelf: 'flex-start' },
});
