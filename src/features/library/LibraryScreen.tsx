import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, SearchBar } from '@/ui/components';
import { showToast, useFeedback } from '@/ui/feedback/store';
import { EmptyLibraryArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';
import { space } from '@/ui/theme';

/** Phase 1 shell. The real library (grid, search, filters) arrives in Phase 4. */
export function LibraryScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const bottomObstruction = useFeedback(st => st.bottomObstruction);
  const hasScores = false; // Phase 4: live count from the library repository.
  const importLater = () => showToast({ message: 'Import arrives in Phase 4', icon: 'info' });

  return (
    <View style={styles.fill}>
      <Screen centerContent title={t('nav.library')} header={<SearchBar value={query} onChangeText={setQuery} placeholder={t('library.searchPlaceholder')} />}>
        <EmptyState
          art={<EmptyLibraryArt />}
          title={t('library.emptyTitle')}
          body={t('library.emptyBody')}
          action={{ label: t('library.emptyAction'), icon: 'tray-arrow-down', onPress: importLater }}
        />
      </Screen>
      {/* The FAB appears once the library has scores; while empty, the empty-state CTA is the one import button. */}
      {hasScores && (
        <View style={[styles.fab, { bottom: space.lg + (bottomObstruction > 0 ? 0 : insets.bottom) }]}>
          <Button label={t('library.import')} icon="plus" size="lg" onPress={importLater} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: { position: 'absolute', right: space.lg, elevation: 6, shadowColor: '#000', borderRadius: 12 },
});
