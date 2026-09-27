import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import { getScore } from '@/data/repos/scores';
import { getSetlist, listItems, type SetlistItem } from '@/data/repos/setlists';
import { positionForPage, resolveLayout, usesFitWidth, type ReaderModePref } from '@/domain/reader/navigation';
import { PageFrame } from './PageFrame';
import { ReaderSession, type SetlistContext } from './ReaderSession';
import { SetlistJumpSheet } from './SetlistOverlays';
import { useDocuments } from './useDocuments';
import type { OpenedDocument } from '@/specs/NativeScoreRenderer';

/**
 * The reader route. A single score, or a setlist being played: then the current song, the next
 * and the previous one are kept open, and the next song's start page is rendered off screen, so
 * pedalling past the last page shows it at once.
 */
export function ReaderScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Reader'>>();
  return params.setlistId ? (
    <SetlistReader setlistId={params.setlistId} initialIndex={params.itemIndex ?? 0} />
  ) : (
    <SingleReader scoreId={params.scoreId} startPage={params.startPage} />
  );
}

function SingleReader({ scoreId, startPage }: { scoreId: string; startPage?: number }) {
  const score = useMemo(() => getScore(scoreId), [scoreId]);
  const docFor = useDocuments(score ? [score.filePath] : []);
  return <ReaderSession key={scoreId} score={score} docState={docFor(score?.filePath)} startPage={startPage} />;
}

const playable = (items: readonly SetlistItem[], from: number, step: 1 | -1): number => {
  for (let i = from + step; i >= 0 && i < items.length; i += step) if (!items[i]!.score.deleted) return i;
  return -1;
};

function SetlistReader({ setlistId, initialIndex }: { setlistId: string; initialIndex: number }) {
  const { t } = useTranslation();
  const setlist = useLiveQuery(['setlists'], () => getSetlist(setlistId), [setlistId]);
  const items = useLiveQuery(['setlists', 'scores'], () => listItems(setlistId), [setlistId]);
  const [index, setIndex] = useState(initialIndex);
  const [arrival, setArrival] = useState<{ index: number; page?: number }>({ index: initialIndex });
  const [jumpOpen, setJumpOpen] = useState(false);

  const cur = Math.min(Math.max(0, index), Math.max(0, items.length - 1));
  const item = items[cur];
  const nextIdx = playable(items, cur, 1);
  const prevIdx = playable(items, cur, -1);
  const next = nextIdx >= 0 ? items[nextIdx] : undefined;
  const prev = prevIdx >= 0 ? items[prevIdx] : undefined;

  const score = useMemo(() => (item ? getScore(item.scoreId) : null), [item]);
  const nextScore = useMemo(() => (next ? getScore(next.scoreId) : null), [next]);
  const prevScore = useMemo(() => (prev ? getScore(prev.scoreId) : null), [prev]);
  const docFor = useDocuments([score?.filePath, nextScore?.filePath, prevScore?.filePath].filter((p): p is string => !!p));

  const go = useCallback((i: number, page?: number) => {
    setIndex(i);
    setArrival({ index: i, page });
  }, []);

  const ctx: SetlistContext | undefined = setlist
    ? {
        name: setlist.name,
        index: cur,
        count: items.length,
        nextTitle: next?.score.title ?? null,
        hasPrev: !!prev,
        goNext: () => nextIdx >= 0 && go(nextIdx),
        goPrev: toEnd => prevIdx >= 0 && go(prevIdx, toEnd && prev ? Math.max(0, prev.score.pageCount - 1) : undefined),
        openJumpList: () => setJumpOpen(true),
      }
    : undefined;

  const startPage = arrival.index === cur && arrival.page !== undefined ? arrival.page : item?.startPage ?? 0;
  const nextDoc = docFor(nextScore?.filePath);

  return (
    <View style={styles.fill}>
      {nextDoc.status === 'ready' && nextScore && next && (
        <SongPrefetch doc={nextDoc.doc} readerMode={nextScore.readerMode} startPage={next.startPage} />
      )}
      <ReaderSession key={`${item?.id ?? 'none'}:${arrival.index}`} score={score} docState={docFor(score?.filePath)} startPage={startPage} setlist={ctx} />
      <SetlistJumpSheet
        visible={jumpOpen}
        name={setlist?.name ?? t('nav.setlists')}
        songs={items.map(it => ({ key: it.id, title: it.score.title, subtitle: it.score.composer, missing: it.score.deleted }))}
        current={cur}
        onPick={i => go(i)}
        onClose={() => setJumpOpen(false)}
      />
    </View>
  );
}

/**
 * Renders the next song's start position invisibly at the exact size the reader will use, so its
 * bitmaps are in the render cache before the pedal press that shows them.
 */
function SongPrefetch({ doc, readerMode, startPage }: { doc: OpenedDocument; readerMode: ReaderModePref | null; startPage: number }) {
  const viewport = useWindowDimensions();
  const layout = resolveLayout(readerMode ?? 'AUTO', viewport);
  const pos = positionForPage(startPage, layout, doc.pageCount);
  const W = viewport.width;
  const H = viewport.height;
  const pw = doc.pageSizes[pos.page * 2] ?? 1;
  const ph = doc.pageSizes[pos.page * 2 + 1] ?? 1.3;
  const ch = usesFitWidth(layout, viewport) ? Math.max(H, Math.round((W * ph) / pw)) : H;
  return (
    <View style={styles.prefetch} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <PageFrame docId={doc.docId} pos={pos} layout={layout} pageCount={doc.pageCount} filter="ORIGINAL" halfSplit={0.5} width={W} height={ch} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Laid out (so native views get a real size and render) but never visible or touchable.
  prefetch: { position: 'absolute', left: 0, top: 0, opacity: 0 },
});
