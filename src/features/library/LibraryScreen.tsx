import React, { useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import { usePref } from '@/data/prefs';
import { addToCollection, createCollection, listCollections } from '@/data/repos/collections';
import { searchLibrary } from '@/data/repos/search';
import { addToSetlist, createSetlist, listSetlists, searchSetlists } from '@/data/repos/setlists';
import { countScores, listFacets, listScores, restoreScores, setFavorite, trashScores, type Score, type ScoreFilters, type ScoreSort } from '@/data/repos/scores';
import { haptic } from '@/platform/haptics';
import { Button, Chip, Dialog, EmptyState, IconButton, Menu, SearchBar, Text, TextField, type Anchor, type MenuItem } from '@/ui/components';
import { showSnackbar, useFeedback } from '@/ui/feedback/store';
import { EmptyLibraryArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';
import { breakpoints, motion, space } from '@/ui/theme';
import { ImportChooser, ImportStatus } from '@/features/import/ImportUI';
import { BackupBanner } from '@/features/backup/BackupBanner';
import { useLibraryFocus } from './libraryFocus';
import { FilterBar, ListHeader, RecentSearches, SearchGroups, SelectionBar, type FacetKind, type FacetLists } from './LibraryParts';
import { ScoreDetailSheet } from './ScoreDetailSheet';
import { ScoreGrid } from './ScoreGrid';
import { SetlistNameDialog } from '@/features/setlists/SetlistParts';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MenuState = { kind: 'sort' | 'more' | 'collection' | 'setlist' | FacetKind; anchor: Anchor } | null;

const SORTS: ScoreSort[] = ['title', 'composer', 'recent', 'added'];

export function LibraryScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomObstruction = useFeedback(st => st.bottomObstruction);
  const snackbarUp = useFeedback(st => st.snackbar !== null);

  const [view, setView] = usePref('libraryView');
  const [sort, setSort] = usePref('librarySort');
  const [recents, setRecents] = usePref('recentSearches');
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filters, setFilters] = useState<ScoreFilters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [chooser, setChooser] = useState(false);
  const [detailIds, setDetailIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [newCollection, setNewCollection] = useState<string | null>(null);

  const q = query.trim();
  const search = useLiveQuery(['scores', 'tags', 'collections'], () => (q ? searchLibrary(q) : null), [q]);
  const setlistHits = useLiveQuery(['setlists'], () => (q ? searchSetlists(q) : []), [q]);
  const [newSetlist, setNewSetlist] = useState(false);
  const focus = useLibraryFocus(st => st.focus);
  const clearFocus = useLibraryFocus(st => st.clear);
  const scores = useLiveQuery(
    ['scores', 'tags', 'collections'],
    () => {
      const focusIds = focus ? new Set(focus.ids) : null;
      const ids = search ? search.scoreIds.filter(id => !focusIds || focusIds.has(id)) : focus?.ids;
      return listScores(sort, ids ? { ...filters, ids } : filters);
    },
    [sort, filters, search, focus],
  );
  const total = useLiveQuery(['scores'], () => countScores().total, []);
  const facets: FacetLists = useLiveQuery(['scores', 'tags', 'collections'], () => ({ ...listFacets(), collections: listCollections() }), []);
  // Search results keep their relevance order unless the user picked a sort explicitly.
  const ordered = useMemo(() => {
    if (!search) return scores;
    const rank = new Map(search.scoreIds.map((id, i) => [id, i]));
    return [...scores].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [scores, search]);

  const selecting = selected.size > 0;
  const wide = width >= breakpoints.expanded;

  // Back leaves selection / search before leaving the screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (selected.size) {
          setSelected(new Set());
          return true;
        }
        if (query) {
          setQuery('');
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [selected.size, query]),
  );

  const rememberSearch = useCallback(() => {
    if (q.length < 2) return;
    setRecents([q, ...recents.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, 8));
  }, [q, recents, setRecents]);

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
      rememberSearch();
      Keyboard.dismiss();
      nav.navigate('Reader', { scoreId: s.id });
    },
    [nav, rememberSearch, toggle],
  );
  const longPress = useCallback(
    (s: Score) => {
      haptic('longPress');
      toggle(s.id);
    },
    [toggle],
  );
  const showDetails = useCallback((s: Score) => setDetailIds([s.id]), []);

  const trash = useCallback(
    (ids: string[]) => {
      trashScores(ids);
      setSelected(new Set());
      setDetailIds([]);
      showSnackbar({
        message: t('library.deleted', { count: ids.length }),
        action: { label: t('common.undo'), onPress: () => restoreScores(ids) },
      });
    },
    [t],
  );
  const requestDelete = (ids: string[]) => (ids.length > 1 ? setConfirmDelete(ids) : trash(ids));

  // --- Menus ----------------------------------------------------------------------------------------
  const setFacet = (kind: FacetKind, value: string | undefined) => setFilters(f => ({ ...f, [kind]: f[kind] === value ? undefined : value }));
  const facetItems = (kind: FacetKind): MenuItem[] => {
    const list =
      kind === 'composer'
        ? facets.composers
        : kind === 'genre'
          ? facets.genres
          : kind === 'musicKey'
            ? facets.keys
            : kind === 'tagId'
              ? facets.tags
              : facets.collections.map(c => ({ value: c.id, label: c.name, count: c.count }));
    return list.map(f => ({ key: f.value, label: f.label, hint: t('library.count', { count: f.count }), selected: filters[kind] === f.value, onPress: () => setFacet(kind, f.value) }));
  };

  const menuItems: MenuItem[] = !menu
    ? []
    : menu.kind === 'sort'
      ? SORTS.map(s => ({ key: s, label: t(`library.sort.${s}`), selected: sort === s, onPress: () => setSort(s) }))
      : menu.kind === 'more'
        ? [
            { key: 'select', label: t('library.select.start'), icon: 'check-circle', onPress: () => ordered[0] && setSelected(new Set([ordered[0].id])) },
            { key: 'trash', label: t('trash.title'), icon: 'trash', onPress: () => nav.navigate('Trash') },
          ]
        : menu.kind === 'setlist'
          ? [
              ...listSetlists().map(sl => ({
                key: sl.id,
                label: sl.name,
                hint: t('setlists.songs', { count: sl.itemCount }),
                icon: 'playlist' as const,
                onPress: () => addSelectedToSetlist(sl.id, sl.name),
              })),
              { key: 'new', label: t('setlists.newSetlistEllipsis'), icon: 'plus' as const, onPress: () => setNewSetlist(true), dividerBefore: true },
            ]
        : menu.kind === 'collection'
          ? [
              ...facets.collections.map(c => ({
                key: c.id,
                label: c.name,
                icon: 'folder-simple' as const,
                onPress: () => addSelectedTo(c.id, c.name),
              })),
              { key: 'new', label: t('library.newCollection'), icon: 'plus' as const, onPress: () => setNewCollection(''), dividerBefore: facets.collections.length > 0 },
            ]
          : facetItems(menu.kind);

  function addSelectedToSetlist(setlistId: string, name: string) {
    const ids = ordered.filter(s => selected.has(s.id)).map(s => s.id);
    addToSetlist(setlistId, ids);
    haptic('confirm');
    setSelected(new Set());
    showSnackbar({
      message: t('setlists.added', { count: ids.length, name }),
      action: { label: t('setlists.details'), onPress: () => nav.navigate('Setlist', { setlistId }) },
    });
  }

  function addSelectedTo(collectionId: string, name: string) {
    const ids = [...selected];
    addToCollection(collectionId, ids);
    haptic('confirm');
    setSelected(new Set());
    showSnackbar({ message: t('library.addedToCollection', { count: ids.length, name }) });
  }

  const anchored = (kind: NonNullable<MenuState>['kind']) => (anchor: Anchor) => setMenu({ kind, anchor });

  // --- Render ---------------------------------------------------------------------------------------
  const header = (
    <View style={styles.header}>
      {selecting ? (
        <SelectionBar
          count={selected.size}
          allSelected={selected.size === ordered.length}
          onClose={() => setSelected(new Set())}
          onSelectAll={() => setSelected(selected.size === ordered.length ? new Set() : new Set(ordered.map(s => s.id)))}
          onFavorite={() => {
            const ids = [...selected];
            const allFav = ordered.filter(s => selected.has(s.id)).every(s => s.isFavorite);
            setFavorite(ids, !allFav);
            haptic('confirm');
          }}
          onCollection={anchored('collection')}
          onSetlist={anchored('setlist')}
          onEdit={() => setDetailIds([...selected])}
          onDelete={() => requestDelete([...selected])}
        />
      ) : (
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.searchPlaceholder')}
          onSubmit={rememberSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
      )}
      {total > 0 && !selecting && (
        <FilterBar
          filters={filters}
          facets={facets}
          onToggleFavorite={() => setFilters(f => ({ ...f, favorite: !f.favorite || undefined }))}
          onOpen={(kind, anchor) => setMenu({ kind, anchor })}
          onClear={() => setFilters({})}
        />
      )}
      {focus && (
        <View style={styles.focusRow}>
          <Chip label={focus.label} selected trailingIcon="x" onPress={clearFocus} accessibilityHint={t('library.filters.clear')} />
        </View>
      )}
      <ImportStatus />
      {!selecting && !q && <BackupBanner scoreCount={total} />}
    </View>
  );

  const actions = total > 0 && (
    <>
      <IconButton
        icon={view === 'grid' ? 'rows' : 'squares-four'}
        label={view === 'grid' ? t('library.viewList') : t('library.viewGrid')}
        onPress={() => setView(view === 'grid' ? 'list' : 'grid')}
      />
      <AnchorButton icon="arrows-down-up" label={t('library.sortBy')} onPress={anchored('sort')} />
      <AnchorButton icon="dots-three-vertical" label={t('common.moreOptions')} onPress={anchored('more')} />
    </>
  );

  const fab = !selecting && total > 0 && (
    // Rises above a snackbar instead of hiding under it.
    <Animated.View layout={LinearTransition.duration(motion.duration.base)} style={[styles.fab, { bottom: space.lg + (bottomObstruction > 0 ? 0 : insets.bottom) + (snackbarUp ? 72 : 0) }]}>
      <Button label={t('library.import')} icon="plus" size="lg" onPress={() => setChooser(true)} />
    </Animated.View>
  );

  const overlays = (
    <>
      <ImportChooser visible={chooser} onClose={() => setChooser(false)} />
      <Menu visible={menu !== null} anchor={menu?.anchor ?? null} items={menuItems} onClose={() => setMenu(null)} title={menuTitle(menu?.kind, t)} />
      <SetlistNameDialog
        visible={newSetlist}
        title={t('setlists.newSetlist')}
        confirmLabel={t('common.save')}
        initialName=""
        initialDate={null}
        withDate
        onSubmit={(name, date) => {
          setNewSetlist(false);
          addSelectedToSetlist(createSetlist(name, date), name);
        }}
        onCancel={() => setNewSetlist(false)}
      />
      <ScoreDetailSheet
        ids={detailIds}
        onClose={() => setDetailIds([])}
        onOpen={id => {
          setDetailIds([]);
          nav.navigate('Reader', { scoreId: id });
        }}
        onTrash={id => trash([id])}
      />
      <Dialog
        visible={confirmDelete !== null}
        title={t('library.confirmDeleteTitle', { count: confirmDelete?.length ?? 0 })}
        body={t('library.confirmDeleteBody')}
        confirm={{ label: t('library.moveToTrash'), variant: 'danger', onPress: () => confirmDelete && (trash(confirmDelete), setConfirmDelete(null)) }}
        cancel={{ label: t('common.cancel'), onPress: () => setConfirmDelete(null) }}
      />
      <Dialog
        visible={newCollection !== null}
        title={t('library.newCollection')}
        confirm={{
          label: t('library.create'),
          onPress: () => {
            const name = newCollection?.trim();
            setNewCollection(null);
            if (name) addSelectedTo(createCollection(name), name);
          },
        }}
        cancel={{ label: t('common.cancel'), onPress: () => setNewCollection(null) }}
      >
        <TextField label={t('library.collectionName')} value={newCollection ?? ''} onChangeText={setNewCollection} autoFocus />
      </Dialog>
    </>
  );

  if (total === 0) {
    return (
      <View style={styles.fill}>
        <Screen centerContent title={t('nav.library')} header={<ImportStatus />}>
          <EmptyState
            art={<EmptyLibraryArt />}
            title={t('library.emptyTitle')}
            body={t('library.emptyBody')}
            action={{ label: t('library.emptyAction'), icon: 'tray-arrow-down', onPress: () => setChooser(true) }}
          />
        </Screen>
        {overlays}
      </View>
    );
  }

  const showRecents = searchFocused && !q && recents.length > 0;
  const listHeader = (
    <View>
      {showRecents && <RecentSearches items={recents} onPick={setQuery} onClear={() => setRecents([])} />}
      {search && (
        <SearchGroups
          query={q}
          composers={search.composers}
          tags={search.tags}
          collections={search.collections}
          setlists={setlistHits.map(sl => ({ id: sl.id, name: sl.name, count: sl.itemCount }))}
          onSetlist={id => {
            rememberSearch();
            nav.navigate('Setlist', { setlistId: id });
          }}
          onComposer={v => {
            setFilters(f => ({ ...f, composer: v }));
            rememberSearch();
            setQuery('');
          }}
          onTag={id => {
            setFilters(f => ({ ...f, tagId: id }));
            rememberSearch();
            setQuery('');
          }}
          onCollection={id => {
            setFilters(f => ({ ...f, collectionId: id }));
            rememberSearch();
            setQuery('');
          }}
        />
      )}
      {search && ordered.length > 0 && (
        <Text variant="overline" color="textSecondary" style={styles.resultsLabel}>
          {t('search.scores', { count: ordered.length }).toUpperCase()}
        </Text>
      )}
      {view === 'list' && wide && ordered.length > 0 && <ListHeader sort={sort} onSort={setSort} />}
    </View>
  );

  const empty = (
    <View style={styles.noResults}>
      <Text variant="titleM" align="center">
        {search ? t('search.noResultsTitle', { query: q }) : t('library.noMatchTitle')}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {search ? t('search.noResultsBody') : t('library.noMatchBody')}
      </Text>
      {!search && <Button label={t('library.filters.clear')} variant="secondary" onPress={() => setFilters({})} />}
    </View>
  );

  return (
    <View style={styles.fill}>
      <Screen scroll={false} title={selecting ? t('nav.library') : t('nav.library')} actions={selecting ? undefined : actions} header={header}>
        <ScoreGrid
          scores={ordered}
          view={view}
          selected={selected}
          query={q}
          onPress={open}
          onLongPress={longPress}
          onMore={showDetails}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={empty}
          contentContainerStyle={{ paddingBottom: 104 + (bottomObstruction > 0 ? 0 : insets.bottom) }}
        />
      </Screen>
      {fab}
      {overlays}
    </View>
  );
}

function menuTitle(kind: NonNullable<MenuState>['kind'] | undefined, t: TFunction): string | undefined {
  switch (kind) {
    case 'sort':
      return t('library.sortBy');
    case 'collection':
      return t('library.select.collection');
    case 'setlist':
      return t('library.select.setlist');
    case 'composer':
      return t('library.filters.composer');
    case 'genre':
      return t('library.filters.genre');
    case 'musicKey':
      return t('library.filters.key');
    case 'tagId':
      return t('library.filters.tag');
    case 'collectionId':
      return t('library.filters.collection');
    default:
      return undefined;
  }
}

function AnchorButton({ icon, label, onPress }: { icon: 'arrows-down-up' | 'dots-three-vertical'; label: string; onPress: (a: Anchor) => void }) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon={icon} label={label} onPress={() => ref.current?.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  focusRow: { flexDirection: 'row', marginTop: space.sm },
  fill: { flex: 1 },
  header: { gap: space.sm },
  resultsLabel: { marginBottom: space.sm, marginLeft: space.xs },
  noResults: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  fab: { position: 'absolute', right: space.lg, elevation: 6, shadowColor: '#000', borderRadius: 12 },
});
