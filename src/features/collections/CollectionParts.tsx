import React, { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { deleteCollection, restoreCollection, type Collection } from '@/data/repos/collections';
import { haptic } from '@/platform/haptics';
import { Dialog, IconButton, Surface, Text, TextField, type Anchor } from '@/ui/components';
import { showSnackbar } from '@/ui/feedback/store';
import type { IconName } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

export type CollectionWithCovers = Collection & { covers: string[] };

const PAPER = '#FFFEFB'; // Same paper as ScoreCard covers: scores are always shown on white-ish paper.

/** Measures a view in window coordinates for Menu anchoring. */
export function measureAnchor(ref: React.RefObject<React.ComponentRef<typeof View> | null>, then: (a: Anchor) => void): void {
  ref.current?.measureInWindow((x, y, width, height) => then({ x, y, width, height }));
}

/** Icon button that reports its own window rect (to drop a Menu from it). */
export function AnchorIconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: (a: Anchor) => void }) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon={icon} label={label} onPress={() => measureAnchor(ref, onPress)} />
    </View>
  );
}

/**
 * Collection artwork: up to three covers fanned like sheets on a stand, front-most = first added.
 * Scores without a cover image show as blank paper; an empty collection shows a folder.
 */
export function StackedCovers({ covers, count }: { covers: readonly string[]; count: number }) {
  const { colors } = useTheme();
  const sheets = Math.min(3, Math.max(count, covers.length));
  if (sheets === 0) return <FolderArt />;
  // Back to front: the first cover is drawn last so it sits on top.
  const layers = Array.from({ length: sheets }, (_, i) => sheets - 1 - i);
  return (
    <View style={styles.art} accessible={false} importantForAccessibility="no-hide-descendants">
      {layers.map(i => (
        <View
          key={i}
          style={[
            styles.sheet,
            FAN[sheets - 1]?.[i],
            { backgroundColor: PAPER, borderColor: colors.borderSubtle },
            i === 0 && styles.sheetFront,
          ]}
        >
          {covers[i] ? <Image source={{ uri: covers[i] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <BlankStaves />}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.coverDim }]} />
        </View>
      ))}
    </View>
  );
}

// Per stack size, per layer (0 = front): offset + tilt. Small angles read as "a pile", not "a mess".
const FAN: Record<number, object[]> = {
  0: [{}],
  1: [{ transform: [{ translateX: -10 }, { rotate: '-3deg' }] }, { transform: [{ translateX: 14 }, { translateY: -4 }, { rotate: '6deg' }] }],
  2: [
    { transform: [{ rotate: '-2deg' }] },
    { transform: [{ translateX: 18 }, { translateY: -4 }, { rotate: '7deg' }] },
    { transform: [{ translateX: -18 }, { translateY: -2 }, { rotate: '-9deg' }] },
  ],
};

function BlankStaves() {
  const staff = (y: number) => `M14 ${y}h72M14 ${y + 3}h72M14 ${y + 6}h72M14 ${y + 9}h72M14 ${y + 12}h72`;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 125" preserveAspectRatio="xMidYMin slice">
      <Rect x="32" y="12" width="36" height="4" rx="2" fill="#2A2926" opacity={0.8} />
      <Path d={`${staff(32)} ${staff(56)} ${staff(80)}`} stroke="#2A2926" strokeWidth={0.6} opacity={0.55} />
    </Svg>
  );
}

