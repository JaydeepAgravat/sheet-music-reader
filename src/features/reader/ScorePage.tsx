import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import ScorePageViewNative, { type PageShownEvent } from '@/specs/ScorePageViewNativeComponent';

export type PageMode = 'SINGLE' | 'HALF';
export type PageFilter = 'ORIGINAL' | 'PAPER' | 'SEPIA' | 'NIGHT' | 'CONTRAST';
export type { PageShownEvent };

type Props = {
  docId: string;
  page: number;
  mode?: PageMode;
  halfSplit?: number;
  filter?: PageFilter;
  prefetchRadius?: number;
  turnRequestedAtMs?: number;
  onPageShown?: (e: PageShownEvent) => void;
  style?: StyleProp<ViewStyle>;
};

/** One natively rendered score page (see android/.../renderer/ScorePageView.kt). */
export function ScorePage({ docId, page, mode = 'SINGLE', halfSplit = 0.5, filter = 'ORIGINAL', prefetchRadius = 2, turnRequestedAtMs = 0, onPageShown, style }: Props) {
  return (
    <ScorePageViewNative
      docId={docId}
      page={page}
      mode={mode}
      halfSplit={halfSplit}
      pageFilter={filter}
      prefetchRadius={prefetchRadius}
      turnRequestedAtMs={turnRequestedAtMs}
      onPageShown={onPageShown ? e => onPageShown(e.nativeEvent) : undefined}
      style={style}
    />
  );
}
