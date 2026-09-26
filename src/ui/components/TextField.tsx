import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, space, typography, useTheme } from '@/ui/theme';
import { Text } from './Text';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Helper below the field; replaced by `error` when present. */
  hint?: string;
  error?: string;
};

/** Label-above text field. Labels never disappear (placeholders-as-labels fail at 200% font and in TalkBack). */
export function TextField({ label, hint, error, ...input }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.focusRing : colors.borderStrong;
  return (
    <View style={styles.wrap}>
      <Text variant="labelSmall" color={error ? 'danger' : focused ? 'accent' : 'textSecondary'}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        maxFontSizeMultiplier={2}
        accessibilityLabel={label}
        {...input}
        onFocus={e => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          typography.body,
          { color: colors.textPrimary, borderColor: border, backgroundColor: colors.surface, borderWidth: focused || error ? 2 : 1 },
        ]}
      />
      {(error ?? hint) && (
        <Text variant="caption" color={error ? 'danger' : 'textSecondary'} accessibilityLiveRegion={error ? 'polite' : 'none'}>
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  input: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.md + 2, paddingVertical: space.sm },
});
