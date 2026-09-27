import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SUPPORT_EMAIL } from '@/config/support';
import { Text } from '@/ui/components';
import { Icon, type IconName } from '@/ui/icons';
import { Screen } from '@/ui/layout/Screen';
import { radius, space, useTheme } from '@/ui/theme';

type Section = 'account' | 'analytics' | 'network' | 'device' | 'files' | 'backups' | 'crash';

const SECTIONS: readonly { id: Section; icon: IconName }[] = [
  { id: 'account', icon: 'user' },
  { id: 'analytics', icon: 'eye-slash' },
  { id: 'network', icon: 'globe-simple' },
  { id: 'device', icon: 'lock-simple' },
  { id: 'files', icon: 'folder-open' },
  { id: 'backups', icon: 'archive' },
  { id: 'crash', icon: 'warning-circle' },
];

/**
 * The privacy policy, in the app (works offline). docs/PRIVACY.md holds the same text for the
 * Play Store listing's hosted page — keep the two in step.
 */
export function PrivacyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const nav = useNavigation();
  const p = 'support.privacyScreen' as const;

  return (
    <Screen title={t(`${p}.title`)} onBack={() => nav.goBack()}>
      <View style={styles.column}>
        <Text variant="caption" color="textTertiary" style={styles.updated}>
          {t(`${p}.updated`)}
        </Text>
        <View style={[styles.summary, { backgroundColor: colors.accentContainer }]}>
          <Icon name="shield-check" size={24} color="onAccentContainer" />
          <Text variant="titleS" color="onAccentContainer" style={styles.flex}>
            {t(`${p}.summary`)}
          </Text>
        </View>

        {SECTIONS.map(({ id, icon }) => (
          <View key={id} style={styles.section}>
            <View style={styles.heading}>
              <Icon name={icon} size={20} color="textSecondary" />
              <Text variant="titleS" accessibilityRole="header" style={styles.flex}>
                {t(`${p}.${id}Title`)}
              </Text>
            </View>
            <Text variant="body" color="textSecondary">
              {t(`${p}.${id}Body`)}
            </Text>
          </View>
        ))}

        <View style={styles.section}>
          <Text variant="titleS" accessibilityRole="header" style={styles.plainHeading}>
            {t(`${p}.changesTitle`)}
          </Text>
          <Text variant="body" color="textSecondary">
            {t(`${p}.changesBody`)}
          </Text>
        </View>
        <View style={styles.section}>
          <Text variant="titleS" accessibilityRole="header" style={styles.plainHeading}>
            {t(`${p}.contactTitle`)}
          </Text>
          <Text variant="body" color="textSecondary" selectable>
            {t(`${p}.contactBody`, { email: SUPPORT_EMAIL })}
          </Text>
        </View>
        <Text variant="caption" color="textTertiary" style={styles.listing}>
          {t(`${p}.listing`)}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  updated: { marginBottom: space.md },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
  },
  flex: { flex: 1 },
  section: { marginTop: space.xl },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  plainHeading: { marginBottom: space.xs },
  listing: { marginTop: space.xl },
});
