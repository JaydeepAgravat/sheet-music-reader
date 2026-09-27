import React, { memo, useRef } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Collection } from '@/data/repos/collections';
import type { Facet, Score, ScoreFilters, ScoreSort } from '@/data/repos/scores';
import { Button, Chip, IconButton, Surface, Text, type Anchor } from '@/ui/components';
import { Icon, type IconName } from '@/ui/icons';
import { minTouch, radius, space, useTheme } from '@/ui/theme';
import { HighlightText } from './HighlightText';

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/** List view row. On wide screens it grows Composer / Pages / Added columns. */
export const ScoreRow = memo(function ScoreRowImpl({
  score,
  query,
  wide,
  selected,
  selecting,
  onPress,
  onLongPress,
  onMore,
}: {
  score: Score;
  query: string;
  wide: boolean;
  selected: boolean;
  selecting: boolean;
  onPress: (s: Score) => void;
  onLongPress: (s: Score) => void;
  onMore: (s: Score) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  return (
    <Surface
      onPress={() => onPress(score)}
      onLongPress={() => onLongPress(score)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[
        score.title,
        score.composer,
        t('library.pages', { count: score.pageCount }),
        score.isFavorite && t('library.badges.favorite'),
        score.annotated && t('library.badges.annotated'),
        score.inSetlist && t('library.badges.inSetlist'),
      ]
        .filter(Boolean)
        .join(', ')}
      style={[styles.row, selected && { backgroundColor: colors.accentContainer }]}
    >
      <View style={[styles.thumb, { borderColor: selected ? colors.accent : colors.borderSubtle }]}>
        {score.coverPath ? <Image source={{ uri: score.coverPath }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.coverDim }]} />
        {selected && (
          <View style={[styles.check, { backgroundColor: colors.accent }]}>
            <Icon name="check" size={14} color="onAccent" />
          </View>
        )}
      </View>
      <View style={styles.rowMain}>
        <HighlightText text={score.title} query={query} variant="titleS" numberOfLines={1} />
        {!wide && score.composer ? <HighlightText text={score.composer} query={query} variant="caption" color="textSecondary" numberOfLines={1} /> : null}
      </View>
      {wide && (
        <>
          <View style={styles.colComposer}>
            {score.composer ? <HighlightText text={score.composer} query={query} variant="body" color="textSecondary" numberOfLines={1} /> : null}
          </View>
          <Text variant="numeric" color="textSecondary" style={styles.colPages}>
            {score.pageCount}
          </Text>
          <Text variant="numeric" color="textSecondary" style={styles.colAdded}>
            {new Date(score.createdAt).toLocaleDateString(i18n.language, SHORT_DATE)}
          </Text>
        </>
      )}
      {score.annotated && <Icon name="pencil-simple" weight="fill" size={16} color="textTertiary" />}
      {score.inSetlist && <Icon name="playlist" weight="fill" size={16} color="textTertiary" />}
      {score.isFavorite && <Icon name="star" weight="fill" size={16} color="accent" />}
      {!selecting && <IconButton icon="dots-three-vertical" label={t('library.details')} size="sm" onPress={() => onMore(score)} />}
    </Surface>
  );
});

/** Sortable column header for the wide list view. */
export function ListHeader({ sort, onSort }: { sort: ScoreSort; onSort: (s: ScoreSort) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.head, { borderColor: colors.borderSubtle }]}>
      <View style={styles.thumbSpace} />
      <HeadCell sortKey="title" label={t('library.sort.title')} style={styles.rowMain} sort={sort} onSort={onSort} />
      <HeadCell sortKey="composer" label={t('library.sort.composer')} style={styles.colComposer} sort={sort} onSort={onSort} />
      <Text variant="labelSmall" color="textSecondary" style={styles.colPages}>
        {t('library.columnPages').toUpperCase()}
      </Text>
      <HeadCell sortKey="added" label={t('library.sort.added')} style={styles.colAdded} sort={sort} onSort={onSort} />
      <View style={styles.moreSpace} />
    </View>
  );
}

function HeadCell({ sortKey, label, style, sort, onSort }: { sortKey: ScoreSort; label: string; style: object; sort: ScoreSort; onSort: (s: ScoreSort) => void }) {
  return (
    <Surface onPress={() => onSort(sortKey)} accessibilityRole="button" accessibilityState={{ selected: sort === sortKey }} style={[styles.headCell, style]}>
      <Text variant="labelSmall" color={sort === sortKey ? 'accent' : 'textSecondary'}>
        {label.toUpperCase()}
      </Text>
      {sort === sortKey && <Icon name="caret-down" size={12} color="accent" />}
    </Surface>
  );
}

