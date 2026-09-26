import React, { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import { listScores, type Score } from '@/data/repos/scores';
import { Button, EmptyState, ScoreCard, SearchBar } from '@/ui/components';
import { showToast, useFeedback } from '@/ui/feedback/store';
import { EmptyLibraryArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';
import { breakpoints, space } from '@/ui/theme';

/** Library grid. Phase 4 adds import, FTS search, sort/filter, selection and the list view. */
export function LibraryScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomObstruction = useFeedback(st => st.bottomObstruction);
  const scores = useLiveQuery(['scores'], () => listScores('title'), []);
  const importLater = () => showToast({ message: 'Import arrives in Phase 4', icon: 'info' });

  const q = query.trim().toLowerCase();
  const visible = q ? scores.filter(s => `${s.title} ${s.composer ?? ''}`.toLowerCase().includes(q)) : scores;
  const railWidth = width >= breakpoints.medium ? 88 : 0;
  const gutter = width >= breakpoints.expanded ? space.xxl : width >= breakpoints.medium ? space.xl : space.lg;
  const columns = Math.max(2, Math.floor((width - railWidth - gutter * 2) / (width >= breakpoints.medium ? 176 : 150)));

  const open = useCallback((s: Score) => nav.navigate('Reader', { scoreId: s.id }), [nav]);
  const renderItem = useCallback(
    ({ item }: { item: Score }) => (
      <View style={styles.cell}>
        <ScoreCard title={item.title} composer={item.composer ?? undefined} coverUri={item.coverPath ?? undefined} favorite={item.isFavorite} onPress={() => open(item)} />
      </View>
    ),
    [open],
  );

  const header = <SearchBar value={query} onChangeText={setQuery} placeholder={t('library.searchPlaceholder')} />;

  if (scores.length === 0) {
    return (
      <Screen centerContent title={t('nav.library')} header={header}>
        <EmptyState
          art={<EmptyLibraryArt />}
          title={t('library.emptyTitle')}
          body={t('library.emptyBody')}
          action={{ label: t('library.emptyAction'), icon: 'tray-arrow-down', onPress: importLater }}
        />
      </Screen>
    );
  }

  return (
    <View style={styles.fill}>
      <Screen scroll={false} title={t('nav.library')} header={header}>
        <FlashList
          data={visible}
          key={columns}
          numColumns={columns}
          renderItem={renderItem}
          keyExtractor={s => s.id}
          contentContainerStyle={{ paddingBottom: 96 + (bottomObstruction > 0 ? 0 : insets.bottom) }}
          style={styles.list}
        />
      </Screen>
      <View style={[styles.fab, { bottom: space.lg + (bottomObstruction > 0 ? 0 : insets.bottom) }]}>
        <Button label={t('library.import')} icon="plus" size="lg" onPress={importLater} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { marginHorizontal: -space.xs },
  cell: { flex: 1, padding: space.xs },
  fab: { position: 'absolute', right: space.lg, elevation: 6, shadowColor: '#000', borderRadius: 12 },
});
