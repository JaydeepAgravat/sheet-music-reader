import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '@/ui/icons';
import { Surface, Text } from '@/ui/components';
import { motion, radius, useTheme } from '@/ui/theme';

export type NavItem = { key: string; label: string; icon: IconName };

type ItemProps = { item: NavItem; active: boolean; onPress: () => void; orientation: 'bar' | 'rail' };

/** M3-style destination: pill indicator grows behind the icon; icon switches Regular → Fill. */
export function NavDestination({ item, active, onPress, orientation }: ItemProps) {
  const { colors, reduceMotion } = useTheme();
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = reduceMotion ? withTiming(active ? 1 : 0, { duration: motion.duration.fast }) : withSpring(active ? 1 : 0, motion.springSnappy);
  }, [active, on, reduceMotion]);
  const pill = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scaleX: 0.5 + on.value * 0.5 }] }));

  return (
    <Surface
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      style={orientation === 'bar' ? styles.barItem : styles.railItem}
      rippleColor="transparent"
    >
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.pill, { backgroundColor: colors.accentContainer }, pill]} />
        <Icon name={item.icon} weight={active ? 'fill' : 'regular'} size={24} color={active ? 'onAccentContainer' : 'textSecondary'} />
      </View>
      {/* Nav labels grow to 1.3× at most (Material guidance) and shrink to fit long translations
          ("Einstellungen"), so they never truncate; TalkBack reads the full label anyway. */}
      <Text
        variant="labelSmall"
        color={active ? 'textPrimary' : 'textSecondary'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={1.3}
        style={styles.label}
      >
        {item.label}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 14, gap: 4 },
  railItem: { width: 80, alignItems: 'center', paddingVertical: 6, gap: 4 },
  iconSlot: { width: 64, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.pill },
  label: { maxWidth: 84 },
});
