import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import NativeAppSystem from '@/specs/NativeAppSystem';
import NativeInk from '@/specs/NativeInk';
import type { RootStackParamList } from '@/app/RootNavigator';
import { getPref, setPref, usePref } from '@/data/prefs';
import { markOpened, nextInLibrary, updateReaderState, type PageFilter, type Score } from '@/data/repos/scores';
import {
  nextPosition,
  normalize,
  pageLabel,
  positionForPage,
  prevPosition,
  resolveLayout,
  usesFitWidth,
  visiblePages,
  type Position,
  type ReaderModePref,
} from '@/domain/reader/navigation';
import type { PedalAction } from '@/domain/pedals/keymap';
import { normalizePresets, presetArgb, type InkPreset } from '@/domain/ink/presets';
import { haptic } from '@/platform/haptics';
import { Button, EmptyState, IconButton, Menu, Sheet, type Anchor, type MenuItem } from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { motion, space, useTheme } from '@/ui/theme';
import { ReadingSettings } from '@/features/settings/ReadingSettings';
import { ERASER, InkToolbar } from '@/features/ink/InkToolbar';
import { useInkSession } from '@/features/ink/useInkSession';
import { SHOW_DEV_TOOLS } from '@/dev/flags';
import { makeStressStrokes } from '@/dev/inkStress';
import { PageStage, type StageHandle, type TapZone } from './PageStage';
import { HalfSplitHandle } from './HalfSplitHandle';
import { EndOfScoreCard, TapZoneHint } from './ReaderOverlays';
import { ReaderTopBar, type TopBarAction } from './ReaderTopBar';
import { Scrubber } from './Scrubber';
import { usePedalTurns } from './usePedalTurns';
import type { DocState } from './useScoreDocument';
import { NextSongPill } from './SetlistOverlays';
import { AnnotateHint } from '@/features/onboarding/AnnotateHint';

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

/** What the reader needs from a playing setlist (see ReaderScreen). */
export type SetlistContext = {
  name: string;
  index: number;
  count: number;
  nextTitle: string | null;
  hasPrev: boolean;
  goNext: () => void;
  /** Previous song; `toEnd` lands on its last page (paging back past page 1). */
  goPrev: (toEnd: boolean) => void;
  openJumpList: () => void;
};

type Props = {
  score: Score | null;
  docState: DocState;
  /** Overrides the remembered page (setlists always use the entry's start page). */
  startPage?: number;
  setlist?: SetlistContext;
};