/** Empty collection: an open folder waiting for sheets. Theme tokens only. */
function FolderArt() {
  const { colors } = useTheme();
  return (
    <View style={styles.art} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="70%" height="70%" viewBox="0 0 120 96">
        <Path
          d="M14 20a6 6 0 0 1 6-6h24l8 9h48a6 6 0 0 1 6 6v53a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V20Z"
          fill={colors.surfaceSunken}
          stroke={colors.borderStrong}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <Rect x="30" y="18" width="52" height="40" rx="3" fill={colors.surface} stroke={colors.borderStrong} strokeWidth={2} transform="rotate(-5 56 38)" />
        <Path d="M38 30h36M38 35h36M38 40h36" stroke={colors.textTertiary} strokeWidth={1.2} strokeLinecap="round" transform="rotate(-5 56 38)" />
        <Path
          d="M18 44h86a5 5 0 0 1 5 5.6l-4 30.8A6 6 0 0 1 99 86H21a6 6 0 0 1-6-5.4l-2-30A5 5 0 0 1 18 44Z"
          fill={colors.surfaceRaised}
          stroke={colors.borderStrong}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/** Grid tile: stacked covers, serif name, "N scores", overflow menu. Long-press opens the same menu. */
export const CollectionTile = memo(function CollectionTileImpl({
  collection,
  onOpen,
  onMenu,
  onRename,
  onDelete,
}: {
  collection: CollectionWithCovers;
  onOpen: (c: CollectionWithCovers) => void;
  onMenu: (c: CollectionWithCovers, anchor: Anchor) => void;
  /** TalkBack custom actions (the menu's items without the menu). */
  onRename: (c: CollectionWithCovers) => void;
  onDelete: (c: CollectionWithCovers) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const moreRef = useRef<React.ComponentRef<typeof View>>(null);
  const count = t('collections.scores', { count: collection.count });
  return (
    <View ref={ref} collapsable={false} style={styles.tile}>
      <Surface
        onPress={() => onOpen(collection)}
        onLongPress={() => {
          haptic('longPress');
          measureAnchor(ref, a => onMenu(collection, a));
        }}
        accessibilityRole="button"
        accessibilityLabel={`${collection.name}, ${count}`}
        accessibilityHint={t('collections.openHint')}
        accessibilityActions={[
          { name: 'rename', label: t('common.rename') },
          { name: 'delete', label: t('common.delete') },
        ]}
        onAccessibilityAction={e => (e.nativeEvent.actionName === 'rename' ? onRename(collection) : e.nativeEvent.actionName === 'delete' ? onDelete(collection) : undefined)}
        style={[styles.tileBody, { borderColor: colors.borderSubtle, backgroundColor: colors.surface }]}
      >
        <View style={[styles.artWell, { backgroundColor: colors.surfaceSunken }]}>
          <StackedCovers covers={collection.covers} count={collection.count} />
        </View>
        <View style={styles.tileMeta}>
          <Text variant="titleS" numberOfLines={2}>
            {collection.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {count}
          </Text>
        </View>
      </Surface>
      <View ref={moreRef} collapsable={false} style={styles.more}>
        <IconButton
          icon="dots-three-vertical"
          size="sm"
          label={t('collections.optionsFor', { name: collection.name })}
          onPress={() => measureAnchor(moreRef, a => onMenu(collection, a))}
        />
      </View>
    </View>
  );
});

/**
 * Name dialog for create and rename. Trims, rejects blanks and (case-insensitive) duplicates inline —
 * a toast would sit behind the dialog's modal.
 */
export function CollectionNameDialog({
  visible,
  title,
  confirmLabel,
  initial = '',
  taken,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  initial?: string;
  /** Existing names that would clash (exclude the collection being renamed). */
  taken: readonly string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (visible) {
      setName(initial);
      setError(undefined);
    }
  }, [visible, initial]);

  const submit = () => {
    const n = name.trim();
    if (!n) return setError(t('collections.nameRequired'));
    if (taken.some(x => x.toLocaleLowerCase() === n.toLocaleLowerCase())) {
      haptic('reject');
      return setError(t('collections.nameTaken', { name: n }));
    }
    onSubmit(n);
  };

  return (
    <Dialog visible={visible} title={title} confirm={{ label: confirmLabel, onPress: submit }} cancel={{ label: t('common.cancel'), onPress: onCancel }}>
      <TextField
        label={t('collections.name')}
        value={name}
        onChangeText={v => {
          setName(v);
          if (error) setError(undefined);
        }}
        error={error}
        autoFocus
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={submit}
        selectTextOnFocus={initial.length > 0}
      />
    </Dialog>
  );
}

/** Deletes immediately; the snackbar's Undo brings it back with its members. Scores are never touched. */
export function deleteWithUndo(c: Pick<Collection, 'id' | 'name'>, t: TFunction): void {
  const snap = deleteCollection(c.id);
  if (!snap) return;
  haptic('confirm');
  showSnackbar({
    message: t('collections.deleted', { name: c.name }),
    action: { label: t('common.undo'), onPress: () => restoreCollection(snap) },
  });
}

const styles = StyleSheet.create({
  tile: { flex: 1, padding: space.xs },
  tileBody: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  artWell: { aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', height: '72%', aspectRatio: 0.78, borderRadius: radius.sm - 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, elevation: 1, shadowColor: '#000' },
  sheetFront: { elevation: 3 },
  tileMeta: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, paddingRight: 44, gap: 2, minHeight: 72 },
  more: { position: 'absolute', right: space.xs, bottom: space.xs + 6 },
});
