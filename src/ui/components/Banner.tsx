import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  icon: IconName;
  message: string;
  action?: { label: string; onPress: () => void };
  onDismiss: () => void;
};

/** Quiet, dismissible in-flow notice (e.g. the one-time backup reminder). Never modal, never repeats once dismissed. */
export function Banner({ icon, message, action, onDismiss }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: colors.accentContainer }]} accessibilityRole="summary">
      <Icon name={icon} size={22} color="onAccentContainer" />
      <View style={styles.body}>
        <Text variant="body" color="onAccentContainer">
          {message}
        </Text>
        {action && <Button label={action.label} variant="ghost" onPress={action.onPress} style={styles.action} />}
      </View>
      <IconButton icon="x" size="sm" label={t('common.close')} onPress={onDismiss} color="onAccentContainer" />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderRadius: radius.lg, paddingLeft: space.lg, paddingTop: space.md, paddingRight: space.xs },
  body: { flex: 1, paddingTop: 1, paddingBottom: space.xs },
  action: { marginLeft: -space.lg, marginTop: space.xxs },
});
