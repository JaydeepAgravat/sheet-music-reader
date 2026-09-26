import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '@/data/db/live';
import { addToCollection, listCollections, removeFromCollection } from '@/data/repos/collections';
import { getScoreDetail, setFavorite, updateMetadata, type MetadataPatch, type ScoreDetail } from '@/data/repos/scores';
import { Button, Chip, IconButton, Sheet, Text, TextField } from '@/ui/components';
import { radius, space, useTheme } from '@/ui/theme';

type Draft = { title: string; composer: string; arranger: string; genre: string; musicKey: string; tempo: string; timeSig: string; tags: string; notes: string };

const toDraft = (d: ScoreDetail): Draft => ({
  title: d.title,
  composer: d.composer ?? '',
  arranger: d.arranger ?? '',
  genre: d.genre ?? '',
  musicKey: d.musicKey ?? '',
  tempo: d.tempoBpm ? String(d.tempoBpm) : '',
  timeSig: d.timeSig ?? '',
  tags: d.tags.join(', '),
  notes: d.notes ?? '',
});

const EMPTY: Draft = { title: '', composer: '', arranger: '', genre: '', musicKey: '', tempo: '', timeSig: '', tags: '', notes: '' };
const splitTags = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

/**
 * Details + edit for one score, or batch edit for several (only filled-in fields are applied, and
 * tags are added rather than replaced).
 */
export function ScoreDetailSheet({
  ids,
  onClose,
  onOpen,
  onTrash,
}: {
  ids: string[];
  onClose: () => void;
  onOpen?: (id: string) => void;
  onTrash?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const single = ids.length === 1 ? ids[0]! : null;
  const detail = useLiveQuery(['scores', 'collections'], () => (single ? getScoreDetail(single) : null), [single]);
  const collections = useLiveQuery(['collections'], listCollections, []);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    setDraft(single && detail ? toDraft(detail) : EMPTY);
  }, [single, ids.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Draft) => (v: string) => setDraft(d => ({ ...d, [k]: v }));

  const save = () => {
    if (single) {
      updateMetadata(single, {
        title: draft.title,
        composer: draft.composer,
        arranger: draft.arranger,
        genre: draft.genre,
        musicKey: draft.musicKey,
        tempoBpm: draft.tempo ? Number(draft.tempo.replace(/[^\d.]/g, '')) || null : null,
        timeSig: draft.timeSig,
        notes: draft.notes,
        tags: splitTags(draft.tags),
      });
    } else {
      for (const id of ids) {
        const cur = getScoreDetail(id);
        if (!cur) continue;
        const patch: MetadataPatch = {};
        if (draft.composer.trim()) patch.composer = draft.composer;
        if (draft.genre.trim()) patch.genre = draft.genre;
        if (draft.musicKey.trim()) patch.musicKey = draft.musicKey;
        if (draft.tags.trim()) patch.tags = [...cur.tags, ...splitTags(draft.tags)];
        updateMetadata(id, patch);
      }
    }
    onClose();
  };

  const toggleCollection = (colId: string, member: boolean) => {
    if (!single) return;
    if (member) removeFromCollection(colId, [single]);
    else addToCollection(colId, [single]);
  };

  const visible = ids.length > 0;
  const title = single ? t('details.title') : t('details.batchTitle', { count: ids.length });

  return (
    <Sheet visible={visible} onClose={onClose} title={single ? undefined : title}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {single && detail && (
          <View style={styles.hero}>
            <View style={[styles.cover, { borderColor: colors.borderSubtle }]}>
              {detail.coverPath ? <Image source={{ uri: detail.coverPath }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            </View>
            <View style={styles.heroText}>
              <Text variant="titleM" numberOfLines={3}>
                {detail.title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {[
                  t('library.pages', { count: detail.pageCount }),
                  formatBytes(detail.fileSize),
                  t('details.added', { date: new Date(detail.createdAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }) }),
                ].join(' · ')}
              </Text>
              {detail.originalName ? (
                <Text variant="caption" color="textTertiary" numberOfLines={1}>
                  {detail.originalName}
                </Text>
              ) : null}
              <View style={styles.heroActions}>
                {onOpen && <Button label={t('details.open')} icon="book-open" onPress={() => onOpen(detail.id)} />}
                <IconButton
                  icon="star"
                  selected={detail.isFavorite}
                  label={detail.isFavorite ? t('details.unfavorite') : t('details.favorite')}
                  onPress={() => setFavorite([detail.id], !detail.isFavorite)}
                  variant="tonal"
                />
              </View>
            </View>
          </View>
        )}
        {!single && (
          <Text variant="caption" color="textSecondary">
            {t('details.batchHint')}
          </Text>
        )}

        {single && <TextField label={t('details.title')} value={draft.title} onChangeText={set('title')} />}
        <TextField label={t('details.composer')} value={draft.composer} onChangeText={set('composer')} placeholder={t('details.composerPlaceholder')} />
        {single && <TextField label={t('details.arranger')} value={draft.arranger} onChangeText={set('arranger')} />}
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label={t('details.genre')} value={draft.genre} onChangeText={set('genre')} placeholder={t('details.genrePlaceholder')} />
          </View>
          <View style={styles.flex}>
            <TextField label={t('details.key')} value={draft.musicKey} onChangeText={set('musicKey')} placeholder={t('details.keyPlaceholder')} />
          </View>
        </View>
        {single && (
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField label={t('details.tempo')} value={draft.tempo} onChangeText={set('tempo')} keyboardType="number-pad" placeholder="120" />
            </View>
            <View style={styles.flex}>
              <TextField label={t('details.timeSig')} value={draft.timeSig} onChangeText={set('timeSig')} placeholder="4/4" />
            </View>
          </View>
        )}
        <TextField
          label={single ? t('details.tags') : t('details.addTags')}
          hint={t('details.tagsHint')}
          value={draft.tags}
          onChangeText={set('tags')}
          autoCapitalize="words"
        />
        {single && detail && collections.length > 0 && (
          <View style={styles.collections}>
            <Text variant="label" color="textSecondary">
              {t('details.collections')}
            </Text>
            <View style={styles.chipWrap}>
              {collections.map(c => {
                const member = detail.collectionIds.includes(c.id);
                return <Chip key={c.id} label={c.name} selected={member} onPress={() => toggleCollection(c.id, member)} />;
              })}
            </View>
          </View>
        )}
        {single && <TextField label={t('details.notes')} value={draft.notes} onChangeText={set('notes')} multiline />}

        <View style={styles.actions}>
          {single && onTrash && <Button label={t('details.moveToTrash')} icon="trash" variant="danger" onPress={() => onTrash(single)} />}
          <View style={styles.flex} />
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          <Button label={t('details.save')} onPress={save} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { maxHeight: 720 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  hero: { flexDirection: 'row', gap: space.lg, marginBottom: space.sm },
  cover: { width: 96, height: 120, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth * 2 },
  heroText: { flex: 1, gap: space.xs },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  pair: { flexDirection: 'row', gap: space.md },
  collections: { gap: space.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
});
