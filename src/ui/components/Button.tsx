import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/ui/icons';
import { minTouch, radius, space, useTheme, type ColorTokens } from '@/ui/theme';
import { Surface } from './Surface';
import { Text } from './Text';

type Variant = 'primary' | 'tonal' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width. */
  block?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

const palette: Record<Variant, { bg: keyof ColorTokens | null; fg: keyof ColorTokens; border?: keyof ColorTokens }> = {
  primary: { bg: 'accent', fg: 'onAccent' },
  tonal: { bg: 'accentContainer', fg: 'onAccentContainer' },
  secondary: { bg: 'surface', fg: 'textPrimary', border: 'borderStrong' },
  ghost: { bg: null, fg: 'accent' },
  danger: { bg: 'danger', fg: 'onDanger' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  block = false,
  accessibilityHint,
  style,
}: Props) {
  const { colors } = useTheme();
  const p = palette[variant];
  const inactive = disabled || loading;
  const onDark = variant === 'primary' || variant === 'danger';

  return (
    <View style={[styles.wrap, block && styles.block, style]}>
      <Surface
        onPress={onPress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        rippleColor={onDark ? 'rgba(255,255,255,0.18)' : undefined}
        style={[
          styles.base,
          size === 'lg' ? styles.lg : styles.md,
          {
            backgroundColor: p.bg ? colors[p.bg] : 'transparent',
            borderColor: p.border ? colors[p.border] : 'transparent',
            opacity: disabled ? 0.38 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors[p.fg]} />
        ) : (
          <>
            {icon && <Icon name={icon} size={size === 'lg' ? 22 : 20} color={p.fg} />}
            <Text variant="label" color={p.fg} numberOfLines={1} style={size === 'lg' && styles.lgText}>
              {label}
            </Text>
          </>
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden', alignSelf: 'flex-start' },
  block: { alignSelf: 'stretch' },
  base: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  md: { paddingHorizontal: space.lg + 4 },
  lg: { minHeight: 56, paddingHorizontal: space.xl },
  lgText: { fontSize: 15.5 },
});
