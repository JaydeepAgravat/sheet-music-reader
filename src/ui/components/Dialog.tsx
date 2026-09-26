import React, { useEffect } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { motion, radius, space, useTheme } from '@/ui/theme';
import { Button } from './Button';
import { Text } from './Text';

type Action = { label: string; onPress: () => void; variant?: 'primary' | 'danger' | 'ghost' };

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  /** Right-most action is the confirming one. Destructive confirmations use variant 'danger'. */
  confirm: Action;
  cancel: Omit<Action, 'variant'>;
  /** Tapping the scrim or pressing back cancels (default true). */
  dismissable?: boolean;
};

/** Confirmation dialog. Used sparingly: we prefer undo over confirmation (docs/PLAN.md §1.4). */
export function Dialog({ visible, title, body, confirm, cancel, dismissable = true }: Props) {
  const { colors, reduceMotion } = useTheme();

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissable) cancel.onPress();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismissable, cancel]);

  if (!visible) return null;
  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={cancel.onPress}>
      <Animated.View entering={FadeIn.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)} style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? cancel.onPress : undefined} accessible={false} />
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(motion.duration.fast) : ZoomIn.springify().damping(24).stiffness(320).withInitialValues({ transform: [{ scale: 0.94 }] })}
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: colors.surfaceRaised }]}
        >
          <Text variant="titleM" accessibilityRole="header">
            {title}
          </Text>
          {body && (
            <Text variant="body" color="textSecondary" style={styles.body}>
              {body}
            </Text>
          )}
          <View style={styles.actions}>
            <Button label={cancel.label} variant="ghost" onPress={cancel.onPress} />
            <Button label={confirm.label} variant={confirm.variant ?? 'primary'} onPress={confirm.onPress} />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.sheet, padding: space.xl, paddingBottom: space.lg, elevation: 16, shadowColor: '#000' },
  body: { marginTop: space.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.xl },
});
