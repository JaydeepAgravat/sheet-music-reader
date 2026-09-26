import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import NativeAppSystem from '@/specs/NativeAppSystem';
import type { RootStackParamList } from '@/app/RootNavigator';
import { getPref, setPref, usePref } from '@/data/prefs';
import { getScore, markOpened, nextInLibrary, updateReaderState, type PageFilter } from '@/data/repos/scores';
import {
  nextPosition,
  normalize,
  pageLabel,
  positionForPage,
  prevPosition,
  resolveLayout,
  usesFitWidth,
  type Position,
  type ReaderModePref,
} from '@/domain/reader/navigation';
import type { PedalAction } from '@/domain/pedals/keymap';
import { haptic } from '@/platform/haptics';
import { Button, EmptyState, Menu, Sheet, type Anchor, type MenuItem } from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { motion, space, useTheme } from '@/ui/theme';
import { ReadingSettings } from '@/features/settings/ReadingSettings';
import { PageStage, type StageHandle, type TapZone } from './PageStage';
import { HalfSplitHandle } from './HalfSplitHandle';
import { EndOfScoreCard, TapZoneHint } from './ReaderOverlays';
import { ReaderTopBar, type TopBarAction } from './ReaderTopBar';
import { Scrubber } from './Scrubber';
import { usePedalTurns } from './usePedalTurns';
import { useScoreDocument } from './useScoreDocument';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Reader'>;

const CHROME_HIDE_MS = 3000;
const FILTERS: PageFilter[] = ['ORIGINAL', 'PAPER', 'SEPIA', 'NIGHT', 'CONTRAST'];
const FILTER_SWATCH: Record<PageFilter, [string, string]> = {
  ORIGINAL: ['#FFFFFF', '#1C1B19'],
  PAPER: ['#F6F0E1', '#2A2723'],
  SEPIA: ['#EBDDBE', '#4A3A22'],
  NIGHT: ['#15161A', '#E6E1D6'],
  CONTRAST: ['#FFFFFF', '#000000'],
};

