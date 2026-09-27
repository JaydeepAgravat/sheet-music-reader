import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import { addToCollection, getCollection, listCollections, removeFromCollection, renameCollection } from '@/data/repos/collections';
import { listScores, restoreScores, trashScores, type Score, type ScoreSort } from '@/data/repos/scores';
import { usePref } from '@/data/prefs';
import { haptic } from '@/platform/haptics';
import { Button, EmptyState, IconButton, Menu, Text, type Anchor, type MenuItem } from '@/ui/components';
import { showSnackbar, useFeedback } from '@/ui/feedback/store';
import { Screen } from '@/ui/layout/Screen';
import { minTouch, motion, radius, space, useTheme } from '@/ui/theme';
import { ListHeader } from '@/features/library/LibraryParts';
import { ScoreDetailSheet } from '@/features/library/ScoreDetailSheet';
import { ScoreGrid, useScoreGridLayout } from '@/features/library/ScoreGrid';
import { AddScoresSheet } from './AddScoresSheet';
import { AnchorIconButton, CollectionNameDialog, deleteWithUndo, StackedCovers } from './CollectionParts';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MenuState = { kind: 'sort' | 'more'; anchor: Anchor } | null;

const SORTS: ScoreSort[] = ['title', 'composer', 'recent', 'added'];

