import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/ui/icons';
import { minTouch, space, useTheme } from '@/ui/theme';
import { Surface } from './Surface';
import { Text } from './Text';

type Props = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Trailing element: a Switch, a value label, a chevron… */
  trailing?: React.ReactNode;
  /** Shows a caret-right when the row navigates. */
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function ListRow({ title, subtitle, icon, trailing, chevron, onPress, destructive, disabled }: Props) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon && (
        <View style={[styles.iconWell, { backgroundColor: destructive ? colors.dangerContainer : colors.surfaceSunken }]}>
          <Icon name={icon} size={20} color={destructive ? 'onDangerContainer' : 'textPrimary'} />
        </View>
      )}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={destructive ? 'danger' : 'textPrimary'}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {chevron && <Icon name="caret-right" size={18} color="textTertiary" />}
    </>
  );
  if (!onPress) {
    return <View style={[styles.row, { opacity: disabled ? 0.38 : 1 }]}>{content}</View>;
  }
  return (
    <Surface
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[styles.row, { opacity: disabled ? 0.38 : 1 }]}
    >
      {content}
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: minTouch + 8, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, gap: space.md + 2 },
  iconWell: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
