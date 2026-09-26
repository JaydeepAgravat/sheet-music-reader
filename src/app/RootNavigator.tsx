import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { CollectionsScreen } from '@/features/collections/CollectionsScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { SetlistsScreen } from '@/features/setlists/SetlistsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ShowcaseScreen } from '@/features/showcase/ShowcaseScreen';
import { useTheme } from '@/ui/theme';
import { createAdaptiveTabs } from './navigation/AdaptiveTabs';

export type RootStackParamList = {
  Main: undefined;
  Showcase: undefined;
};

export type MainTabParamList = {
  Library: undefined;
  Setlists: undefined;
  Collections: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createAdaptiveTabs();

function MainTabs() {
  const { t } = useTranslation();
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Library" component={LibraryScreen} options={{ title: t('nav.library'), icon: 'books' }} />
      <Tabs.Screen name="Setlists" component={SetlistsScreen} options={{ title: t('nav.setlists'), icon: 'playlist' }} />
      <Tabs.Screen name="Collections" component={CollectionsScreen} options={{ title: t('nav.collections'), icon: 'folders' }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings'), icon: 'gear-six' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'fade_from_bottom',
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Showcase" component={ShowcaseScreen} />
    </Stack.Navigator>
  );
}
