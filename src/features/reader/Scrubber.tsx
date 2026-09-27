import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { haptic } from '@/platform/haptics';
import { Text } from '@/ui/components';
import { elevation, motion, radius, space, useTheme } from '@/ui/theme';
import { ScorePage, type PageFilter } from './ScorePage';

type Props = {
  docId: string;
  inkKey?: string;
  pageCount: number;
  /** Flattened page sizes (points), for thumbnail aspect ratios. */
  pageSizes: number[];
  /** 0-based first visible page. */
  page: number;
  label: string;
  filter: PageFilter;
  onSeek: (page: number) => void;
  onScrubbingChange: (scrubbing: boolean) => void;
};

const THUMB_H = 44;
const GAP = 3;
const BUBBLE_W = 112;

/**
 * Thumbnail strip with a draggable page window. Dragging shows a large preview bubble and ticks a
 * haptic detent on every page; releasing jumps there. Tapping the strip jumps directly.
 */
export const Scrubber = memo(function ScrubberImpl({ docId, inkKey, pageCount, pageSizes, page, label, filter, onSeek, onScrubbingChange }: Props) {
  const { t } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const [trackW, setTrackW] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const lastTick = useRef(-1);

  const aspect = (pageSizes[0] ?? 0.77) / (pageSizes[1] ?? 1) || 0.77;
  const thumbW = Math.max(22, Math.round(THUMB_H * aspect));
  const slots = trackW > 0 ? Math.max(1, Math.min(pageCount, Math.floor((trackW + GAP) / (thumbW + GAP)))) : 0;
  const sampled = Array.from({ length: slots }, (_, i) => (slots === 1 ? 0 : Math.round((i * (pageCount - 1)) / (slots - 1))));
  const span = Math.max(1, trackW - thumbW);

  const x = useSharedValue(0);
  const active = useSharedValue(0);
  const geo = useSharedValue({ span, thumbW, count: pageCount });
  useEffect(() => {
    geo.value = { span, thumbW, count: pageCount };
  }, [geo, span, thumbW, pageCount]);

  // Follow the reader's page when not dragging.
  useEffect(() => {
    if (active.value) return;
    const target = pageCount > 1 ? (page / (pageCount - 1)) * span : 0;
    x.value = reduceMotion ? target : withTiming(target, { duration: motion.duration.fast });
  }, [page, pageCount, span, x, active, reduceMotion]);

  const pageAt = (px: number) => {
    'worklet';
    const g = geo.value;
    const clamped = Math.min(g.span, Math.max(0, px - g.thumbW / 2));
    return { px: clamped, page: g.count > 1 ? Math.round((clamped / g.span) * (g.count - 1)) : 0 };
  };

  const onPreview = useCallback((p: number) => {
    setPreview(p);
    if (p !== lastTick.current) {
      if (lastTick.current !== -1) haptic('tick');
      lastTick.current = p;
    }
  }, []);

  const onStart = useCallback(() => {
    lastTick.current = -1;
    onScrubbingChange(true);
  }, [onScrubbingChange]);

  const onEnd = useCallback(
    (p: number | null) => {
      setPreview(null);
      lastTick.current = -1;
      onScrubbingChange(false);
      if (p !== null) onSeek(p);
    },
    [onScrubbingChange, onSeek],
  );

  const pan = usePanGesture({
    minDistance: 2,
    onActivate: e => {
      'worklet';
      active.value = 1;
      const r = pageAt(e.x);
      x.value = r.px;
      scheduleOnRN(onStart);
      scheduleOnRN(onPreview, r.page);
    },
    onUpdate: e => {
      'worklet';
      const r = pageAt(e.x);
      x.value = r.px;
      scheduleOnRN(onPreview, r.page);
    },
    onDeactivate: e => {
      'worklet';
      const r = pageAt(e.x);
      active.value = 0;
      // Snap the window onto the exact page position.
      const g = geo.value;
      x.value = withTiming(g.count > 1 ? (r.page / (g.count - 1)) * g.span : 0, { duration: motion.duration.fast });
      scheduleOnRN(onEnd, r.page);
    },
  });

  const tap = useTapGesture({
    onActivate: e => {
      'worklet';
      const r = pageAt(e.x);
      scheduleOnRN(onSeek, r.page);
    },
  });

  const gesture = useSimultaneousGestures(pan, tap);

  const windowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(Math.max(x.value + geo.value.thumbW / 2 - BUBBLE_W / 2, -space.sm), geo.value.span + geo.value.thumbW - BUBBLE_W + space.sm) }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setTrackW(Math.floor(e.nativeEvent.layout.width));
  const bubbleH = Math.round(BUBBLE_W / aspect);

  return (
    <View style={styles.root}>
      <Text variant="numeric" style={styles.label} accessibilityLabel={t('reader.pageOf', { page: label, count: pageCount })}>
        {label}
        <Text variant="numeric" color="textTertiary">{` / ${pageCount}`}</Text>
      </Text>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.track}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('reader.scrubber')}
          accessibilityValue={{ min: 1, max: pageCount, now: page + 1 }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => onSeek(Math.min(pageCount - 1, Math.max(0, page + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        >
          <View style={[styles.thumbs, { gap: slots > 1 ? (trackW - slots * thumbW) / (slots - 1) : 0 }]}>
            {sampled.map((p, i) => (
              <View key={i} style={[styles.thumb, { width: thumbW, backgroundColor: '#FFFFFF', borderColor: colors.borderSubtle }]}>
                <ScorePage docId={docId} inkKey={inkKey} page={p} thumbnail prefetchRadius={0} filter={filter} style={StyleSheet.absoluteFill} />
              </View>
            ))}
          </View>
          {slots > 0 && (
            <Animated.View pointerEvents="none" style={[styles.window, { width: thumbW + 6, borderColor: colors.accent }, windowStyle]} />
          )}
          {preview !== null && (
            <Animated.View
              pointerEvents="none"
              style={[styles.bubble, elevation.high, { width: BUBBLE_W, height: bubbleH + 30, bottom: THUMB_H + space.md, backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle }, bubbleStyle]}
            >
              <View style={[styles.bubblePage, { height: bubbleH }]}>
                <ScorePage docId={docId} inkKey={inkKey} page={preview} thumbnail prefetchRadius={0} filter={filter} style={StyleSheet.absoluteFill} />
              </View>
              <Text variant="numeric" style={styles.bubbleLabel}>
                {preview + 1}
              </Text>
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  label: { minWidth: 64, textAlign: 'center' },
  track: { flex: 1, height: THUMB_H + 12, justifyContent: 'center' },
  thumbs: { flexDirection: 'row', height: THUMB_H },
  thumb: { height: THUMB_H, borderRadius: 3, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  window: { position: 'absolute', left: -3, height: THUMB_H + 8, top: 2, borderWidth: 2, borderRadius: 5 },
  bubble: { position: 'absolute', left: 0, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 6, alignItems: 'center' },
  bubblePage: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 3, overflow: 'hidden' },
  bubbleLabel: { marginTop: 4 },
});