export type FacetLists = { composers: Facet[]; genres: Facet[]; keys: Facet[]; tags: Facet[]; collections: Collection[] };
export type FacetKind = 'composer' | 'genre' | 'musicKey' | 'tagId' | 'collectionId';

/** Filter chips. Only facets that exist in the library are offered. */
export function FilterBar({
  filters,
  facets,
  onToggleFavorite,
  onOpen,
  onClear,
}: {
  filters: ScoreFilters;
  facets: FacetLists;
  onToggleFavorite: () => void;
  onOpen: (kind: FacetKind, anchor: Anchor) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const labelFor = (kind: FacetKind): string | undefined => {
    if (kind === 'tagId') return facets.tags.find(f => f.value === filters.tagId)?.label;
    if (kind === 'collectionId') return facets.collections.find(c => c.id === filters.collectionId)?.name;
    return filters[kind];
  };
  const chips: { kind: FacetKind; label: string; available: boolean }[] = [
    { kind: 'composer', label: t('library.filters.composer'), available: facets.composers.length > 0 },
    { kind: 'collectionId', label: t('library.filters.collection'), available: facets.collections.length > 0 },
    { kind: 'tagId', label: t('library.filters.tag'), available: facets.tags.length > 0 },
    { kind: 'genre', label: t('library.filters.genre'), available: facets.genres.length > 0 },
    { kind: 'musicKey', label: t('library.filters.key'), available: facets.keys.length > 0 },
  ];
  const active = !!(filters.favorite || filters.composer || filters.genre || filters.musicKey || filters.tagId || filters.collectionId);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
      <Chip label={t('library.filters.favorites')} icon="star" selected={!!filters.favorite} onPress={onToggleFavorite} />
      {chips
        .filter(c => c.available || filters[c.kind])
        .map(c => (
          <AnchoredChip key={c.kind} label={labelFor(c.kind) ?? c.label} selected={!!filters[c.kind]} onPress={a => onOpen(c.kind, a)} />
        ))}
      {active && <Button label={t('library.filters.clear')} variant="ghost" onPress={onClear} />}
    </ScrollView>
  );
}

function AnchoredChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: (a: Anchor) => void }) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  return (
    <View ref={ref} collapsable={false}>
      <Chip
        label={label}
        selected={selected}
        dropdown
        onPress={() => ref.current?.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }))}
      />
    </View>
  );
}

