import React, { memo, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '@/data/db/live';
import { addToCollection, removeFromCollection } from '@/data/repos/collections';
import { listScores, type Score } from '@/data/repos/scores';
import { searchLibrary } from '@/data/repos/search';
import { haptic } from '@/platform/haptics';
import { Button, SearchBar, Sheet, Surface, Text } from '@/ui/components';
import { showSnackbar } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { minTouch, radius, space, useTheme } from '@/ui/theme';
import { HighlightText } from '@/features/library/HighlightText';

type Props = {
  visible: boolean;
  collectionId: string;
  collectionName: string;
  onClose: () => void;
};

/** Search the library and tick scores to add. Scores already in the collection show as ticked and locked. */
export function AddScoresSheet({ visible, collectionId, collectionName, onClose }: Props) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setQuery('');
      setPicked(new Set());
    }
  }, [visible]);

  const q = query.trim();
  const members = useLiveQuery(['scores', 'collections'], () => (visible ? new Set(listScores('title', { collectionId }).map(s => s.id)) : new Set<string>()), [visible, collectionId]);
  const scores = useLiveQuery(
    ['scores', 'tags', 'collections'],
    () => {
      if (!visible) return [];
      if (!q) return listScores('title');
      const ids = searchLibrary(q).scoreIds;
      const rank = new Map(ids.map((id, i) => [id, i]));
      return listScores('title', { ids }).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    },
    [visible, q],
  );

  const toggle = (s: Score) => {
    if (members.has(s.id)) return;
    haptic('tick');
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
  };

  const add = () => {
    const ids = [...picked];
    if (!ids.length) return;
    addToCollection(collectionId, ids);
    haptic('confirm');
    onClose();
    showSnackbar({
      message: t('library.addedToCollection', { count: ids.length, name: collectionName }),
      action: { label: t('common.undo'), onPress: () => removeFromCollection(collectionId, ids) },
    });
  };

  const extra = useMemo(() => ({ picked, members, q }), [picked, members, q]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('collections.addTitle', { name: collectionName })}>
      <View style={styles.body}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={t('collections.addSearch')} />
        <View style={[styles.list, { height: Math.min(height * 0.5, 520) }]}>
          <FlashList
            data={scores}
            keyExtractor={s => s.id}
            extraData={extra}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text variant="body" color="textSecondary" align="center" style={styles.empty}>
                {q ? t('search.noResultsTitle', { query: q }) : t('collections.libraryEmpty')}
              </Text>
            }
            renderItem={({ item }) => (
              <PickRow score={item} query={q} member={members.has(item.id)} picked={picked.has(item.id)} onPress={toggle} />
            )}
          />
        </View>
        <View style={styles.footer}>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          <Button
            label={picked.size ? t('collections.addCount', { count: picked.size }) : t('collections.addScores')}
            icon="plus"
            disabled={picked.size === 0}
            onPress={add}
          />
        </View>
      </View>
    </Sheet>
  );
}

const PickRow = memo(function PickRowImpl({
  score,
  query,
  member,
  picked,
  onPress,
}: {
  score: Score;
  query: string;
  member: boolean;
  picked: boolean;
  onPress: (s: Score) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const checked = member || picked;
  return (
    <Surface
      onPress={() => onPress(score)}
      disabled={member}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: member }}
      accessibilityLabel={[score.title, score.composer, member ? t('collections.alreadyIn') : null].filter(Boolean).join(', ')}
      style={[styles.row, picked && { backgroundColor: colors.accentContainer }]}
    >
      <View style={[styles.thumb, { borderColor: colors.borderSubtle }]}>
        {score.coverPath ? <Image source={{ uri: score.coverPath }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.coverDim }]} />
      </View>
      <View style={styles.rowText}>
        <HighlightText text={score.title} query={query} variant="titleS" numberOfLines={1} />
        {member ? (
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            {t('collections.alreadyIn')}
          </Text>
        ) : score.composer ? (
          <HighlightText text={score.composer} query={query} variant="caption" color="textSecondary" numberOfLines={1} />
        ) : null}
      </View>
      <View
        style={[
          styles.box,
          checked ? { backgroundColor: member ? colors.textTertiary : colors.accent, borderColor: 'transparent' } : { borderColor: colors.borderStrong },
        ]}
      >
        {checked && <Icon name="check" size={16} color="onAccent" />}
      </View>
    </Surface>
  );
});

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md },
  list: { marginHorizontal: -space.sm },
  empty: { paddingVertical: space.xxl, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: minTouch + 16, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md },
  thumb: { width: 36, height: 45, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth * 2 },
  rowText: { flex: 1, gap: 2 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
