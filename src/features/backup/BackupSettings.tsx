import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/RootNavigator';
import { usePref } from '@/data/prefs';
import { useLibraryFocus } from '@/features/library/libraryFocus';
import { Button, Dialog, Divider, ListRow, SegmentedControl, Sheet, Text } from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';
import {
  BackupError,
  backupErrorKey,
  cancelBackupOp,
  createBackup,
  openBackup,
  restoreBackup,
  useBackup,
  verifyLibrary,
  type BackupErrorCode,
  type BackupHandle,
} from './backupService';

type RestoreMode = 'merge' | 'replace';

export function formatBytes(n: number): string {
  if (n < 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Shows a backup error (cancellation is silent). */
export function useBackupErrors(): (e: unknown) => void {
  const { t } = useTranslation();
  return e => {
    const code: BackupErrorCode = e instanceof BackupError ? e.code : 'restoreFailed';
    if (code === 'cancelled') return;
    showSnackbar({ message: t(backupErrorKey(code)), duration: 6000 });
  };
}

/** Starts a backup from anywhere (settings, the library banner). */
export function useStartBackup(): () => Promise<void> {
  const { t } = useTranslation();
  const fail = useBackupErrors();
  return async () => {
    try {
      const r = await createBackup();
      if (!r) return;
      const lost = r.missing.length + r.damaged.length;
      showSnackbar({
        message: lost ? t('backup.notBackedUp', { count: lost }) : t('backup.saved', { size: formatBytes(r.bytes) }),
        duration: lost ? 8000 : 4000,
      });
    } catch (e) {
      fail(e);
    }
  };
}

/**
 * Settings → Backup: last-backup status, back up now, restore (preview → Merge / Replace),
 * file integrity check, and the honest note about Android's own backup.
 */
export function BackupSettings() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [lastAt] = usePref('lastBackupAt');
  const [lastScores] = usePref('lastBackupScores');
  const running = useBackup(s => s.running);
  const startBackup = useStartBackup();
  const fail = useBackupErrors();
  const [handle, setHandle] = useState<BackupHandle | null>(null);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const status = lastAt
    ? t('backup.lastBackup', {
        date: new Date(lastAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }),
        count: lastScores,
      })
    : t('backup.never');

  const pickRestore = async () => {
    try {
      const h = await openBackup();
      if (h) setHandle(h);
    } catch (e) {
      fail(e);
    }
  };

  const verify = async () => {
    try {
      const r = await verifyLibrary();
      const ids = [...r.missing, ...r.mismatched];
      showSnackbar({
        message: ids.length ? t('backup.verifyBad', { count: ids.length }) : t('backup.verifyOk', { count: r.checked }),
        duration: 8000,
        action: ids.length
          ? {
              label: t('backup.showDamaged'),
              onPress: () => {
                useLibraryFocus.getState().show(ids, t('backup.damagedFilter', { count: ids.length }));
                nav.navigate('Main', { screen: 'Library' });
              },
            }
          : undefined,
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <View style={styles.status}>
        <Icon name={lastAt ? 'cloud-check' : 'warning-circle'} size={22} color={lastAt ? 'success' : 'textSecondary'} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{status}</Text>
          <Text variant="caption" color="textSecondary">
            {t('backup.hint')}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button label={t('backup.backUpNow')} icon="download-simple" disabled={running} onPress={startBackup} />
        <Button label={t('backup.restore')} icon="upload-simple" variant="secondary" disabled={running} onPress={pickRestore} />
      </View>
      <Divider inset={space.lg} />
      <ListRow icon="shield-check" title={t('backup.verify')} subtitle={t('backup.verifyHint')} onPress={running ? undefined : verify} disabled={running} />
      <View style={[styles.note, { backgroundColor: colors.surfaceSunken }]}>
        <Icon name="info" size={18} color="textSecondary" />
        <Text variant="caption" color="textSecondary" style={styles.flex}>
          {t('backup.autoBackupNote')}
        </Text>
      </View>
      <RestoreSheet handle={handle} onClose={() => setHandle(null)} />
    </>
  );
}

/** Preview of an opened backup, the Merge / Replace choice, and the restore itself. */
function RestoreSheet({ handle, onClose }: { handle: BackupHandle | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const fail = useBackupErrors();
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const p = handle?.preview;
  const plan = p ? p[mode] : null;
  const destructive = mode === 'replace' && !!plan && (plan.removed.scores > 0 || plan.removed.setlists > 0 || plan.removed.collections > 0);

  const run = async () => {
    if (!handle) return;
    setConfirmReplace(false);
    const h = handle;
    onClose();
    try {
      const r = await restoreBackup(h, mode);
      const skipped = r.skippedScores.length;
      showSnackbar({
        message: skipped ? t('backup.skipped', { count: skipped }) : t('backup.restored', { count: r.inserted.scores + r.matchedScores }),
        duration: skipped ? 8000 : 4000,
      });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <>
      <Sheet visible={handle !== null} onClose={onClose} title={t('backup.restoreTitle')}>
        {p && plan && (
          <View style={styles.sheet}>
            <View style={[styles.card, { backgroundColor: colors.surfaceSunken }]}>
              <Text variant="bodyStrong">{t('backup.createdOn', { date: new Date(p.createdAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) })}</Text>
              <Text variant="caption" color="textSecondary">
                {t('backup.contents', {
                  scores: p.counts.scores,
                  setlists: p.counts.setlists,
                  collections: p.counts.collections,
                  size: formatBytes(p.archiveBytes > 0 ? p.archiveBytes : p.counts.pdfBytes),
                })}
              </Text>
            </View>
            <SegmentedControl<RestoreMode>
              value={mode}
              onChange={m => {
                setMode(m);
                setConfirmReplace(false);
              }}
              segments={[
                { value: 'merge', label: t('backup.merge'), icon: 'plus' },
                { value: 'replace', label: t('backup.replace'), icon: 'arrows-down-up' },
              ]}
            />
            <Text variant="body" color="textSecondary">
              {mode === 'merge' ? t('backup.mergeHint') : t('backup.replaceHint')}
            </Text>
            <View style={styles.planRows}>
              <PlanRow icon="books" label={t('backup.planScores', { new: plan.scores.new, existing: plan.scores.existing })} />
              <PlanRow icon="playlist" label={t('backup.planSetlists', { count: plan.setlists.new })} />
              <PlanRow icon="pencil-simple" label={t('backup.planInk', { count: plan.strokes.new })} />
              {plan.files.bytes > 0 && <PlanRow icon="download-simple" label={t('backup.planFiles', { size: formatBytes(plan.files.bytes) })} />}
              {mode === 'replace' && plan.removed.scores > 0 && (
                <PlanRow icon="warning-circle" danger label={t('backup.planRemoved', { count: plan.removed.scores })} />
              )}
            </View>
            {confirmReplace ? (
              // Confirm in place: a second modal over the sheet would open behind it on Android.
              <View style={[styles.confirm, { backgroundColor: colors.dangerContainer }]} accessibilityLiveRegion="assertive">
                <Text variant="bodyStrong" color="onDangerContainer">
                  {t('backup.replaceConfirmTitle')}
                </Text>
                <Text variant="body" color="onDangerContainer">
                  {t('backup.replaceConfirmBody', { count: plan.removed.scores })}
                </Text>
                <View style={styles.sheetActions}>
                  <Button label={t('common.cancel')} variant="ghost" onPress={() => setConfirmReplace(false)} />
                  <Button label={t('backup.replace')} variant="danger" onPress={run} />
                </View>
              </View>
            ) : (
              <View style={styles.sheetActions}>
                <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
                <Button
                  label={t('backup.restoreAction')}
                  variant={destructive ? 'danger' : 'primary'}
                  onPress={() => (destructive ? setConfirmReplace(true) : run())}
                />
              </View>
            )}
          </View>
        )}
      </Sheet>
    </>
  );
}

function PlanRow({ icon, label, danger }: { icon: 'books' | 'playlist' | 'pencil-simple' | 'download-simple' | 'warning-circle'; label: string; danger?: boolean }) {
  return (
    <View style={styles.planRow}>
      <Icon name={icon} size={18} color={danger ? 'danger' : 'textSecondary'} />
      <Text variant="body" color={danger ? 'danger' : 'textPrimary'} style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

/** Progress for a running backup / restore / check, with cancel. Mounted once at the app root. */
export function BackupProgressHost() {
  const { t } = useTranslation();
  const { running, op, progress } = useBackup();
  const [cancelAsked, setCancelAsked] = useState(false);
  if (!running || !op) return null;
  const fraction =
    progress && progress.bytesTotal > 0 ? progress.bytesDone / progress.bytesTotal : progress && progress.total > 0 ? progress.done / progress.total : 0;
  const title = op === 'backup' ? t('backup.progressBackup') : op === 'restore' ? t('backup.progressRestore') : t('backup.progressVerify');
  const detail = progress && progress.total > 0 ? t('backup.progressDetail', { done: progress.done, total: progress.total }) : '';
  return (
    <Sheet visible onClose={() => setCancelAsked(true)} title={title}>
      <View style={styles.sheet}>
        <ProgressBar fraction={Math.min(1, Math.max(0, fraction))} />
        <View style={styles.progressText}>
          <Text variant="numeric" color="textSecondary">
            {`${Math.round(fraction * 100)} %`}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.flex}>
            {detail}
          </Text>
        </View>
        <View style={styles.sheetActions}>
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setCancelAsked(true)} />
        </View>
      </View>
      <Dialog
        visible={cancelAsked}
        title={t('backup.cancelTitle')}
        confirm={{
          label: t('backup.cancelConfirm'),
          variant: 'danger',
          onPress: () => {
            setCancelAsked(false);
            cancelBackupOp();
            showToast({ message: t('backup.cancelled'), icon: 'x' });
          },
        }}
        cancel={{ label: t('backup.keepGoing'), onPress: () => setCancelAsked(false) }}
      />
    </Sheet>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceSunken }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
    >
      <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { flexDirection: 'row', gap: space.md, padding: space.lg, paddingBottom: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
  note: { flexDirection: 'row', gap: space.sm, margin: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md },
  sheet: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  card: { padding: space.md, borderRadius: radius.md, gap: space.xs },
  planRows: { gap: space.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  confirm: { gap: space.sm, padding: space.md, borderRadius: radius.md },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
  progressText: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
