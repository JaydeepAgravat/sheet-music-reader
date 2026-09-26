import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/ui/icons';
import { radius, space, typography, useTheme } from '@/ui/theme';
import { IconButton } from './IconButton';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** Large variant for the library header on tablets. */
  size?: 'md' | 'lg';
  ref?: React.Ref<React.ComponentRef<typeof TextInput>>;
};

export function SearchBar({ value, onChangeText, placeholder, onSubmit, autoFocus, size = 'md', ref }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.bar,
        size === 'lg' && styles.lg,
        { backgroundColor: colors.surfaceSunken, borderColor: focused ? colors.focusRing : 'transparent' },
      ]}
    >
      <Icon name="magnifying-glass" size={20} color={focused ? 'textPrimary' : 'textSecondary'} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxFontSizeMultiplier={2}
        accessibilityLabel={placeholder}
        style={[styles.input, typography.body, { color: colors.textPrimary }]}
      />
      {value.length > 0 && <IconButton icon="x" size="sm" label={t('common.close')} onPress={() => onChangeText('')} color="textSecondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radius.pill,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    gap: space.sm,
    borderWidth: 1.5,
  },
  lg: { minHeight: 56 },
  input: { flex: 1, paddingVertical: space.sm, includeFontPadding: false },
});
