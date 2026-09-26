import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  useLongPressGesture,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { runOnUI, scheduleOnRN } from 'react-native-worklets';
import { nextPosition, prevPosition, type Position, type ReaderLayout } from '@/domain/reader/navigation';
import { clampAxis, DOUBLE_TAP_ZOOM, isZoomed, MAX_ZOOM, rubberAxis, visibleTile, zoomAround, type Tile } from '@/domain/reader/zoom';
import { motion } from '@/ui/theme';
import { PageFrame } from './PageFrame';
import type { PageFilter, PageShownEvent } from './ScorePage';

export type TapZone = 'prev' | 'next' | 'center' | 'chrome';

export type StageHandle = {
  /** Slide the row one frame over (optional 120 ms turn), then call onDone to commit the turn. */
  slide: (dir: 1 | -1, onDone: () => void) => void;
  /** Fit-width: scroll within the page. Returns false at the edge (caller turns the page). */
  scrollStep: (dir: 1 | -1) => boolean;
  resetZoom: () => void;
};

type Props = {
  ref?: React.Ref<StageHandle>;
  docId: string;
  pageCount: number;
  /** Flattened [w0, h0, w1, h1…] in points. */
  pageSizes: number[];
  layout: ReaderLayout;
  pos: Position;
  filter: PageFilter;
  halfSplit: number;
  fitWidth: boolean;
  /** 'sides' = 30/40/30 zones; 'anywhere' = tap = next (top band shows controls). */
  tapZones: 'sides' | 'anywhere';
  performance: boolean;
  reduceMotion: boolean;
  /** Direction of the last turn, so fit-width lands at the top (forward) or bottom (backward). */
  arrivedFrom: 1 | -1 | 0;
  turnRequestedAtMs?: number;
  onTap: (zone: TapZone) => void;
  /** A swipe finished its animation: commit the turn in `dir`. */
  onSwipeCommit: (dir: 1 | -1) => void;
  onBoundary: (dir: 1 | -1) => void;
  onZoomedChange: (zoomed: boolean) => void;
  onExitPerformance: () => void;
  onMainShown?: (e: PageShownEvent) => void;
};

