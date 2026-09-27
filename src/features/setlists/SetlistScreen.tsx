import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import NativeAppSystem from '@/specs/NativeAppSystem';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import { restoreScores } from '@/data/repos/scores';
import {
  addToSetlist,
  deleteSetlist,
  duplicateSetlist,
  getSetlist,
  listItems,
  moveItem,
  removeItems,
  restoreItems,
  restoreSetlist,
  updateItem,
  updateSetlist,
  type SetlistItem,
} from '@/data/repos/setlists';
import { haptic } from '@/platform/haptics';
import { Button, EmptyState, IconButton, Menu, Sheet, SortableList, Surface, Text, TextField, type Anchor, type MenuItem } from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { EmptySetlistsArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';
import { radius, space, useTheme } from '@/ui/theme';
import { AddSongsSheet } from './AddSongsSheet';
import { SetlistNameDialog, useEventDateLabel } from './SetlistParts';
import { playSetlist } from './SetlistsScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewRef = React.ComponentRef<typeof View>;

const ROW = 76;

export function SetlistScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Setlist'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const id = params.setlistId;
  const setlist = useLiveQuery(['setlists'], () => getSetlist(id), [id]);
  const items = useLiveQuery(['setlists', 'setlist_items', 'scores'], () => listItems(id), [id]);
  const dateLabel = useEventDateLabel()(setlist?.eventDate ?? null);

  const [adding, setAdding] = useState(!!params.addSongs);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState<{ anchor: Anchor; items: MenuItem[] } | null>(null);
  const [editing, setEditing] = useState<SetlistItem | null>(null);
  const moreRef = useRef<ViewRef>(null);

  // Notes: local while typing, saved shortly after.
  const [notes, setNotes] = useState(setlist?.notes ?? '');
  const notesLoaded = useRef(false);
  useEffect(() => {
    if (setlist && !notesLoaded.current) {
      notesLoaded.current = true;
      setNotes(setlist.notes ?? '');
    }
  }, [setlist]);
  useEffect(() => {
    if (!notesLoaded.current || (setlist?.notes ?? '') === notes) return;
    const timer = setTimeout(() => updateSetlist(id, { notes: notes.trim() ? notes : null }), 500);
    return () => clearTimeout(timer);
  }, [notes, id, setlist?.notes]);

  const onMove = useCallback(
    (from: number, to: number) => {
      const item = items[from];
      if (item) moveItem(id, item.id, to);
    },
    [id, items],
  );

  if (!setlist) {
    return (
      <Screen title={t('nav.setlists')} onBack={() => nav.goBack()}>
        <View />
      </Screen>
    );
  }

  const pickDate = async () => {
    const picked = await NativeAppSystem.pickDate(setlist.eventDate ?? '', setlist.eventDate ? t('setlists.noDate') : '');
    if (picked !== null) updateSetlist(id, { eventDate: picked || null });
  };

  const removeSong = (item: SetlistItem) => {
    const rows = removeItems([item.id]);
    showSnackbar({ message: t('setlists.removed', { title: item.score.title }), action: { label: t('common.undo'), onPress: () => restoreItems(rows) } });
  };

  const openMore = () =>
    moreRef.current?.measureInWindow((x, y, width, height) =>
      setMenu({
        anchor: { x, y, width, height },
        items: [
          { key: 'rename', label: t('setlists.rename'), icon: 'pencil-simple', onPress: () => setRenaming(true) },
          {
            key: 'duplicate',
            label: t('setlists.duplicate'),
            icon: 'copy',
            onPress: () => {
              const name = t('setlists.duplicateName', { name: setlist.name });
              const copy = duplicateSetlist(id, name);
              if (copy) {
                showToast({ message: t('setlists.duplicated', { name }), icon: 'copy' });
                nav.replace('Setlist', { setlistId: copy });
              }
            },
          },
          {
            key: 'delete',
            label: t('setlists.delete'),
            icon: 'trash',
            destructive: true,
            dividerBefore: true,
            onPress: () => {
              const snap = deleteSetlist(id);
              nav.goBack();
              if (snap) showSnackbar({ message: t('setlists.deleted', { name: setlist.name }), action: { label: t('common.undo'), onPress: () => restoreSetlist(snap) } });
            },
          },
        ],
      }),
    );

  const playable = items.some(i => !i.score.deleted);
  const actions = (
    <>
      <IconButton icon="pencil-simple" label={t('setlists.rename')} onPress={() => setRenaming(true)} />
      <View ref={moreRef} collapsable={false}>
        <IconButton icon="dots-three-vertical" label={t('common.moreOptions')} onPress={openMore} />
      </View>
    </>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.metaRow}>
        <Surface
          onPress={pickDate}
          accessibilityRole="button"
          accessibilityLabel={`${t('setlists.eventDate')}: ${dateLabel ?? t('setlists.noDate')}`}
          style={[styles.dateChip, { borderColor: colors.borderStrong }]}
        >
          <Icon name="calendar-blank" size={18} color="textSecondary" />
          <Text variant="label" color={dateLabel ? 'textPrimary' : 'textSecondary'}>
            {dateLabel ?? t('setlists.setDate')}
          </Text>
        </Surface>
        <Text variant="label" color="textSecondary" style={styles.flex}>
          {t('setlists.songs', { count: items.length })}
        </Text>
        <Button label={t('setlists.play')} icon="play" disabled={!playable} onPress={() => playSetlist(nav, id)} />
      </View>
      <TextField label={t('setlists.notes')} value={notes} onChangeText={setNotes} placeholder={t('setlists.notesPlaceholder')} multiline />
    </View>
  );

  const footer = (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space.xxxl }]}>
      {items.length === 0 && <EmptyState art={<EmptySetlistsArt />} title={t('setlists.emptyList')} body={t('setlists.emptyListBody')} />}
      <View style={styles.footerRow}>
        <Button label={t('setlists.addSongs')} icon="plus" variant={items.length ? 'secondary' : 'primary'} onPress={() => setAdding(true)} />
      </View>
    </View>
  );

  return (
    <>
      <Screen title={setlist.name} onBack={() => nav.goBack()} actions={actions} scroll={false}>
        <SortableList
          data={items}
          keyOf={keyOf}
          rowHeight={ROW}
          onMove={onMove}
          labelOf={i => i.score.title}
          header={header}
          footer={footer}
          renderRow={(item, index, dragging) => (
            <SongRow
              item={item}
              index={index}
              dragging={dragging}
              onPlay={() => playSetlist(nav, id, index)}
              onRestore={() => restoreScores([item.scoreId])}
              onMore={anchor =>
                setMenu({
                  anchor,
                  items: [
                    { key: 'settings', label: t('setlists.entryTitle'), icon: 'sliders-horizontal', onPress: () => setEditing(item) },
                    { key: 'remove', label: t('setlists.removeSong'), icon: 'x', destructive: true, onPress: () => removeSong(item) },
                  ],
                })
              }
            />
          )}
        />
      </Screen>

      <Menu visible={menu !== null} anchor={menu?.anchor ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <AddSongsSheet
        visible={adding}
        alreadyIn={new Set(items.map(i => i.scoreId))}
        onAdd={ids => {
          addToSetlist(id, ids);
          haptic('confirm');
          showToast({ message: t('setlists.added', { count: ids.length, name: setlist.name }), icon: 'playlist' });
        }}
        onClose={() => setAdding(false)}
      />
      <EntrySheet item={editing} onClose={() => setEditing(null)} />
      <SetlistNameDialog
        visible={renaming}
        title={t('setlists.rename')}
        confirmLabel={t('common.save')}
        initialName={setlist.name}
        initialDate={setlist.eventDate}
        withDate={false}
        onSubmit={name => {
          updateSetlist(id, { name });
          setRenaming(false);
        }}
        onCancel={() => setRenaming(false)}
      />
    </>
  );
}