export function ReaderScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Reader'>>();
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const isFocused = useIsFocused();

  const score = useMemo(() => getScore(params.scoreId), [params.scoreId]);
  const docState = useScoreDocument(score?.filePath ?? null);
  const doc = docState.status === 'ready' ? docState.doc : null;
  const pageCount = doc?.pageCount ?? 0;

  const [pageTurn] = usePref('pageTurn');
  const [tapZones] = usePref('tapZones');
  const [defaultFilter] = usePref('defaultFilter');

  const [modePref, setModePref] = useState<ReaderModePref>(score?.readerMode ?? 'AUTO');
  const [filterOverride, setFilterOverride] = useState<PageFilter | null>(score?.pageFilter ?? null);
  const filter = filterOverride ?? defaultFilter;
  const [halfSplit, setHalfSplit] = useState(score?.halfSplit ?? 0.5);
  const layout = resolveLayout(modePref, viewport);
  const fitWidth = usesFitWidth(layout, viewport);

  const [pos, setPos] = useState<Position>({ page: 0, half: false });
  const [arrivedFrom, setArrivedFrom] = useState<1 | -1 | 0>(0);
  const [chrome, setChrome] = useState(false);
  const [performance, setPerformance] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [endCard, setEndCard] = useState(false);
  const [rotationLocked, setRotationLocked] = useState(false);
  const [menu, setMenu] = useState<{ kind: 'mode' | 'filter' | 'more'; anchor: Anchor } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [hint, setHint] = useState(false);
  const stage = useRef<StageHandle>(null);
  const nextScore = useMemo(() => (endCard && score ? nextInLibrary(score.id) : null), [endCard, score]);

  // --- Open: resume page, bookkeeping, first-run hint ------------------------------------------------
  const opened = useRef(false);
  useEffect(() => {
    if (!doc || !score || opened.current) return;
    opened.current = true;
    const start = params.startPage ?? score.lastPage;
    setPos(positionForPage(start, layout, doc.pageCount));
    markOpened(score.id);
    if (score.pageCount !== doc.pageCount) updateReaderState(score.id, { pageCount: doc.pageCount });
    const resumed = params.startPage === undefined && start > 0 && start < doc.pageCount;
    if (resumed) {
      showSnackbar({
        message: t('reader.resumedAt', { page: start + 1 }),
        action: { label: t('reader.startOver'), onPress: () => jump(0) },
        duration: 2600,
      });
    }
    const shown = getPref('readerHintsShown');
    if (shown < 3) {
      setPref('readerHintsShown', shown + 1);
      setHint(true);
    }
  }, [doc, score]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layout changed (rotation, mode switch): keep the same page, valid for the new layout.
  useEffect(() => {
    if (pageCount) setPos(p => normalize(p, layout, pageCount));
  }, [layout, pageCount]);

  // Per-score memory: last page (debounced), written again on the way out.
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    if (!score || !opened.current) return;
    const timer = setTimeout(() => updateReaderState(score.id, { lastPage: pos.page }), 800);
    return () => clearTimeout(timer);
  }, [pos.page, score]);
  useEffect(
    () => () => {
      if (score && opened.current) updateReaderState(score.id, { lastPage: posRef.current.page });
    },
    [score],
  );

  // --- Window: immersive + keep awake while reading; rotation lock only while here ---------------------
  useFocusEffect(
    useCallback(() => {
      NativeAppSystem.setImmersive(true);
      NativeAppSystem.setKeepAwake(true);
      return () => {
        NativeAppSystem.setImmersive(false);
        NativeAppSystem.setKeepAwake(false);
      };
    }, []),
  );
  useEffect(() => {
    NativeAppSystem.setOrientationLock(rotationLocked);
  }, [rotationLocked]);
  useEffect(() => () => NativeAppSystem.setOrientationLock(false), []);

  // --- Chrome (top bar + scrubber): shown on a centre tap, hidden after 3 s or on a turn ----------------
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdChrome = menu !== null || optionsOpen || scrubbing;
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), CHROME_HIDE_MS);
  }, []);
  useEffect(() => {
    if (!chrome) return;
    if (holdChrome) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [chrome, holdChrome, scheduleHide]);

  const chromeProgress = useSharedValue(0);
  useEffect(() => {
    chromeProgress.value = withTiming(chrome ? 1 : 0, { duration: reduceMotion ? 0 : chrome ? motion.duration.base : motion.duration.fast, easing: motion.easing.standard });
  }, [chrome, chromeProgress, reduceMotion]);
  const topStyle = useAnimatedStyle(() => ({ opacity: chromeProgress.value, transform: [{ translateY: (1 - chromeProgress.value) * -12 }] }));
  const bottomStyle = useAnimatedStyle(() => ({ opacity: chromeProgress.value, transform: [{ translateY: (1 - chromeProgress.value) * 12 }] }));

  // --- Turning ------------------------------------------------------------------------------------
  const adopt = useCallback((target: Position, dir: 1 | -1 | 0) => {
    setPos(target);
    setArrivedFrom(dir);
    setChrome(false);
    setHint(false);
  }, []);

  const jump = useCallback(
    (page: number) => {
      if (!pageCount) return;
      setEndCard(false);
      adopt(positionForPage(page, layout, pageCount), 0);
    },
    [adopt, layout, pageCount],
  );

  const boundary = useCallback(
    (dir: 1 | -1) => {
      haptic('boundary');
      if (dir > 0) {
        setChrome(false);
        setEndCard(true);
      }
    },
    [],
  );

  const turn = useCallback(
    (dir: 1 | -1, source: 'tap' | 'pedal' | 'a11y') => {
      if (!pageCount) return;
      if (endCard) {
        if (dir < 0) setEndCard(false);
        else haptic('boundary');
        return;
      }
      if (stage.current?.scrollStep(dir)) return;
      const target = dir > 0 ? nextPosition(pos, layout, pageCount) : prevPosition(pos, layout, pageCount);
      if (!target) return boundary(dir);
      if (pageTurn === 'slide' && !reduceMotion && !fitWidth && !zoomed && source !== 'a11y') {
        setChrome(false);
        stage.current?.slide(dir, () => adopt(target, dir));
      } else adopt(target, dir);
    },
    [adopt, boundary, endCard, fitWidth, layout, pageCount, pageTurn, pos, reduceMotion, zoomed],
  );

  const onSwipeCommit = useCallback(
    (dir: 1 | -1) => {
      setEndCard(false);
      setPos(p => {
        const target = dir > 0 ? nextPosition(p, layout, pageCount) : prevPosition(p, layout, pageCount);
        return target ?? p;
      });
      setArrivedFrom(dir);
      setChrome(false);
      setHint(false);
    },
    [layout, pageCount],
  );

  const togglePerformance = useCallback(() => {
    setPerformance(p => {
      const next = !p;
      if (next) {
        setChrome(false);
        if (!getPref('performanceHintShown')) {
          setPref('performanceHintShown', true);
          showToast({ message: t('reader.performanceHint'), icon: 'microphone-stage', duration: 3500 });
        }
      }
      haptic('confirm');
      return next;
    });
  }, [t]);

  const setMode = useCallback(
    (m: ReaderModePref) => {
      setModePref(m);
      if (score) updateReaderState(score.id, { readerMode: m });
    },
    [score],
  );

  const setFilter = useCallback(
    (f: PageFilter) => {
      setFilterOverride(f);
      if (score) updateReaderState(score.id, { pageFilter: f });
    },
    [score],
  );

  const onPedalAction = useCallback(
    (action: PedalAction) => {
      switch (action) {
        case 'NEXT':
          return turn(1, 'pedal');
        case 'PREV':
          return turn(-1, 'pedal');
        case 'TOGGLE_HALF':
          return setMode(layout === 'HALF' ? 'AUTO' : 'HALF');
        case 'TOGGLE_PERFORMANCE':
          return togglePerformance();
        default:
          // NEXT_SONG / PREV_SONG only mean something inside a setlist (Phase 6).
          return haptic('reject');
      }
    },
    [layout, setMode, togglePerformance, turn],
  );

  usePedalTurns({
    active: isFocused && !!doc,
    pos,
    layout,
    pageCount,
    nativeTurns: !zoomed && !fitWidth && pageTurn === 'instant' && !endCard,
    onApplied: adopt,
    onAction: onPedalAction,
  });

  const onTap = useCallback(
    (zone: TapZone) => {
      setHint(false);
      if (zone === 'prev') return turn(-1, 'tap');
      if (zone === 'next') return turn(1, 'tap');
      if (performance) return; // no chrome in performance mode; hold the centre to leave
      if (endCard) return setEndCard(false);
      setChrome(c => !c);
    },
    [endCard, performance, turn],
  );

  // TalkBack: announce the page after each turn.
  const label = pageCount ? pageLabel(pos, layout, pageCount) : '';
  useEffect(() => {
    if (label) AccessibilityInfo.announceForAccessibility(t('reader.pageOf', { page: label, count: pageCount }));
  }, [label]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Menus -----------------------------------------------------------------------------------------
  const wide = viewport.width >= 600;
  const openMenu = (kind: 'mode' | 'filter' | 'more') => (anchor: Anchor) => setMenu({ kind, anchor });

  const modeIcon = layout === 'TWO_UP' ? 'page-two-up' : layout === 'HALF' ? 'page-half' : 'page-single';
  const actions: TopBarAction[] = [
    { key: 'mode', icon: modeIcon, label: t('reader.layout'), onPress: openMenu('mode') },
    { key: 'filter', icon: 'drop-half', label: t('reader.filter'), selected: filter !== 'ORIGINAL', onPress: openMenu('filter') },
    ...(wide
      ? [
          {
            key: 'rotation',
            icon: rotationLocked ? ('lock-simple' as const) : ('device-rotate' as const),
            label: rotationLocked ? t('reader.unlockRotation') : t('reader.lockRotation'),
            selected: rotationLocked,
            onPress: () => toggleRotation(),
          },
          { key: 'performance', icon: 'microphone-stage' as const, label: t('reader.performance'), onPress: () => togglePerformance() },
          { key: 'annotate', icon: 'pencil-simple' as const, label: t('reader.annotate'), onPress: () => showToast({ message: t('reader.annotateSoon'), icon: 'pencil-simple' }) },
        ]
      : []),
    { key: 'more', icon: 'dots-three-vertical', label: t('common.moreOptions'), onPress: openMenu('more') },
  ];

  function toggleRotation() {
    setRotationLocked(l => {
      showToast({ message: l ? t('reader.rotationUnlocked') : t('reader.rotationLocked'), icon: l ? 'lock-simple-open' : 'lock-simple' });
      return !l;
    });
  }

  const menuItems: MenuItem[] = !menu
    ? []
    : menu.kind === 'mode'
      ? [
          { key: 'AUTO', label: t('reader.modeAuto'), hint: t('reader.modeAutoHint'), icon: 'device-rotate', selected: modePref === 'AUTO', onPress: () => setMode('AUTO') },
          { key: 'SINGLE', label: t('reader.modeSingle'), icon: 'page-single', selected: modePref === 'SINGLE', onPress: () => setMode('SINGLE') },
          { key: 'TWO_UP', label: t('reader.modeTwoUp'), icon: 'page-two-up', selected: modePref === 'TWO_UP', onPress: () => setMode('TWO_UP') },
          { key: 'HALF', label: t('reader.modeHalf'), hint: t('reader.modeHalfHint'), icon: 'page-half', selected: modePref === 'HALF', onPress: () => setMode('HALF') },
        ]
      : menu.kind === 'filter'
        ? FILTERS.map(f => ({
            key: f,
            label: t(`filters.${f}`),
            selected: filter === f,
            leading: <FilterSwatch filter={f} />,
            onPress: () => setFilter(f),
          }))
        : [
            ...(!wide
              ? [
                  { key: 'performance', label: t('reader.performance'), icon: 'microphone-stage' as const, onPress: togglePerformance },
                  { key: 'rotation', label: rotationLocked ? t('reader.unlockRotation') : t('reader.lockRotation'), icon: 'device-rotate' as const, selected: rotationLocked, onPress: toggleRotation },
                  { key: 'annotate', label: t('reader.annotate'), icon: 'pencil-simple' as const, onPress: () => showToast({ message: t('reader.annotateSoon'), icon: 'pencil-simple' }) },
                ]
              : []),
            { key: 'first', label: t('reader.firstPage'), icon: 'arrow-line-left', onPress: () => jump(0), dividerBefore: !wide },
            { key: 'last', label: t('reader.lastPage'), icon: 'skip-forward', onPress: () => jump(pageCount - 1) },
            ...(zoomed ? [{ key: 'zoom', label: t('reader.resetZoom'), icon: 'arrows-in' as const, onPress: () => stage.current?.resetZoom() }] : []),
            { key: 'options', label: t('reader.options'), icon: 'sliders-horizontal', onPress: () => setOptionsOpen(true), dividerBefore: true },
          ];

  // --- Render ----------------------------------------------------------------------------------------
  const backdrop = performance || filter === 'NIGHT' ? '#000000' : colors.readerBackdrop;

  if (!score) {
    return <ReaderMessage title={t('reader.missingTitle')} body={t('reader.missingBody')} onBack={() => nav.goBack()} />;
  }
  if (docState.status === 'error') {
    return (
      <ReaderMessage
        title={docState.reason === 'password' ? t('reader.passwordTitle') : t('reader.unreadableTitle')}
        body={docState.reason === 'password' ? t('reader.passwordBody') : t('reader.unreadableBody')}
        onBack={() => nav.goBack()}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: backdrop }]}>
      <View
        style={styles.fill}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${score.title}. ${label ? t('reader.pageOf', { page: label, count: pageCount }) : ''}`}
        accessibilityHint={t('reader.a11yHint')}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'increment') turn(1, 'a11y');
          else if (e.nativeEvent.actionName === 'decrement') turn(-1, 'a11y');
          else setChrome(c => !c);
        }}
      >
        {doc && (
          <PageStage
            ref={stage}
            docId={doc.docId}
            pageCount={doc.pageCount}
            pageSizes={doc.pageSizes}
            layout={layout}
            pos={pos}
            filter={filter}
            halfSplit={halfSplit}
            fitWidth={fitWidth}
            tapZones={tapZones}
            performance={performance}
            reduceMotion={reduceMotion}
            arrivedFrom={arrivedFrom}
            onTap={onTap}
            onSwipeCommit={onSwipeCommit}
            onBoundary={boundary}
            onZoomedChange={setZoomed}
            onExitPerformance={togglePerformance}
          />
        )}
      </View>

      {hint && !performance && <TapZoneHint mode={tapZones} onDone={() => setHint(false)} />}

      {doc && !performance && (
        <>
          <Animated.View
            pointerEvents={chrome ? 'box-none' : 'none'}
            style={[styles.top, { paddingTop: insets.top, backgroundColor: colors.readerChrome, borderColor: colors.borderSubtle }, topStyle]}
          >
            <ReaderTopBar title={score.title} composer={score.composer} onBack={() => nav.goBack()} actions={actions} />
          </Animated.View>
          <Animated.View
            pointerEvents={chrome ? 'box-none' : 'none'}
            style={[styles.bottom, { paddingBottom: insets.bottom + space.sm, backgroundColor: colors.readerChrome, borderColor: colors.borderSubtle }, bottomStyle]}
          >
            <Scrubber
              docId={doc.docId}
              pageCount={doc.pageCount}
              pageSizes={doc.pageSizes}
              page={pos.page}
              label={label}
              filter={filter}
              onSeek={jump}
              onScrubbingChange={setScrubbing}
            />
          </Animated.View>
        </>
      )}

      {doc && chrome && !performance && layout === 'HALF' && pos.half && (
        <HalfSplitHandle
          {...fittedPage(doc.pageSizes, pos.page, viewport.width, viewport.height)}
          split={halfSplit}
          onChange={setHalfSplit}
          onCommit={v => {
            setHalfSplit(v);
            updateReaderState(score.id, { halfSplit: v });
          }}
        />
      )}

      {endCard && (
        <EndOfScoreCard
          title={score.title}
          nextTitle={nextScore?.title ?? null}
          onClose={() => setEndCard(false)}
          onBackToStart={() => jump(0)}
          onNext={() => nextScore && nav.replace('Reader', { scoreId: nextScore.id })}
        />
      )}

      <Menu
        visible={menu !== null}
        anchor={menu?.anchor ?? null}
        title={menu?.kind === 'mode' ? t('reader.layout') : menu?.kind === 'filter' ? t('reader.filter') : undefined}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
      <Sheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title={t('reader.options')}>
        <ReadingSettings
          onOpenPedals={() => {
            setOptionsOpen(false);
            nav.navigate('Pedals');
          }}
        />
      </Sheet>
    </View>
  );
}

/** Where a page sits when fitted (contain) in the stage — mirrors ScorePageView's fitRect. */
function fittedPage(sizes: number[], page: number, w: number, h: number): { top: number; height: number } {
  const pw = sizes[page * 2] ?? 1;
  const ph = sizes[page * 2 + 1] ?? 1.3;
  const scale = Math.min(w / pw, h / ph);
  return { top: (h - ph * scale) / 2, height: ph * scale };
}

function FilterSwatch({ filter }: { filter: PageFilter }) {
  const [paper, ink] = FILTER_SWATCH[filter];
  return (
    <View style={[styles.swatch, { backgroundColor: paper }]}>
      <View style={[styles.swatchLine, { backgroundColor: ink }]} />
      <View style={[styles.swatchLine, styles.swatchShort, { backgroundColor: ink }]} />
    </View>
  );
}

function ReaderMessage({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const art = (
    <View style={[styles.messageArt, { backgroundColor: colors.surfaceSunken }]}>
      <Icon name="file-pdf" size={40} color="textSecondary" />
    </View>
  );
  return (
    <View style={[styles.root, styles.center, { backgroundColor: colors.canvas }]}>
      <EmptyState art={art} title={title} body={body} />
      <Button label={t('common.back')} icon="arrow-left" variant="secondary" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  top: { position: 'absolute', left: 0, right: 0, top: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: space.sm, paddingHorizontal: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  messageArt: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)', padding: 6, gap: 4, justifyContent: 'center' },
  swatchLine: { height: 2, borderRadius: 1 },
  swatchShort: { width: '60%' },
});