/** One score in the reader. Remounted per score, so setlists get a fresh session per song. */
export function ReaderSession({ score, docState, startPage: startPageProp, setlist }: Props) {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const isFocused = useIsFocused();

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

  // When the document is already open (setlists pre-open the next song), start on the right page
  // in the very first frame — its bitmap is already rendered, so nothing else may flash first.
  const [pos, setPos] = useState<Position>(() =>
    doc && score ? positionForPage(startPageProp ?? score.lastPage, layout, doc.pageCount) : { page: 0, half: false },
  );
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
  const [annotating, setAnnotating] = useState(false);
  const [stylusSeen, setStylusSeen] = useState(() => NativeInk.hasSeenStylus());
  const [presetsRaw, setPresetsRaw] = usePref('inkPresets');
  const [activeTool, setActiveTool] = usePref('inkActiveTool');
  const [fingerDraws, setFingerDraws] = usePref('inkFingerDraws');
  const [stylusAnywhere] = usePref('inkStylusAnywhere');
  const presets = useMemo(() => normalizePresets(presetsRaw), [presetsRaw]);
  const ink = useInkSession(score?.id ?? null);
  const fingerInk = annotating && (fingerDraws || !stylusSeen);
  const stage = useRef<StageHandle>(null);
  const nextScore = useMemo(() => (endCard && score && !setlist ? nextInLibrary(score.id) : null), [endCard, score, setlist]);

  // --- Open: resume page, bookkeeping, first-run hint ------------------------------------------------
  const opened = useRef(false);
  useEffect(() => {
    if (!doc || !score || opened.current) return;
    opened.current = true;
    const start = startPageProp ?? score.lastPage;
    setPos(positionForPage(start, layout, doc.pageCount));
    markOpened(score.id);
    if (score.pageCount !== doc.pageCount) updateReaderState(score.id, { pageCount: doc.pageCount });
    const resumed = startPageProp === undefined && start > 0 && start < doc.pageCount;
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
      // Setlists flow straight into the next song (already rendered) — the gig never stops.
      if (setlist) {
        if (dir > 0 && setlist.nextTitle) return setlist.goNext();
        if (dir < 0 && setlist.hasPrev) return setlist.goPrev(true);
      }
      haptic('boundary');
      if (dir > 0) {
        setChrome(false);
        setEndCard(true);
      }
    },
    [setlist],
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
        setAnnotating(false);
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
        case 'NEXT_SONG':
          if (setlist?.nextTitle) return setlist.goNext();
          return haptic('reject');
        case 'PREV_SONG':
          if (setlist?.hasPrev) return setlist.goPrev(false);
          return haptic('reject');
        default:
          return haptic('reject');
      }
    },
    [layout, setMode, setlist, togglePerformance, turn],
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
      if (performance || annotating) return; // no chrome in performance/annotate mode
      if (endCard) return setEndCard(false);
      setChrome(c => !c);
    },
    [annotating, endCard, performance, turn],
  );

  // --- Ink ---------------------------------------------------------------------------------------------
  const activePreset = presets.find(p => p.id === activeTool) ?? presets[0]!;
  useEffect(() => {
    NativeInk.setTool({
      annotating: annotating && isFocused,
      stylusDraws: isFocused && !performance && (stylusAnywhere || annotating),
      fingerDraws,
      tool: activeTool === ERASER ? 'ERASER' : activePreset.kind,
      color: presetArgb(activePreset),
      width: activePreset.width,
    });
  }, [annotating, isFocused, performance, stylusAnywhere, fingerDraws, activeTool, activePreset]);
  useEffect(
    () => () => NativeInk.setTool({ annotating: false, stylusDraws: false, fingerDraws: false, tool: 'PEN', color: 0, width: 1 }),
    [],
  );
  useEffect(() => {
    const sub = NativeInk.onStylus(() => {
      setStylusSeen(true);
      showToast({ message: t('ink.stylusReady'), icon: 'pen-nib', duration: 3200 });
    });
    return () => sub.remove();
  }, [t]);

  const startAnnotating = useCallback(() => {
    setAnnotating(true);
    setPerformance(false);
    setChrome(false);
    setHint(false);
    setEndCard(false);
  }, []);
  const stopAnnotating = useCallback(() => setAnnotating(false), []);

  // Back leaves annotate mode before it leaves the reader.
  useEffect(() => {
    if (!annotating) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAnnotating(false);
      return true;
    });
    return () => sub.remove();
  }, [annotating]);

  const inkPages = pageCount ? visiblePages(pos, layout, pageCount) : [];
  const clearTargets = inkPages.map(p => ({ page: p, count: ink.countOnPage(p) })).filter(c => c.count > 0);
  const clearPage = useCallback(
    (page: number) => {
      const n = ink.clearPage(page);
      if (n) showSnackbar({ message: t('ink.pageCleared'), action: { label: t('common.undo'), onPress: ink.undo } });
    },
    [ink, t],
  );
  const editPreset = useCallback(
    (next: InkPreset) => setPresetsRaw(presets.map(p => (p.id === next.id ? next : p))),
    [presets, setPresetsRaw],
  );

  // Dev: a trace of every position shown, for scripted gig simulations (adb logcat ReactNativeJS).
  useEffect(() => {
    if (__DEV__ && doc && score) console.log(`[reader] ${setlist ? `song ${setlist.index + 1} ` : ''}${score.title} page ${pos.page + 1}${pos.half ? ' half' : ''}`);
  }, [pos, doc]); // eslint-disable-line react-hooks/exhaustive-deps

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
    ...(setlist ? [{ key: 'songs', icon: 'queue' as const, label: t('setlistPlay.songs'), onPress: () => setlist.openJumpList() }] : []),
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
          { key: 'annotate', icon: 'pencil-simple' as const, label: t('reader.annotate'), onPress: startAnnotating },
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
                  { key: 'annotate', label: t('reader.annotate'), icon: 'pencil-simple' as const, onPress: startAnnotating },
                ]
              : []),
            { key: 'first', label: t('reader.firstPage'), icon: 'arrow-line-left', onPress: () => jump(0), dividerBefore: !wide },
            { key: 'last', label: t('reader.lastPage'), icon: 'skip-forward', onPress: () => jump(pageCount - 1) },
            ...(zoomed ? [{ key: 'zoom', label: t('reader.resetZoom'), icon: 'arrows-in' as const, onPress: () => stage.current?.resetZoom() }] : []),
            { key: 'options', label: t('reader.options'), icon: 'sliders-horizontal', onPress: () => setOptionsOpen(true), dividerBefore: true },
            ...(SHOW_DEV_TOOLS && score
              ? [{ key: 'dev-ink', label: 'Dev: add 2,000 strokes to this page', icon: 'sparkle' as const, onPress: () => ink.addRows(makeStressStrokes(score.id, pos.page)) }]
              : []),
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
            inkKey={score.id}
            fingerInk={fingerInk}
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
      <AnnotateHint trigger={!!doc && chrome && !hint} blocked={performance || annotating} top={insets.top + 60 + space.sm} />

      {doc && !performance && !annotating && (
        <>
          <Animated.View
            pointerEvents={chrome ? 'box-none' : 'none'}
            style={[styles.top, { paddingTop: insets.top, backgroundColor: colors.readerChrome, borderColor: colors.borderSubtle }, topStyle]}
          >
            <ReaderTopBar
              title={score.title}
              composer={setlist ? t('setlistPlay.position', { index: setlist.index + 1, count: setlist.count, name: setlist.name }) : score.composer}
              onBack={() => nav.goBack()}
              actions={actions}
            />
          </Animated.View>
          <Animated.View
            pointerEvents={chrome ? 'box-none' : 'none'}
            style={[styles.bottom, { paddingBottom: insets.bottom + space.sm, backgroundColor: colors.readerChrome, borderColor: colors.borderSubtle }, bottomStyle]}
          >
            <Scrubber
              docId={doc.docId}
              inkKey={score.id}
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

      {doc && annotating && (
        <>
          {fingerInk && (
            <>
              <View style={[styles.turnBtn, { left: insets.left + space.sm }]} pointerEvents="box-none">
                <IconButton icon="caret-left" label={t('reader.previousPage')} variant="tonal" onPress={() => turn(-1, 'tap')} />
              </View>
              <View style={[styles.turnBtn, { right: insets.right + space.sm }]} pointerEvents="box-none">
                <IconButton icon="caret-right" label={t('reader.nextPage')} variant="tonal" onPress={() => turn(1, 'tap')} />
              </View>
            </>
          )}
          <InkToolbar
            presets={presets}
            active={activeTool === ERASER || presets.some(p => p.id === activeTool) ? activeTool : activePreset.id}
            onSelect={setActiveTool}
            onEditPreset={editPreset}
            canUndo={ink.canUndo}
            canRedo={ink.canRedo}
            onUndo={ink.undo}
            onRedo={ink.redo}
            clearTargets={clearTargets}
            onClearPage={clearPage}
            fingerDraws={fingerDraws}
            onToggleFingerDraws={() => setFingerDraws(!fingerDraws)}
            onDone={stopAnnotating}
            docked={!wide}
            bounds={viewport}
          />
        </>
      )}

      {setlist?.nextTitle && pageCount > 0 && !endCard && !annotating && !nextPosition(pos, layout, pageCount) && (
        <NextSongPill title={setlist.nextTitle} bottom={insets.bottom + (chrome ? 120 : space.lg)} onPress={setlist.goNext} />
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
  turnBtn: { position: 'absolute', top: '50%', marginTop: -24 },
});