const keyOf = (i: SetlistItem) => i.id;

function SongRow({
  item,
  index,
  dragging,
  onPlay,
  onRestore,
  onMore,
}: {
  item: SetlistItem;
  index: number;
  dragging: boolean;
  onPlay: () => void;
  onRestore: () => void;
  onMore: (a: Anchor) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const moreRef = useRef<ViewRef>(null);
  const missing = item.score.deleted;
  const sub = missing ? t('setlists.missing') : [item.score.composer, item.notes].filter(Boolean).join(' · ');
  return (
    <Surface
      onPress={missing ? undefined : onPlay}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${item.score.title}${sub ? `, ${sub}` : ''}`}
      accessibilityHint={missing ? undefined : t('setlists.playFrom')}
      style={[
        styles.row,
        { backgroundColor: dragging ? colors.surfaceRaised : colors.surface, borderColor: dragging ? colors.accent : colors.borderSubtle },
      ]}
    >
      <Icon name="dots-six-vertical" size={18} color="textTertiary" />
      <Text variant="numeric" color="textTertiary" style={styles.num}>
        {index + 1}
      </Text>
      <View style={[styles.cover, { borderColor: colors.borderSubtle, opacity: missing ? 0.4 : 1 }]}>
        {item.score.coverPath ? <Image source={{ uri: item.score.coverPath }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1} color={missing ? 'textTertiary' : 'textPrimary'}>
          {item.score.title}
        </Text>
        {sub ? (
          <Text variant="caption" numberOfLines={1} color={missing ? 'danger' : 'textSecondary'}>
            {sub}
          </Text>
        ) : null}
      </View>
      {missing ? (
        <Button label={t('setlists.restore')} variant="ghost" onPress={onRestore} />
      ) : item.startPage > 0 ? (
        <View style={[styles.pageChip, { backgroundColor: colors.surfaceSunken }]}>
          <Text variant="labelSmall" color="textSecondary">
            {t('setlists.startPageValue', { page: item.startPage + 1 })}
          </Text>
        </View>
      ) : null}
      <View ref={moreRef} collapsable={false}>
        <IconButton
          icon="dots-three-vertical"
          size="sm"
          label={t('common.moreOptions')}
          onPress={() => moreRef.current?.measureInWindow((x, y, width, height) => onMore({ x, y, width, height }))}
        />
      </View>
    </Surface>
  );
}

/** Per-entry start page and notes. */
function EntrySheet({ item, onClose }: { item: SetlistItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (item) {
      setPage(item.startPage);
      setNotes(item.notes ?? '');
    }
  }, [item]);
  const count = Math.max(1, item?.score.pageCount ?? 1);
  const step = (d: number) => {
    haptic('tick');
    setPage(p => Math.min(count - 1, Math.max(0, p + d)));
  };
  return (
    <Sheet visible={item !== null} onClose={onClose} title={item?.score.title}>
      <View style={styles.entry}>
        <Text variant="label" color="textSecondary">
          {t('setlists.startPage')}
        </Text>
        <View style={styles.stepper}>
          <IconButton icon="minus" label={t('setlists.earlierPage')} variant="tonal" disabled={page <= 0} onPress={() => step(-1)} />
          <Text variant="titleM" style={styles.pageValue} accessibilityLiveRegion="polite">
            {t('setlists.pageOf', { page: page + 1, count })}
          </Text>
          <IconButton icon="plus" label={t('setlists.laterPage')} variant="tonal" disabled={page >= count - 1} onPress={() => step(1)} />
        </View>
        <TextField label={t('setlists.notes')} value={notes} onChangeText={setNotes} placeholder={t('setlists.entryNotesPlaceholder')} multiline />
        <View style={styles.entryActions}>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          <Button
            label={t('common.save')}
            onPress={() => {
              if (item) updateItem(item.id, { startPage: page, notes: notes.trim() ? notes : null });
              onClose();
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.lg, paddingBottom: space.lg },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 40, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 },
  footer: { gap: space.lg, alignItems: 'center', paddingTop: space.lg },
  footerRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center' },
  row: {
    height: ROW - space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  num: { width: 22, textAlign: 'right' },
  cover: { width: 40, height: 50, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1 },
  pageChip: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  entry: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  pageValue: { minWidth: 120, textAlign: 'center' },
  entryActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