const SWIPE_DISTANCE = 0.18;
const SWIPE_VELOCITY = 650;
const DOUBLE_TAP_MS = 230;
const PAN_NONE = 0;
const PAN_SWIPE = 1;
const PAN_CONTENT = 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function PageStage(props: Props) {
  const {
    ref,
    docId,
    pageCount,
    pageSizes,
    layout,
    pos,
    filter,
    halfSplit,
    fitWidth,
    tapZones,
    performance,
    reduceMotion,
    arrivedFrom,
    turnRequestedAtMs,
    onTap,
    onSwipeCommit,
    onBoundary,
    onZoomedChange,
    onExitPerformance,
    onMainShown,
  } = props;

  const [size, setSize] = useState({ width: 0, height: 0 });
  const W = size.width;
  const H = size.height;

  // Content box of the live frame: the stage, or full width × page height when fitting the width.
  const pw = pageSizes[pos.page * 2] ?? 1;
  const ph = pageSizes[pos.page * 2 + 1] ?? 1.3;
  const cw = W;
  const ch = fitWidth ? Math.max(H, Math.round((W * ph) / pw)) : H;

  // Peek frames follow `settlingFrom` until the live frame has drawn the new page (no flicker).
  const [settlingFrom, setSettlingFrom] = useState<Position | null>(null);
  const peekBase = settlingFrom ?? pos;
  const prevPos = prevPosition(peekBase, layout, pageCount);
  const nextPos = nextPosition(peekBase, layout, pageCount);
  const canPrev = prevPosition(pos, layout, pageCount) !== null;
  const canNext = nextPosition(pos, layout, pageCount) !== null;

  const drag = useSharedValue(0);
  const s = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ s: 1, tx: 0, ty: 0, fx: 0, fy: 0 });
  const panMode = useSharedValue(PAN_NONE);
  const geo = useSharedValue({ W: 0, H: 0, cw: 0, ch: 0, canPrev: false, canNext: false, fitWidth: false });
  const ring = useSharedValue(0);
  const ringAt = useSharedValue({ x: 0, y: 0 });

  useEffect(() => {
    geo.value = { W, H, cw, ch, canPrev, canNext, fitWidth };
  }, [W, H, cw, ch, canPrev, canNext, fitWidth, geo]);

  // --- Zoom tiles (sharp re-render of the visible region once a gesture settles) -------------------
  const [tiles, setTiles] = useState<{ main?: Tile; right?: Tile }>({});
  const zoomedRef = useRef(false);

  const publishZoom = useCallback(() => {
    const sc = s.value;
    const zoomed = isZoomed(sc);
    if (zoomed !== zoomedRef.current) {
      zoomedRef.current = zoomed;
      onZoomedChange(zoomed);
    }
    if (sc <= 1.02) {
      setTiles({});
      return;
    }
    if (layout === 'TWO_UP') {
      setTiles({
        main: visibleTile({ x: 0, y: 0, width: cw / 2, height: ch }, W, H, sc, tx.value, ty.value),
        right: visibleTile({ x: cw / 2, y: 0, width: cw / 2, height: ch }, W, H, sc, tx.value, ty.value),
      });
    } else {
      setTiles({ main: visibleTile({ x: 0, y: 0, width: cw, height: ch }, W, H, sc, tx.value, ty.value) });
    }
  }, [W, H, cw, ch, layout, onZoomedChange, s, tx, ty]);

  // New position: drop any zoom; fit-width lands at the top going forward, the bottom going back.
  useEffect(() => {
    cancelAnimation(tx);
    cancelAnimation(ty);
    s.value = 1;
    tx.value = 0;
    ty.value = fitWidth && arrivedFrom < 0 ? Math.min(0, H - ch) : 0;
    if (zoomedRef.current || tiles.main) publishZoom();
  }, [pos.page, pos.half, layout, fitWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stage resized (rotation): keep the content inside the new bounds.
  useEffect(() => {
    tx.value = clampAxis(tx.value, s.value, cw, W);
    ty.value = clampAxis(ty.value, s.value, ch, H);
  }, [W, H, cw, ch, s, tx, ty]);

  // --- Swipe commit / settle -----------------------------------------------------------------------
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaiting = useRef<Position | null>(null);

  const clearSettling = useCallback(() => {
    awaiting.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setSettlingFrom(null);
  }, []);

  const finishSettle = useCallback(() => {
    // Reset the row on the UI thread first; only then let React re-point the peek frames.
    runOnUI(() => {
      'worklet';
      drag.value = 0;
      scheduleOnRN(clearSettling);
    })();
  }, [clearSettling, drag]);

  const commit = useCallback(
    (dir: 1 | -1, onDone: () => void) => {
      const target = dir > 0 ? nextPosition(pos, layout, pageCount) : prevPosition(pos, layout, pageCount);
      awaiting.current = target;
      setSettlingFrom(pos);
      onDone();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(finishSettle, 400); // fallback if the page is slow to draw
    },
    [finishSettle, layout, pageCount, pos],
  );

  const commitSwipe = useCallback((dir: 1 | -1) => commit(dir, () => onSwipeCommit(dir)), [commit, onSwipeCommit]);

  const handleMainShown = useCallback(
    (e: PageShownEvent) => {
      const a = awaiting.current;
      if (a && e.page === a.page) finishSettle();
      onMainShown?.(e);
    },
    [finishSettle, onMainShown],
  );

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      slide: (dir, onDone) => {
        if (reduceMotion || W === 0) return onDone();
        drag.value = withTiming(-dir * W, { duration: 120, easing: motion.easing.standard }, done => {
          if (done) scheduleOnRN(commit, dir, onDone);
        });
      },
      scrollStep: dir => {
        if (!fitWidth || isZoomed(s.value)) return false;
        const minTy = Math.min(0, H - ch);
        const cur = ty.value;
        if (dir > 0 && cur > minTy + 2) {
          ty.value = withTiming(Math.max(minTy, cur - H * 0.85), { duration: reduceMotion ? 0 : 160, easing: motion.easing.standard });
          return true;
        }
        if (dir < 0 && cur < -2) {
          ty.value = withTiming(Math.min(0, cur + H * 0.85), { duration: reduceMotion ? 0 : 160, easing: motion.easing.standard });
          return true;
        }
        return false;
      },
      resetZoom: () => {
        s.value = withTiming(1, { duration: motion.duration.base });
        tx.value = withTiming(0, { duration: motion.duration.base });
        ty.value = withTiming(0, { duration: motion.duration.base }, () => scheduleOnRN(publishZoom));
      },
    }),
    [H, W, ch, commit, drag, fitWidth, publishZoom, reduceMotion, s, tx, ty],
  );

  // --- Gestures ------------------------------------------------------------------------------------
  const pan = usePanGesture({
    maxPointers: 1,
    minDistance: 8,
    onActivate: e => {
      'worklet';
      const g = geo.value;
      const vertical = Math.abs(e.translationY) > Math.abs(e.translationX);
      if (isZoomed(s.value)) panMode.value = PAN_CONTENT;
      else if (g.fitWidth && vertical) panMode.value = PAN_CONTENT;
      else if (!vertical) panMode.value = PAN_SWIPE;
      else panMode.value = PAN_NONE;
      cancelAnimation(tx);
      cancelAnimation(ty);
      start.value = { s: s.value, tx: tx.value, ty: ty.value, fx: 0, fy: 0 };
    },
    onUpdate: e => {
      'worklet';
      const g = geo.value;
      if (panMode.value === PAN_SWIPE) {
        let dx = e.translationX;
        // Resist at the ends of the score: the page moves a little, then stops.
        if ((dx > 0 && !g.canPrev) || (dx < 0 && !g.canNext)) dx *= 0.22;
        drag.value = dx;
      } else if (panMode.value === PAN_CONTENT) {
        const sc = s.value;
        if (isZoomed(sc)) tx.value = rubberAxis(start.value.tx + e.translationX, sc, g.cw, g.W);
        ty.value = rubberAxis(start.value.ty + e.translationY, sc, g.ch, g.H);
      }
    },
    onDeactivate: e => {
      'worklet';
      const g = geo.value;
      if (panMode.value === PAN_SWIPE) {
        const dx = drag.value;
        const vx = e.velocityX;
        let dir = 0;
        if ((dx < -g.W * SWIPE_DISTANCE || vx < -SWIPE_VELOCITY) && g.canNext && dx < 0) dir = 1;
        else if ((dx > g.W * SWIPE_DISTANCE || vx > SWIPE_VELOCITY) && g.canPrev && dx > 0) dir = -1;
        if (dir !== 0) {
          const remaining = g.W - Math.abs(dx);
          const duration = Math.min(220, Math.max(90, (remaining / Math.max(Math.abs(vx), 1)) * 1000));
          const d = dir as 1 | -1;
          drag.value = withTiming(-d * g.W, { duration, easing: Easing.out(Easing.cubic) }, done => {
            if (done) scheduleOnRN(commitSwipe, d);
          });
        } else {
          if (Math.abs(dx) > 24 && ((dx < 0 && !g.canNext) || (dx > 0 && !g.canPrev))) scheduleOnRN(onBoundary, dx < 0 ? 1 : -1);
          drag.value = withSpring(0, motion.springSnappy);
        }
      } else if (panMode.value === PAN_CONTENT) {
        const sc = s.value;
        const minX = Math.min(0, g.W - g.cw * sc);
        const minY = Math.min(0, g.H - g.ch * sc);
        if (isZoomed(sc)) {
          tx.value =
            g.cw * sc <= g.W ? withTiming(clampAxis(0, sc, g.cw, g.W)) : withDecay({ velocity: e.velocityX, clamp: [minX, 0], rubberBandEffect: false });
        }
        ty.value =
          g.ch * sc <= g.H
            ? withTiming(clampAxis(0, sc, g.ch, g.H))
            : withDecay({ velocity: e.velocityY, clamp: [minY, 0], rubberBandEffect: false }, () => {
                scheduleOnRN(publishZoom);
              });
      }
      panMode.value = PAN_NONE;
    },
  });

  const pinch = usePinchGesture({
    onActivate: e => {
      'worklet';
      cancelAnimation(tx);
      cancelAnimation(ty);
      start.value = { s: s.value, tx: tx.value, ty: ty.value, fx: e.focalX, fy: e.focalY };
    },
    onUpdate: e => {
      'worklet';
      const st = start.value;
      const s1 = Math.min(MAX_ZOOM * 1.15, Math.max(0.85, st.s * e.scale));
      s.value = s1;
      tx.value = zoomAround(st.fx, st.tx, st.s, s1) + (e.focalX - st.fx);
      ty.value = zoomAround(st.fy, st.ty, st.s, s1) + (e.focalY - st.fy);
    },
    onDeactivate: e => {
      'worklet';
      const g = geo.value;
      const s1 = s.value;
      const sT = Math.min(MAX_ZOOM, Math.max(1, s1));
      const txT = clampAxis(zoomAround(e.focalX, tx.value, s1, sT), sT, g.cw, g.W);
      const tyT = clampAxis(zoomAround(e.focalY, ty.value, s1, sT), sT, g.ch, g.H);
      const cfg = { duration: motion.duration.base, easing: motion.easing.standard };
      s.value = withTiming(sT, cfg);
      tx.value = withTiming(txT, cfg);
      ty.value = withTiming(tyT, cfg, () => scheduleOnRN(publishZoom));
    },
  });

  // Taps run on JS: zone logic, the double-tap window and chrome are all JS-side decisions.
  const lastCenterTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const centerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleZoomAt = useCallback(
    (x: number, y: number) => {
      const cfg = { duration: reduceMotion ? 0 : motion.duration.slow, easing: motion.easing.standard };
      if (isZoomed(s.value)) {
        s.value = withTiming(1, cfg);
        tx.value = withTiming(clampAxis(0, 1, cw, W), cfg);
        ty.value = withTiming(clampAxis(fitWidth ? ty.value / s.value : 0, 1, ch, H), cfg, () => scheduleOnRN(publishZoom));
      } else {
        const sT = DOUBLE_TAP_ZOOM;
        s.value = withTiming(sT, cfg);
        tx.value = withTiming(clampAxis(zoomAround(x, tx.value, 1, sT), sT, cw, W), cfg);
        ty.value = withTiming(clampAxis(zoomAround(y, ty.value, 1, sT), sT, ch, H), cfg, () => scheduleOnRN(publishZoom));
      }
    },
    [H, W, ch, cw, fitWidth, publishZoom, reduceMotion, s, tx, ty],
  );

  const handleTap = useCallback(
    (x: number, y: number) => {
      if (W === 0) return;
      const zoomed = isZoomed(s.value);
      const fx = x / W;
      const inCenter = fx >= 0.3 && fx <= 0.7;
      // Turning taps are instant; only centre taps (or any tap while zoomed) wait for a double tap.
      if (!zoomed && !inCenter && tapZones === 'sides') {
        onTap(fx < 0.3 ? 'prev' : 'next');
        return;
      }
      if (!zoomed && tapZones === 'anywhere' && y > H * 0.14) {
        onTap('next');
        return;
      }
      const now = Date.now();
      const last = lastCenterTap.current;
      if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 48) {
        lastCenterTap.current = null;
        if (centerTimer.current) clearTimeout(centerTimer.current);
        toggleZoomAt(x, y);
        return;
      }
      lastCenterTap.current = { t: now, x, y };
      if (centerTimer.current) clearTimeout(centerTimer.current);
      centerTimer.current = setTimeout(() => onTap(tapZones === 'anywhere' ? 'chrome' : 'center'), DOUBLE_TAP_MS);
    },
    [H, W, onTap, s, tapZones, toggleZoomAt],
  );

  useEffect(
    () => () => {
      if (centerTimer.current) clearTimeout(centerTimer.current);
    },
    [],
  );

  const tap = useTapGesture({
    runOnJS: true,
    maxDuration: 400,
    maxDistance: 12,
    onActivate: e => handleTap(e.x, e.y),
  });

  const hold = useLongPressGesture({
    enabled: performance,
    minDuration: 1000,
    maxDistance: 24,
    onBegin: e => {
      'worklet';
      const g = geo.value;
      if (e.x < g.W * 0.3 || e.x > g.W * 0.7) return;
      ringAt.value = { x: e.x, y: e.y };
      // A short delay keeps ordinary taps from flashing the ring.
      ring.value = withDelay(140, withTiming(1, { duration: 860, easing: Easing.linear }));
    },
    onActivate: () => {
      'worklet';
      if (ring.value <= 0) return;
      ring.value = withTiming(0, { duration: 180 });
      scheduleOnRN(onExitPerformance);
    },
    onFinalize: () => {
      'worklet';
      if (ring.value > 0) ring.value = withTiming(0, { duration: 160 });
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, tap, hold);

  // --- Styles --------------------------------------------------------------------------------------
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value }] }));
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value > 0 ? 1 : 0,
    transform: [{ translateX: ringAt.value.x - RING / 2 }, { translateY: ringAt.value.y - RING / 2 }],
  }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - ring.value) }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const frameProps = useMemo(
    () => ({ docId, layout, pageCount, filter, halfSplit, width: cw, height: ch }),
    [docId, layout, pageCount, filter, halfSplit, cw, ch],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.stage} onLayout={onLayout} collapsable={false}>
        {W > 0 && (
          <Animated.View style={[styles.row, rowStyle]}>
            {prevPos && (
              <View style={[styles.frame, { left: -W, width: W, height: H }]}>
                <PageFrame {...frameProps} pos={prevPos} />
              </View>
            )}
            <View style={[styles.frame, styles.live, { width: W, height: H }]}>
              <Animated.View style={[{ width: cw, height: ch, transformOrigin: '0 0' }, zoomStyle]}>
                <PageFrame
                  {...frameProps}
                  pos={pos}
                  live
                  prefetchRadius={fitWidth ? 1 : 2}
                  zoomMain={tiles.main}
                  zoomRight={tiles.right}
                  turnRequestedAtMs={turnRequestedAtMs}
                  onMainShown={handleMainShown}
                />
              </Animated.View>
            </View>
            {nextPos && (
              <View style={[styles.frame, { left: W, width: W, height: H }]}>
                <PageFrame {...frameProps} pos={nextPos} />
              </View>
            )}
          </Animated.View>
        )}
        {performance && (
          <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(255,255,255,0.18)" strokeWidth={4} fill="rgba(0,0,0,0.35)" />
              <AnimatedCircle
                cx={RING / 2}
                cy={RING / 2}
                r={RING_R}
                stroke="#FFFFFF"
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${RING_C} ${RING_C}`}
                animatedProps={ringProps}
                rotation={-90}
                origin={`${RING / 2}, ${RING / 2}`}
              />
            </Svg>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const RING = 88;
const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  row: { flex: 1 },
  frame: { position: 'absolute', top: 0, overflow: 'hidden' },
  live: { left: 0 },
  ring: { position: 'absolute', left: 0, top: 0, width: RING, height: RING },
});
