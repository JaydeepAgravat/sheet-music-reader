import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { slotsFor, type Position, type ReaderLayout } from '@/domain/reader/navigation';
import { ScorePage, type PageFilter, type PageShownEvent, type ZoomTile } from './ScorePage';

type Props = {
  docId: string;
  pos: Position;
  layout: ReaderLayout;
  pageCount: number;
  filter: PageFilter;
  halfSplit: number;
  width: number;
  height: number;
  /** The live frame registers its views for native pedal turns and prefetches neighbours. */
  live?: boolean;
  zoomMain?: ZoomTile;
  zoomRight?: ZoomTile;
  prefetchRadius?: number;
  turnRequestedAtMs?: number;
  onMainShown?: (e: PageShownEvent) => void;
};

/**
 * Everything visible at one reader position: one page, a half-page composite, or a two-up spread.
 * Two-up pages hug the spine (left page right-aligned, right page left-aligned) like an open book.
 */
export const PageFrame = memo(function PageFrameImpl({
  docId,
  pos,
  layout,
  pageCount,
  filter,
  halfSplit,
  width,
  height,
  live,
  zoomMain,
  zoomRight,
  prefetchRadius = 2,
  turnRequestedAtMs,
  onMainShown,
}: Props) {
  const slots = slotsFor(pos, layout, pageCount);
  const radius = live ? prefetchRadius : 0;
  if (layout === 'TWO_UP') {
    const [left, right] = slots;
    return (
      <View style={[styles.row, { width, height }]}>
        <ScorePage
          docId={docId}
          page={left?.page ?? -1}
          filter={filter}
          align="RIGHT"
          // Two-up: the right view prefetches the other side, so each view looks ahead by spreads.
          prefetchRadius={radius}
          readerSlot={live ? 'main' : ''}
          zoom={zoomMain}
          turnRequestedAtMs={turnRequestedAtMs}
          onPageShown={onMainShown}
          style={styles.half}
        />
        <ScorePage
          docId={docId}
          page={right?.page ?? -1}
          filter={filter}
          align="LEFT"
          prefetchRadius={radius}
          readerSlot={live ? 'right' : ''}
          zoom={zoomRight}
          style={styles.half}
        />
      </View>
    );
  }
  const main = slots[0];
  return (
    <ScorePage
      docId={docId}
      page={main?.page ?? -1}
      mode={main?.mode}
      halfSplit={halfSplit}
      filter={filter}
      prefetchRadius={radius}
      readerSlot={live ? 'main' : ''}
      zoom={zoomMain}
      turnRequestedAtMs={turnRequestedAtMs}
      onPageShown={onMainShown}
      style={{ width, height }}
    />
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  half: { flex: 1 },
});
