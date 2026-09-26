import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';
import { Surface } from './Surface';
import { Text } from './Text';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Shows a trailing caret — for chips that open a picker (e.g. "Composer ▾"). */
  dropdown?: boolean;
  /** Count badge, e.g. number of selected composers. */
  count?: number;
};

/** Filter / choice chip. 32dp visual inside a 48dp touch row (via hitSlop). */
export function Chip({ label, selected = false, onPress, icon, dropdown, count }: Props) {
  const { colors } = useTheme();
  const fg = selected ? 'onAccentContainer' : 'textPrimary';
  return (
    <View style={styles.wrap}>
      <Surface
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button"
        accessibilityLabel={count ? `${label}, ${count}` : label}
        accessibilityState={{ selected }}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? colors.accentContainer : colors.surface,
            borderColor: selected ? colors.accentContainer : colors.borderStrong,
          },
        ]}
      >
        {selected && !icon && <Icon name="check" size={16} color={fg} />}
        {icon && <Icon name={icon} size={16} weight={selected ? 'fill' : 'regular'} color={fg} />}
        <Text variant="label" color={fg} numberOfLines={1}>
          {label}
        </Text>
        {!!count && (
          <View style={[styles.count, { backgroundColor: colors.accent }]}>
            <Text variant="labelSmall" color="onAccent">
              {count}
            </Text>
          </View>
        )}
        {dropdown && <Icon name="caret-down" size={14} color={fg} />}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.pill, overflow: 'hidden' },
  chip: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  count: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
});
