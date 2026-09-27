import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import ScorePageViewNative, { type PageShownEvent } from '@/specs/ScorePageViewNativeComponent';

export type PageMode = 'SINGLE' | 'HALF';
export type PageFilter = 'ORIGINAL' | 'PAPER' | 'SEPIA' | 'NIGHT' | 'CONTRAST';
export type PageAlign = 'LEFT' | 'CENTER' | 'RIGHT';
export type { PageShownEvent };

/** Visible region of the view (0..1 in its own coordinates) at a zoom scale; scale 1 = no tile. */
export type ZoomTile = { scale: number; left: number; top: number; right: number; bottom: number };

type Props = {
  docId: string;
  /** -1 = empty. */
  page: number;
  mode?: PageMode;
  halfSplit?: number;
  filter?: PageFilter;
  prefetchRadius?: number;
  turnRequestedAtMs?: number;
  align?: PageAlign;
  /** Registers the view for native pedal turns ('main' | 'right'). */
  readerSlot?: string;
  /** Score id whose ink this view draws (and, unless a thumbnail, captures). */
  inkKey?: string;
  thumbnail?: boolean;
  zoom?: ZoomTile;
  onPageShown?: (e: PageShownEvent) => void;
  style?: StyleProp<ViewStyle>;
};

/** One natively rendered score page (see android/.../renderer/ScorePageView.kt). */
export function ScorePage({
  docId,
  page,
  mode = 'SINGLE',
  halfSplit = 0.5,
  filter = 'ORIGINAL',
  prefetchRadius = 2,
  turnRequestedAtMs = 0,
  align = 'CENTER',
  readerSlot = '',
  inkKey = '',
  thumbnail = false,
  zoom,
  onPageShown,
  style,
}: Props) {
  return (
    <ScorePageViewNative
      docId={docId}
      page={page}
      mode={mode}
      halfSplit={halfSplit}
      pageFilter={filter}
      prefetchRadius={prefetchRadius}
      turnRequestedAtMs={turnRequestedAtMs}
      alignX={align}
      readerSlot={readerSlot}
      inkKey={inkKey}
      thumbnail={thumbnail}
      zoomScale={zoom?.scale ?? 1}
      zoomLeft={zoom?.left ?? 0}
      zoomTop={zoom?.top ?? 0}
      zoomRight={zoom?.right ?? 1}
      zoomBottom={zoom?.bottom ?? 1}
      onPageShown={onPageShown ? e => onPageShown(e.nativeEvent) : undefined}
      style={style}
      // Pages are announced by the reader (page label), not per native view.
      importantForAccessibility="no-hide-descendants"
    />
  );
}
