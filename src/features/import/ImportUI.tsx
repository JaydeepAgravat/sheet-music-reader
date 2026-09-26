import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '@/data/db/live';
import { getScore, updateMetadata } from '@/data/repos/scores';
import { haptic } from '@/platform/haptics';
import { Button, IconButton, ListRow, ProgressPill, Sheet, Surface, Switch, Text, TextField } from '@/ui/components';
import { showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { motion, radius, space, useTheme } from '@/ui/theme';
import { pickAndImportFiles, pickFolderListing, type FolderListing } from './importActions';
import { cancelImport, enqueueImport, importDuplicateAnyway, useImport, type FailReason } from './importQueue';

/** "Import" sheet: files or a whole folder. */
export function ImportChooser({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [folder, setFolder] = useState<FolderListing | null>(null);
  const [toCollections, setToCollections] = useState(true);

  const files = async () => {
    onClose();
    await pickAndImportFiles().catch(() => showToast({ message: t('import.pickFailed'), icon: 'warning-circle' }));
  };
  const pickFolder = async () => {
    onClose();
    try {
      const listing = await pickFolderListing();
      if (!listing) return;
      if (listing.files.length === 0) {
        showToast({ message: t('import.folderEmpty', { name: listing.folder.name }), icon: 'info' });
        return;
      }
      setToCollections(true);
      setFolder(listing);
    } catch {
      showToast({ message: t('import.pickFailed'), icon: 'warning-circle' });
    }
  };
  const confirmFolder = () => {
    if (!folder) return;
    enqueueImport({ files: folder.files, subfoldersToCollections: folder.subfolders > 0 && toCollections });
    setFolder(null);
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title={t('import.title')}>
        <View style={styles.chooser}>
          <ChooserOption icon="file-pdf" title={t('import.files')} body={t('import.filesHint')} onPress={files} />
          <ChooserOption icon="folder-open" title={t('import.folder')} body={t('import.folderHint')} onPress={pickFolder} />
          <Text variant="caption" color="textTertiary" style={styles.privacy}>
            {t('import.privacy')}
          </Text>
        </View>
      </Sheet>
      <Sheet visible={folder !== null} onClose={() => setFolder(null)} title={folder ? t('import.folderTitle', { name: folder.folder.name }) : ''}>
        {folder && (
          <View style={styles.folderBody}>
            <Text variant="body" color="textSecondary">
              {t('import.folderCount', { count: folder.files.length })}
            </Text>
            {folder.subfolders > 0 && (
              <ListRow
                icon="folders"
                title={t('import.subfoldersToCollections')}
                subtitle={t('import.subfoldersHint', { count: folder.subfolders })}
                trailing={<Switch value={toCollections} onValueChange={setToCollections} label={t('import.subfoldersToCollections')} />}
              />
            )}
            <View style={styles.folderActions}>
              <Button label={t('common.cancel')} variant="ghost" onPress={() => setFolder(null)} />
              <Button label={t('import.importCount', { count: folder.files.length })} icon="tray-arrow-down" onPress={confirmFolder} />
            </View>
          </View>
        )}
      </Sheet>
    </>
  );
}

function ChooserOption({ icon, title, body, onPress }: { icon: 'file-pdf' | 'folder-open'; title: string; body: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Surface onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} style={[styles.option, { borderColor: colors.borderSubtle }]}>
      <View style={[styles.optionIcon, { backgroundColor: colors.accentContainer }]}>
        <Icon name={icon} size={24} color="onAccentContainer" />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textSecondary">
          {body}
        </Text>
      </View>
      <Icon name="caret-right" size={18} color="textTertiary" />
    </Surface>
  );
}

/** Progress while a batch runs; the review card once it's done. Lives at the top of the library. */
export function ImportStatus() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const running = useImport(s => s.running);
  const progress = useImport(s => s.progress);
  const summary = useImport(s => s.summary);
  const dismiss = useImport(s => s.dismissSummary);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (summary && !summary.cancelled && summary.failed.length === 0 && summary.duplicates.length === 0 && summary.imported.length > 0) haptic('confirm');
  }, [summary]);

  if (running && progress) {
    return (
      <Animated.View entering={FadeIn.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)} layout={LinearTransition} style={styles.statusRow}>
        <ProgressPill
          label={t('import.progress', { done: Math.min(progress.done + 1, progress.total), total: progress.total })}
          progress={progress.total ? progress.done / progress.total : 0}
        />
        <Button label={t('common.cancel')} variant="ghost" onPress={cancelImport} />
      </Animated.View>
    );
  }
  if (!summary) return null;

  const parts = [
    summary.duplicates.length ? t('import.duplicatesSkipped', { count: summary.duplicates.length }) : null,
    summary.failed.length ? t('import.failedCount', { count: summary.failed.length }) : null,
  ].filter(Boolean);

  return (
    <Animated.View entering={FadeIn.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)} layout={LinearTransition}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]} accessibilityLiveRegion="polite">
        <View style={[styles.cardIcon, { backgroundColor: summary.imported.length ? colors.accentContainer : colors.surfaceSunken }]}>
          <Icon name={summary.imported.length ? 'check-circle' : 'info'} weight="fill" size={22} color={summary.imported.length ? 'onAccentContainer' : 'textSecondary'} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">
            {summary.cancelled ? t('import.cancelledSummary', { count: summary.imported.length }) : t('import.importedCount', { count: summary.imported.length })}
          </Text>
          {parts.length > 0 && (
            <Text variant="caption" color="textSecondary">
              {parts.join(' · ')}
            </Text>
          )}
        </View>
        <Button label={t('import.review')} variant="tonal" onPress={() => setReviewing(true)} />
        <IconButton icon="x" label={t('common.close')} size="sm" onPress={dismiss} />
      </View>
      <ReviewSheet
        visible={reviewing}
        onClose={() => setReviewing(false)}
        onDone={() => {
          setReviewing(false);
          dismiss();
        }}
      />
    </Animated.View>
  );
}

function ReviewSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const summary = useImport(s => s.summary);
  if (!summary) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title={t('import.reviewTitle')}>
      <ScrollView style={styles.review} contentContainerStyle={styles.reviewContent} keyboardShouldPersistTaps="handled">
        {summary.imported.length > 0 && (
          <>
            <Text variant="overline" color="textSecondary">
              {t('import.reviewImported').toUpperCase()}
            </Text>
            <Text variant="caption" color="textSecondary">
              {t('import.reviewImportedHint')}
            </Text>
            {summary.imported.map(id => (
              <ReviewRow key={id} id={id} />
            ))}
          </>
        )}
        {summary.duplicates.length > 0 && (
          <>
            <Text variant="overline" color="textSecondary" style={styles.reviewSection}>
              {t('import.reviewDuplicates').toUpperCase()}
            </Text>
            {summary.duplicates.map(d => (
              <View key={d.path} style={styles.issueRow}>
                <Icon name="file-pdf" size={20} color="textTertiary" />
                <Text variant="body" numberOfLines={1} style={styles.flex}>
                  {d.name}
                </Text>
                <Button label={t('import.importAnyway')} variant="ghost" onPress={() => importDuplicateAnyway(d)} />
              </View>
            ))}
          </>
        )}
        {summary.failed.length > 0 && (
          <>
            <Text variant="overline" color="textSecondary" style={styles.reviewSection}>
              {t('import.reviewFailed').toUpperCase()}
            </Text>
            {summary.failed.map((f, i) => (
              <View key={`${f.name}-${i}`} style={styles.issueRow}>
                <Icon name="warning-circle" size={20} color="danger" />
                <View style={styles.flex}>
                  <Text variant="body" numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {t(`import.reasons.${f.reason satisfies FailReason}`)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
        <Button label={t('common.done')} onPress={onDone} style={styles.done} />
      </ScrollView>
    </Sheet>
  );
}

/** One imported score with inline title/composer fixes (saved when a field loses focus). */
function ReviewRow({ id }: { id: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const score = useLiveQuery(['scores'], () => getScore(id), [id]);
  const [title, setTitle] = useState(score?.title ?? '');
  const [composer, setComposer] = useState(score?.composer ?? '');
  if (!score) return null;
  return (
    <View style={styles.reviewRow}>
      <View style={[styles.thumb, { borderColor: colors.borderSubtle }]}>
        {score.coverPath ? <Image source={{ uri: score.coverPath }} style={StyleSheet.absoluteFill} /> : null}
      </View>
      <View style={styles.fields}>
        <TextField label={t('details.title')} value={title} onChangeText={setTitle} onEndEditing={() => updateMetadata(id, { title })} returnKeyType="next" />
        <TextField
          label={t('details.composer')}
          value={composer}
          onChangeText={setComposer}
          onEndEditing={() => updateMetadata(id, { composer })}
          placeholder={t('details.composerPlaceholder')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  chooser: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  privacy: { textAlign: 'center', marginTop: space.xs },
  folderBody: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  folderActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, marginBottom: space.md },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  review: { maxHeight: 640 },
  reviewContent: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  reviewSection: { marginTop: space.lg },
  reviewRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  thumb: { width: 56, height: 70, borderRadius: 6, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth },
  fields: { flex: 1, gap: space.sm },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  done: { marginTop: space.lg, alignSelf: 'flex-end' },
});
