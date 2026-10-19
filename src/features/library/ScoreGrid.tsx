import React from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Score } from '@/data/repos/scores';
import { ScoreCard } from '@/ui/components';
import { breakpoints, space } from '@/ui/theme';
import { ScoreRow } from './LibraryParts';

/** Library layout metrics: wide list columns and the cover-grid column count for the current width. */
export function useScoreGridLayout(): { wide: boolean; columns: number } {
  const { width } = useWindowDimensions();
  const railWidth = width >= breakpoints.medium ? 88 : 0;
  const gutter = width >= breakpoints.expanded ? space.xxl : width >= breakpoints.medium ? space.xl : space.lg;
  return {
    wide: width >= breakpoints.expanded,
    columns: Math.max(2, Math.floor((width - railWidth - gutter * 2) / (width >= breakpoints.medium ? 176 : 150))),
  };
}

/**
 * FlashList v2 anchors the visible content by default. When scores are inserted above the viewport
 * (an import sorted by title), the grid then left some cells at their old positions: cards drew on
 * top of each other and a slot stayed empty until the app restarted. The library is top-anchored.
 */
const NO_ANCHORING = { disabled: true } as const;

type Props = {
  scores: readonly Score[];
  view: 'grid' | 'list';
  selected: ReadonlySet<string>;
  /** Highlighted in list rows (search). */
  query?: string;
  onPress: (s: Score) => void;
  onLongPress: (s: Score) => void;
  /** List rows' overflow button (details sheet). */
  onMore: (s: Score) => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** The library's cover grid / list of scores. Shared by the library and a collection's view. */
export function ScoreGrid({ scores, view, selected, query = '', onPress, onLongPress, onMore, ListHeaderComponent, ListEmptyComponent, contentContainerStyle }: Props) {
  const { wide, columns } = useScoreGridLayout();
  const selecting = selected.size > 0;
  return view === 'grid' ? (
    <FlashList
      key={`grid-${columns}`}
      data={scores}
      numColumns={columns}
      keyExtractor={s => s.id}
      maintainVisibleContentPosition={NO_ANCHORING}
      extraData={selected}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
      style={styles.list}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <ScoreCard
            title={item.title}
            composer={item.composer ?? undefined}
            coverUri={item.coverPath ?? undefined}
            favorite={item.isFavorite}
            annotated={item.annotated}
            inSetlist={item.inSetlist}
            selected={selected.has(item.id)}
            onPress={() => onPress(item)}
            onLongPress={() => onLongPress(item)}
          />
        </View>
      )}
    />
  ) : (
    <FlashList
      key="list"
      data={scores}
      keyExtractor={s => s.id}
      maintainVisibleContentPosition={NO_ANCHORING}
      extraData={selected}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
      renderItem={({ item }) => (
        <ScoreRow
          score={item}
          query={query}
          wide={wide}
          selected={selected.has(item.id)}
          selecting={selecting}
          onPress={onPress}
          onLongPress={onLongPress}
          onMore={onMore}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -space.xs },
  cell: { flex: 1, padding: space.xs },
});
