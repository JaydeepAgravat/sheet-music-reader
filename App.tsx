// First: fatal JS errors are saved on the device (never sent) so the next launch can offer to share them.
import '@/features/support/installCrashHandler';
import './src/i18n';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@/app/RootNavigator';
import { navigationRef } from '@/app/navigationRef';
import { ImportHost } from '@/features/import/ImportHost';
import { BackupProgressHost } from '@/features/backup/BackupSettings';
import { PedalHost } from '@/features/pedals/PedalHost';
import { CrashPromptHost } from '@/features/support/CrashPromptHost';
import { initBilling } from '@/features/billing/entitlement';
import { getDb } from '@/data/db/database';
import { FeedbackHost } from '@/ui/feedback/FeedbackHost';
import { ThemeProvider, useTheme } from '@/ui/theme';

// Open + migrate the library DB before the first screen renders (synchronous, a few ms).
getDb();
// Pro entitlement: cached state is live immediately; Play re-verifies in the background.
initBilling();

function Navigation() {
  const { colors, isDark } = useTheme();
  const navTheme = useMemo<NavTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.canvas,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.borderSubtle,
        notification: colors.accent,
      },
    };
  }, [colors, isDark]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <RootNavigator />
      <PedalHost />
      <ImportHost />
      <BackupProgressHost />
      <FeedbackHost />
      <CrashPromptHost />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Navigation />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
