import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/ui/icons';
import { minTouch, useTheme, type ColorTokens } from '@/ui/theme';
import { Surface } from './Surface';

type Props = {
  icon: IconName;
  /** Required: icon-only controls must be labelled for TalkBack. */
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Toggle state: switches to the Fill glyph on an accent container. */
  selected?: boolean;
  disabled?: boolean;
  color?: keyof ColorTokens;
  /** 'standard' is transparent; 'tonal' has a soft container at rest. */
  variant?: 'standard' | 'tonal';
  size?: 'md' | 'sm';
};

/** 48dp touch target around a 40dp (or 36dp) visual. */
export function IconButton({
  icon,
  label,
  onPress,
  onLongPress,
  selected,
  disabled,
  color = 'textPrimary',
  variant = 'standard',
  size = 'md',
}: Props) {
  const { colors } = useTheme();
  const visual = size === 'md' ? 40 : 36;
  const bg = selected ? colors.accentContainer : variant === 'tonal' ? colors.surfaceSunken : 'transparent';
  return (
    <Surface
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={selected === undefined ? 'button' : 'togglebutton'}
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      borderless
      rippleRadius={visual / 2 + 2}
      style={styles.target}
      hitSlop={4}
    >
      <View style={[styles.visual, { width: visual, height: visual, borderRadius: visual / 2, backgroundColor: bg, opacity: disabled ? 0.38 : 1 }]}>
        <Icon
          name={icon}
          weight={selected ? 'fill' : 'regular'}
          size={size === 'md' ? 24 : 20}
          color={selected ? 'onAccentContainer' : color}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  target: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  visual: { alignItems: 'center', justifyContent: 'center' },
});
