import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/ui/theme';
import { Button } from './Button';
import { Text } from './Text';
import type { IconName } from '@/ui/icons';

type Props = {
  art: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
};

export function EmptyState({ art, title, body, action }: Props) {
  return (
    <View style={styles.wrap}>
      {art}
      <Text variant="titleL" align="center" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" align="center" style={styles.body}>
        {body}
      </Text>
      {action && <Button label={action.label} icon={action.icon} size="lg" onPress={action.onPress} style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxl, maxWidth: 440, alignSelf: 'center' },
  title: { marginTop: space.lg },
  body: { marginTop: space.sm },
  action: { marginTop: space.xl, alignSelf: 'center' },
});
