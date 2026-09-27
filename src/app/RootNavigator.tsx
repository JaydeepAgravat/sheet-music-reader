import React, { useEffect, useState } from 'react';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { CollectionScreen } from '@/features/collections/CollectionScreen';
import { CollectionsScreen } from '@/features/collections/CollectionsScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { SetlistsScreen } from '@/features/setlists/SetlistsScreen';
import { SetlistScreen } from '@/features/setlists/SetlistScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { ShowcaseScreen } from '@/features/showcase/ShowcaseScreen';
import { RendererLabScreen } from '@/features/dev/RendererLabScreen';
import { PedalsScreen } from '@/features/pedals/PedalsScreen';
import { ReaderScreen } from '@/features/reader/ReaderScreen';
import { TrashScreen } from '@/features/library/TrashScreen';
import { HelpScreen } from '@/features/support/HelpScreen';
import { LicencesScreen } from '@/features/support/LicencesScreen';
import { PrivacyScreen } from '@/features/support/PrivacyScreen';
import { PaywallScreen } from '@/features/billing/PaywallScreen';
import { IntroScreen } from '@/features/onboarding/IntroScreen';
import { seedSamplesOnce } from '@/features/onboarding/seedSamples';
import { getPref } from '@/data/prefs';
import { useTheme } from '@/ui/theme';
import { createAdaptiveTabs } from './navigation/AdaptiveTabs';

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  /** First-run intro; `replay` (e.g. from Help) returns to the previous screen when done. */
  Intro: { replay?: boolean } | undefined;
  Showcase: undefined;
  RendererLab: undefined;
  /**
   * startPage overrides the remembered page. With setlistId the reader plays the setlist from
   * itemIndex (scoreId is that item's score, for transitions and fallbacks).
   */
  Reader: { scoreId: string; startPage?: number; setlistId?: string; itemIndex?: number };
  Pedals: undefined;
  Trash: undefined;
  Collection: { collectionId: string };
  /** addSongs: open the "Add songs" sheet straight away (a brand-new setlist). */
  Setlist: { setlistId: string; addSongs?: boolean };
  Help: undefined;
  Privacy: undefined;
  Licences: undefined;
  /** Why it opened (context line). Open via openPaywall()/requirePro() in features/billing/entitlement. */
  Paywall: { reason: 'imports' | 'setlists' | 'settings' };
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
  // Read once: the intro is the first screen until it's finished or skipped.
  const [initialRoute] = useState<'Intro' | 'Main'>(() => (getPref('introDone') ? 'Main' : 'Intro'));
  // First launch: add the bundled sample scores in the background (no-op afterwards).
  useEffect(() => {
    seedSamplesOnce().catch(() => {});
  }, []);
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'fade_from_bottom',
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Intro" component={IntroScreen} options={{ animation: 'fade', animationDuration: 200 }} />
      <Stack.Screen name="Showcase" component={ShowcaseScreen} />
      <Stack.Screen name="RendererLab" component={RendererLabScreen} />
      <Stack.Screen
        name="Reader"
        component={ReaderScreen}
        options={{ animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: colors.readerBackdrop } }}
      />
      <Stack.Screen name="Pedals" component={PedalsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Trash" component={TrashScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Collection" component={CollectionScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Setlist" component={SetlistScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Licences" component={LicencesScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ presentation: 'transparentModal', animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: 'transparent' } }}
      />
    </Stack.Navigator>
  );
}
