import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { listScores, type Score } from '@/data/repos/scores';
import { searchLibrary } from '@/data/repos/search';
import { haptic } from '@/platform/haptics';
import { Button, SearchBar, Sheet, Surface, Text } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

const ROW = 64;

/**
 * Pick songs for a setlist: search the library, tap to select (in tap order — that becomes the
 * setlist order), then add them all at once.
 */
export function AddSongsSheet({
  visible,
  alreadyIn,
  onAdd,
  onClose,
}: {
  visible: boolean;
  /** Score ids already in the setlist (marked, still addable for reprises). */
  alreadyIn: ReadonlySet<string>;
  onAdd: (scoreIds: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const win = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setPicked([]);
    }
  }, [visible]);

  const results = useMemo<Score[]>(() => {
    if (!visible) return [];
    const q = query.trim();
    if (!q) return listScores('recent');
    const ids = searchLibrary(q).scoreIds;
    const rank = new Map(ids.map((id, i) => [id, i]));
    return listScores('title', { ids }).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [query, visible]);

  const toggle = (id: string) => {
    haptic('tick');
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('setlists.addSongs')}>
      <View style={[styles.body, { height: Math.min(640, win.height * 0.72) }]}>
        <View style={styles.search}>
          <SearchBar value={query} onChangeText={setQuery} placeholder={t('setlists.searchPlaceholder')} />
        </View>
        {results.length === 0 && query.trim() ? (
          <Text variant="body" color="textSecondary" align="center" style={styles.none}>
            {t('setlists.noMatches', { query: query.trim() })}
          </Text>
        ) : (
          <FlashList
            data={results}
            keyExtractor={s => s.id}
            extraData={picked}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <SongRow score={item} order={picked.indexOf(item.id)} inSetlist={alreadyIn.has(item.id)} onPress={() => toggle(item.id)} />
            )}
          />
        )}
        <View style={styles.footer}>
          <Button
            label={picked.length ? t('setlists.addCount', { count: picked.length }) : t('setlists.addSongs')}
            icon="plus"
            disabled={!picked.length}
            onPress={() => {
              onAdd(picked);
              onClose();
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}

function SongRow({ score, order, inSetlist, onPress }: { score: Score; order: number; inSetlist: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const selected = order >= 0;
  const sub = inSetlist ? t('setlists.alreadyIn') : score.composer;
  return (
    <Surface
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[score.title, sub].filter(Boolean).join(', ')}
      style={[styles.row, selected && { backgroundColor: colors.accentContainer }]}
    >
      <View style={[styles.cover, { borderColor: colors.borderSubtle }]}>
        {score.coverPath ? <Image source={{ uri: score.coverPath }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1} color={selected ? 'onAccentContainer' : 'textPrimary'}>
          {score.title}
        </Text>
        {sub ? (
          <Text variant="caption" numberOfLines={1} color={selected ? 'onAccentContainer' : inSetlist ? 'accent' : 'textSecondary'}>
            {sub}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text variant="labelSmall" style={{ color: colors.onAccent }}>
            {order + 1}
          </Text>
        </View>
      ) : (
        <Icon name="plus" size={20} color="textTertiary" />
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.md },
  search: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  none: { marginTop: space.xl, paddingHorizontal: space.xl },
  row: { height: ROW - 4, marginVertical: 2, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, marginHorizontal: space.sm, borderRadius: radius.md },
  cover: { width: 36, height: 45, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, flexDirection: 'row', justifyContent: 'flex-end' },
});
