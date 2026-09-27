import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '@/app/RootNavigator';
import { Divider, ListRow } from '@/ui/components';
import { space } from '@/ui/theme';
import { getAppInfo } from './appInfo';

/**
 * Settings › About: Help & feedback, Privacy policy, Licences and the version line.
 * Rows only, like ReadingSettings / BackupSettings: the settings screen owns the section title
 * (t('support.about')) and the rounded group container.
 */
export function AboutSettings() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const info = getAppInfo();
  return (
    <>
      <ListRow
        icon="lifebuoy"
        title={t('support.help')}
        subtitle={t('support.helpHint')}
        chevron
        onPress={() => nav.navigate('Help')}
      />
      <Divider inset={space.lg} />
      <ListRow
        icon="shield-check"
        title={t('support.privacy')}
        subtitle={t('support.privacyHint')}
        chevron
        onPress={() => nav.navigate('Privacy')}
      />
      <Divider inset={space.lg} />
      <ListRow
        icon="book-open"
        title={t('support.licences')}
        subtitle={t('support.licencesHint')}
        chevron
        onPress={() => nav.navigate('Licences')}
      />
      <Divider inset={space.lg} />
      <ListRow
        icon="info"
        title={t('support.versionLine', {
          name: info.appName,
          version: info.version,
          build: info.build,
        })}
      />
    </>
  );
}
