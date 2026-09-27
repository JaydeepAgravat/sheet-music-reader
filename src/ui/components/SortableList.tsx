import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { haptic } from '@/platform/haptics';
import { motion } from '@/ui/theme';

type Props<T> = {
  data: readonly T[];
  keyOf: (item: T) => string;
  /** Every row has this exact height (keeps drag math exact and cheap). */
  rowHeight: number;
  renderRow: (item: T, index: number, dragging: boolean) => React.ReactNode;
  /** Commit a reorder (called once, on drop). */
  onMove: (from: number, to: number) => void;
  /** TalkBack label of a row, used for the move actions' announcements. */
  labelOf: (item: T) => string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

const EDGE = 72;
const AUTOSCROLL_STEP = 10;

/**
 * Vertical list whose rows reorder by long-press + drag. Other rows glide out of the way, each
 * slot crossed ticks, the drop settles with a spring, and the list auto-scrolls near its edges.
 * TalkBack users get "Move up / Move down" actions instead of dragging.
 */
export function SortableList<T>({ data, keyOf, rowHeight, renderRow, onMove, labelOf, header, footer, contentContainerStyle }: Props<T>) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);
  const positions = useSharedValue<Record<string, number>>({});
  const viewport = useSharedValue(0);
  const listTop = useSharedValue(0);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    positions.value = Object.fromEntries(data.map((d, i) => [keyOf(d), i]));
  }, [data, keyOf, positions]);

  return (
    <Animated.ScrollView
      ref={scrollRef}
      scrollEnabled={dragging === null}
      onLayout={(e: LayoutChangeEvent) => {
        viewport.value = e.nativeEvent.layout.height;
      }}
      contentContainerStyle={contentContainerStyle}
    >
      {header}
      <View
        style={{ height: data.length * rowHeight }}
        onLayout={e => {
          listTop.value = e.nativeEvent.layout.y;
        }}
      >
        {data.map((item, index) => {
          const key = keyOf(item);
          return (
            <SortableRow
              key={key}
              id={key}
              index={index}
              count={data.length}
              rowHeight={rowHeight}
              positions={positions}
              scrollY={scrollY}
              viewport={viewport}
              listTop={listTop}
              scrollRef={scrollRef}
              label={labelOf(item)}
              onDragChange={d => setDragging(d ? key : null)}
              onMove={onMove}
            >
              {renderRow(item, index, dragging === key)}
            </SortableRow>
          );
        })}
      </View>
      {footer}
    </Animated.ScrollView>
  );
}

type RowProps = {
  id: string;
  index: number;
  count: number;
  rowHeight: number;
  positions: SharedValue<Record<string, number>>;
  scrollY: SharedValue<number>;
  viewport: SharedValue<number>;
  listTop: SharedValue<number>;
  scrollRef: ReturnType<typeof useAnimatedRef<Animated.ScrollView>>;
  label: string;
  onDragChange: (dragging: boolean) => void;
  onMove: (from: number, to: number) => void;
  children: React.ReactNode;
};

function SortableRow({ id, index, count, rowHeight, positions, scrollY, viewport, listTop, scrollRef, label, onDragChange, onMove, children }: RowProps) {
  const { t } = useTranslation();
  const top = useSharedValue(index * rowHeight);
  const active = useSharedValue(false);
  const start = useSharedValue({ top: 0, scroll: 0, from: 0 });

  // Follow the slot this row owns (unless it is the one being dragged).
  useAnimatedReaction(
    () => positions.value[id],
    slot => {
      if (slot === undefined || active.value) return;
      top.value = withSpring(slot * rowHeight, motion.springSnappy);
    },
  );

  const pan = usePanGesture({
    activateAfterLongPress: 220,
    onActivate: () => {
      'worklet';
      active.value = true;
      const from = positions.value[id] ?? index;
      start.value = { top: top.value, scroll: scrollY.value, from };
      scheduleOnRN(onDragChange, true);
      scheduleOnRN(haptic, 'dragStart');
    },
    onUpdate: e => {
      'worklet';
      const maxTop = (count - 1) * rowHeight;
      const y = start.value.top + e.translationY + (scrollY.value - start.value.scroll);
      top.value = Math.min(maxTop, Math.max(0, y));
      const slot = Math.min(count - 1, Math.max(0, Math.round(top.value / rowHeight)));
      const cur = positions.value[id];
      if (cur !== undefined && slot !== cur) {
        const next: Record<string, number> = {};
        for (const k in positions.value) {
          const p = positions.value[k]!;
          if (k === id) next[k] = slot;
          else if (cur < slot && p > cur && p <= slot) next[k] = p - 1;
          else if (cur > slot && p >= slot && p < cur) next[k] = p + 1;
          else next[k] = p;
        }
        positions.value = next;
        scheduleOnRN(haptic, 'tick');
      }
      // Auto-scroll when the dragged row nears the top/bottom edge.
      const onScreen = listTop.value + top.value - scrollY.value;
      if (onScreen + rowHeight > viewport.value - EDGE) scrollTo(scrollRef, 0, scrollY.value + AUTOSCROLL_STEP, false);
      else if (onScreen < EDGE && scrollY.value > 0) scrollTo(scrollRef, 0, Math.max(0, scrollY.value - AUTOSCROLL_STEP), false);
    },
    onFinalize: () => {
      'worklet';
      if (!active.value) return;
      active.value = false;
      const slot = positions.value[id] ?? start.value.from;
      top.value = withSpring(slot * rowHeight, motion.springSnappy);
      scheduleOnRN(onDragChange, false);
      scheduleOnRN(haptic, 'drop');
      if (slot !== start.value.from) scheduleOnRN(onMove, start.value.from, slot);
    },
  });

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: active.value ? 10 : 0,
    transform: [{ scale: withSpring(active.value ? 1.02 : 1, motion.springSnappy) }],
    shadowOpacity: active.value ? 0.25 : 0,
    elevation: active.value ? 8 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.row, { height: rowHeight }, style]}
        accessibilityActions={[
          ...(index > 0 ? [{ name: 'moveUp', label: t('common.moveUp') }] : []),
          ...(index < count - 1 ? [{ name: 'moveDown', label: t('common.moveDown') }] : []),
        ]}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'moveUp' && index > 0) onMove(index, index - 1);
          if (e.nativeEvent.actionName === 'moveDown' && index < count - 1) onMove(index, index + 1);
        }}
        accessibilityHint={t('common.reorderHint')}
        accessibilityLabel={label}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, shadowColor: '#000' },
});