/** One collection: the library's grid/list of its scores, add/remove, rename, delete. */
export function CollectionScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { collectionId } = useRoute<RouteProp<RootStackParamList, 'Collection'>>().params;
  const insets = useSafeAreaInsets();
  const { colors, reduceMotion } = useTheme();
  const bottomObstruction = useFeedback(st => st.bottomObstruction);
  const snackbarUp = useFeedback(st => st.snackbar !== null);
  const { wide } = useScoreGridLayout();

  const [view, setView] = usePref('libraryView');
  const [sort, setSort] = usePref('librarySort');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [detailIds, setDetailIds] = useState<string[]>([]);

  const collection = useLiveQuery(['collections', 'scores'], () => getCollection(collectionId), [collectionId]);
  const scores = useLiveQuery(['scores', 'collections', 'tags'], () => listScores(sort, { collectionId }), [sort, collectionId]);
  const otherNames = useLiveQuery(['collections'], () => listCollections().filter(c => c.id !== collectionId).map(c => c.name), [collectionId]);

  // Deleted elsewhere (or from this screen's menu): leave.
  const gone = collection === null;
  const leaving = useRef(false);
  useEffect(() => {
    if (gone && !leaving.current && nav.isFocused() && nav.canGoBack()) {
      leaving.current = true;
      nav.goBack();
    }
  }, [gone, nav]);

  // Scores removed from the collection drop out of the selection.
  useEffect(() => {
    setSelected(prev => {
      if (!prev.size) return prev;
      const live = new Set(scores.map(s => s.id));
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [scores]);

  const selecting = selected.size > 0;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!selected.size) return false;
        setSelected(new Set());
        return true;
      });
      return () => sub.remove();
    }, [selected.size]),
  );

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const open = useCallback(
    (s: Score) => {
      if (selectedRef.current.size) return toggle(s.id);
      nav.navigate('Reader', { scoreId: s.id });
    },
    [nav, toggle],
  );
  const longPress = useCallback(
    (s: Score) => {
      haptic('longPress');
      toggle(s.id);
    },
    [toggle],
  );
  const showDetails = useCallback((s: Score) => setDetailIds([s.id]), []);

  const name = collection?.name ?? '';

  const removeSelected = () => {
    const ids = [...selected];
    removeFromCollection(collectionId, ids);
    haptic('confirm');
    setSelected(new Set());
    showSnackbar({
      message: t('collections.removed', { count: ids.length, name }),
      action: { label: t('common.undo'), onPress: () => addToCollection(collectionId, ids) },
    });
  };

  const trash = (ids: string[]) => {
    trashScores(ids);
    setDetailIds([]);
    showSnackbar({ message: t('library.deleted', { count: ids.length }), action: { label: t('common.undo'), onPress: () => restoreScores(ids) } });
  };

  const deleteThis = () => {
    const c = { id: collectionId, name };
    leaving.current = true;
    if (nav.canGoBack()) nav.goBack();
    deleteWithUndo(c, t);
  };

  const menuItems: MenuItem[] = !menu
    ? []
    : menu.kind === 'sort'
      ? SORTS.map(s => ({ key: s, label: t(`library.sort.${s}`), selected: sort === s, onPress: () => setSort(s) }))
      : [
          { key: 'add', label: t('collections.addScores'), icon: 'plus', onPress: () => setAdding(true) },
          ...(scores.length > 0
            ? [{ key: 'select', label: t('library.select.start'), icon: 'check-circle' as const, onPress: () => scores[0] && setSelected(new Set([scores[0].id])) }]
            : []),
          { key: 'rename', label: t('common.rename'), icon: 'pencil-simple', dividerBefore: true, onPress: () => setRenaming(true) },
          { key: 'delete', label: t('collections.delete'), icon: 'trash', destructive: true, onPress: deleteThis },
        ];

  const anchored = (kind: NonNullable<MenuState>['kind']) => (anchor: Anchor) => setMenu({ kind, anchor });

  const actions = (
    <>
      {scores.length > 0 && (
        <>
          <IconButton
            icon={view === 'grid' ? 'rows' : 'squares-four'}
            label={view === 'grid' ? t('library.viewList') : t('library.viewGrid')}
            onPress={() => setView(view === 'grid' ? 'list' : 'grid')}
          />
          <AnchorIconButton icon="arrows-down-up" label={t('library.sortBy')} onPress={anchored('sort')} />
        </>
      )}
      <AnchorIconButton icon="dots-three-vertical" label={t('common.moreOptions')} onPress={anchored('more')} />
    </>
  );

  const header = selecting ? (
    <View style={[styles.selection, { backgroundColor: colors.accentContainer }]} accessibilityLiveRegion="polite">
      <IconButton icon="x" label={t('library.select.done')} onPress={() => setSelected(new Set())} color="onAccentContainer" />
      <Text variant="label" color="onAccentContainer" style={styles.selCount}>
        {t('library.select.count', { count: selected.size })}
      </Text>
      <IconButton
        icon="check-circle"
        selected={selected.size === scores.length}
        label={t('library.select.all')}
        onPress={() => setSelected(selected.size === scores.length ? new Set() : new Set(scores.map(s => s.id)))}
        color="onAccentContainer"
      />
      <Button label={t('collections.remove')} icon="minus" variant="secondary" onPress={removeSelected} accessibilityHint={t('collections.removeHint')} />
    </View>
  ) : scores.length > 0 ? (
    <Text variant="caption" color="textSecondary">
      {t('collections.scores', { count: scores.length })}
    </Text>
  ) : undefined;

  const fab = !selecting && scores.length > 0 && (
    <Animated.View
      layout={reduceMotion ? undefined : LinearTransition.duration(motion.duration.base)}
      style={[styles.fab, { bottom: space.lg + (bottomObstruction > 0 ? 0 : insets.bottom) + (snackbarUp ? 72 : 0) }]}
    >
      <Button label={t('collections.addScores')} icon="plus" size="lg" onPress={() => setAdding(true)} />
    </Animated.View>
  );

  const listHeader = useMemo(() => (view === 'list' && wide ? <ListHeader sort={sort} onSort={setSort} /> : null), [view, wide, sort, setSort]);

  return (
    <View style={styles.fill}>
      <Screen
        scroll={scores.length === 0}
        centerContent={scores.length === 0}
        title={name}
        onBack={() => nav.goBack()}
        actions={selecting ? undefined : actions}
        header={header}
      >
        {scores.length === 0 ? (
          <EmptyState
            art={
              <View style={[styles.emptyArt, { backgroundColor: colors.surfaceSunken }]}>
                <StackedCovers covers={[]} count={0} />
              </View>
            }
            title={t('collections.emptyCollectionTitle')}
            body={t('collections.emptyCollectionBody')}
            action={{ label: t('collections.addScores'), icon: 'plus', onPress: () => setAdding(true) }}
          />
        ) : (
          <ScoreGrid
            scores={scores}
            view={view}
            selected={selected}
            onPress={open}
            onLongPress={longPress}
            onMore={showDetails}
            ListHeaderComponent={listHeader}
            contentContainerStyle={{ paddingBottom: 104 + (bottomObstruction > 0 ? 0 : insets.bottom) }}
          />
        )}
      </Screen>
      {fab}
      <Menu visible={menu !== null} anchor={menu?.anchor ?? null} items={menuItems} onClose={() => setMenu(null)} title={menu?.kind === 'sort' ? t('library.sortBy') : undefined} />
      <CollectionNameDialog
        visible={renaming}
        title={t('collections.renameTitle')}
        confirmLabel={t('common.save')}
        initial={name}
        taken={otherNames}
        onCancel={() => setRenaming(false)}
        onSubmit={n => {
          renameCollection(collectionId, n);
          setRenaming(false);
        }}
      />
      <AddScoresSheet visible={adding} collectionId={collectionId} collectionName={name} onClose={() => setAdding(false)} />
      <ScoreDetailSheet
        ids={detailIds}
        onClose={() => setDetailIds([])}
        onOpen={id => {
          setDetailIds([]);
          nav.navigate('Reader', { scoreId: id });
        }}
        onTrash={id => trash([id])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  selection: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill, paddingLeft: space.xs, paddingRight: space.sm, minHeight: minTouch + 4 },
  selCount: { flex: 1, marginLeft: space.xs },
  emptyArt: { width: 180, height: 150, borderRadius: radius.lg, overflow: 'hidden' },
  fab: { position: 'absolute', right: space.lg, elevation: 6, shadowColor: '#000', borderRadius: 12 },
});
