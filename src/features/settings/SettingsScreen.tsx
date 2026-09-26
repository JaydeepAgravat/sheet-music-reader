import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Divider, ListRow, SegmentedControl, Switch, Text } from '@/ui/components';
import { Screen } from '@/ui/layout/Screen';
import { usePref, type ThemeMode } from '@/data/prefs';
import { radius, space, useTheme } from '@/ui/theme';
import type { RootStackParamList } from '@/app/RootNavigator';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [themeMode, setThemeMode] = usePref('themeMode');
  const [haptics, setHaptics] = usePref('hapticsEnabled');

  return (
    <Screen title={t('nav.settings')}>
      <View style={styles.column}>
        <Text variant="overline" color="textSecondary" style={styles.section}>
          {t('settings.appearance').toUpperCase()}
        </Text>
        <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.padded}>
            <Text variant="bodyStrong" style={styles.label}>
              {t('settings.theme')}
            </Text>
            <SegmentedControl<ThemeMode>
              value={themeMode}
              onChange={setThemeMode}
              segments={[
                { value: 'system', label: t('settings.themeSystem'), icon: 'circle-half' },
                { value: 'light', label: t('settings.themeLight'), icon: 'sun' },
                { value: 'dark', label: t('settings.themeDark'), icon: 'moon' },
              ]}
            />
          </View>
          <Divider inset={space.lg} />
          <ListRow
            icon="vibrate"
            title={t('settings.haptics')}
            subtitle={t('settings.hapticsHint')}
            trailing={<Switch value={haptics} onValueChange={setHaptics} label={t('settings.haptics')} />}
          />
        </View>

        {__DEV__ && (
          <View style={[styles.group, styles.devGroup, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <ListRow icon="palette" title={t('settings.designShowcase')} chevron onPress={() => nav.navigate('Showcase')} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 720, width: '100%', alignSelf: 'center' },
  section: { marginTop: space.lg, marginBottom: space.sm, marginLeft: space.xs },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  devGroup: { marginTop: space.xl },
  padded: { padding: space.lg },
  label: { marginBottom: space.md },
});