/** Replaces the title row while scores are selected. */
export function SelectionBar({
  count,
  allSelected,
  onClose,
  onSelectAll,
  onFavorite,
  onCollection,
  onSetlist,
  onEdit,
  onDelete,
}: {
  count: number;
  allSelected: boolean;
  onClose: () => void;
  onSelectAll: () => void;
  onFavorite: () => void;
  onCollection: (a: Anchor) => void;
  onSetlist: (a: Anchor) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const colRef = useRef<React.ComponentRef<typeof View>>(null);
  const setRef = useRef<React.ComponentRef<typeof View>>(null);
  return (
    <View style={[styles.selection, { backgroundColor: colors.accentContainer }]} accessibilityLiveRegion="polite">
      <IconButton icon="x" label={t('library.select.done')} onPress={onClose} color="onAccentContainer" />
      <Text variant="label" color="onAccentContainer" style={styles.selCount}>
        {t('library.select.count', { count })}
      </Text>
      <IconButton icon="check-circle" selected={allSelected} label={t('library.select.all')} onPress={onSelectAll} color="onAccentContainer" />
      <IconButton icon="star" label={t('library.select.favorite')} onPress={onFavorite} color="onAccentContainer" />
      <View ref={colRef} collapsable={false}>
        <IconButton
          icon="folder-simple"
          label={t('library.select.collection')}
          onPress={() => colRef.current?.measureInWindow((x, y, width, height) => onCollection({ x, y, width, height }))}
          color="onAccentContainer"
        />
      </View>
      <View ref={setRef} collapsable={false}>
        <IconButton
          icon="playlist"
          label={t('library.select.setlist')}
          onPress={() => setRef.current?.measureInWindow((x, y, width, height) => onSetlist({ x, y, width, height }))}
          color="onAccentContainer"
        />
      </View>
      <IconButton icon="pencil-simple" label={t('library.select.edit')} onPress={onEdit} color="onAccentContainer" />
      <IconButton icon="trash" label={t('library.select.delete')} onPress={onDelete} color="onAccentContainer" />
    </View>
  );
}

const ICON_COMPOSER: IconName = 'user';
const ICON_COLLECTION: IconName = 'folder-simple';
const ICON_TAG: IconName = 'tag';
const ICON_SETLIST: IconName = 'playlist';

/** Search suggestions (composers, tags, collections) above the matching scores. */
export function SearchGroups({
  query,
  composers,
  tags,
  collections,
  onComposer,
  onTag,
  onCollection,
  setlists = [],
  onSetlist,
}: {
  query: string;
  composers: Facet[];
  tags: Facet[];
  collections: Collection[];
  onComposer: (v: string) => void;
  onTag: (id: string) => void;
  onCollection: (id: string) => void;
  setlists?: { id: string; name: string; count: number }[];
  onSetlist?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const group = (title: string, items: { key: string; label: string; count: number; onPress: () => void; icon: IconName }[]) =>
    items.length > 0 && (
      <View style={styles.group}>
        <Text variant="overline" color="textSecondary">
          {title.toUpperCase()}
        </Text>
        <View style={styles.groupChips}>
          {items.map(i => (
            <Surface key={i.key} onPress={i.onPress} accessibilityRole="button" style={[styles.suggestion, { backgroundColor: colors.surfaceSunken }]}>
              <Icon name={i.icon} size={16} color="textSecondary" />
              <HighlightText text={i.label} query={query} variant="label" numberOfLines={1} />
              <Text variant="caption" color="textTertiary">
                {i.count}
              </Text>
            </Surface>
          ))}
        </View>
      </View>
    );
  return (
    <View>
      {group(
        t('search.composers'),
        composers.map(c => ({ key: c.value, label: c.label, count: c.count, icon: ICON_COMPOSER, onPress: () => onComposer(c.value) })),
      )}
      {group(
        t('search.setlists'),
        setlists.map(s => ({ key: s.id, label: s.name, count: s.count, icon: ICON_SETLIST, onPress: () => onSetlist?.(s.id) })),
      )}
      {group(
        t('search.collections'),
        collections.map(c => ({ key: c.id, label: c.name, count: c.count, icon: ICON_COLLECTION, onPress: () => onCollection(c.id) })),
      )}
      {group(t('search.tags'), tags.map(tg => ({ key: tg.value, label: tg.label, count: tg.count, icon: ICON_TAG, onPress: () => onTag(tg.value) })))}
    </View>
  );
}

export function RecentSearches({ items, onPick, onClear }: { items: string[]; onPick: (q: string) => void; onClear: () => void }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <View style={styles.group}>
      <View style={styles.recentHead}>
        <Text variant="overline" color="textSecondary">
          {t('search.recent').toUpperCase()}
        </Text>
        <Button label={t('search.clearRecent')} variant="ghost" onPress={onClear} />
      </View>
      {items.map(q => (
        <Surface key={q} onPress={() => onPick(q)} accessibilityRole="button" style={styles.recentRow}>
          <Icon name="clock-counter-clockwise" size={18} color="textTertiary" />
          <Text variant="body" numberOfLines={1} style={styles.flex}>
            {q}
          </Text>
        </Surface>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72, paddingHorizontal: space.sm, paddingVertical: space.sm, borderRadius: radius.md },
  thumb: { width: 44, height: 55, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth * 2 },
  check: { position: 'absolute', right: 3, bottom: 3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 3, gap: 2 },
  colComposer: { flex: 2 },
  colPages: { width: 56, textAlign: 'right' },
  colAdded: { width: 112, textAlign: 'right' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: space.xs },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 },
  thumbSpace: { width: 44 },
  moreSpace: { width: 40 },
  chips: { gap: space.sm, alignItems: 'center', paddingVertical: space.xs },
  selection: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: space.xs, minHeight: minTouch + 4 },
  selCount: { flex: 1, marginLeft: space.xs },
  group: { marginBottom: space.lg, gap: space.sm },
  groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 40, borderRadius: radius.pill, maxWidth: 320 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTouch, paddingHorizontal: space.xs, borderRadius: radius.sm },
});
