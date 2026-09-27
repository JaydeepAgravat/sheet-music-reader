import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePref } from '@/data/prefs';
import { Banner } from '@/ui/components';
import { useStartBackup } from './BackupSettings';

/** Shown once the library is worth protecting and has never been backed up. */
export const BACKUP_BANNER_MIN_SCORES = 25;

/**
 * The one-time library nudge (docs/PLAN.md §1.4): 25+ scores and no backup yet. Dismissing it, or
 * making any backup, hides it for good.
 */
export function BackupBanner({ scoreCount }: { scoreCount: number }) {
  const { t } = useTranslation();
  const [lastAt] = usePref('lastBackupAt');
  const [dismissed, setDismissed] = usePref('backupBannerDismissed');
  const start = useStartBackup();
  if (lastAt || dismissed || scoreCount < BACKUP_BANNER_MIN_SCORES) return null;
  return (
    <Banner
      icon="shield-check"
      message={t('backup.bannerBody', { count: scoreCount })}
      action={{ label: t('backup.backUpNow'), onPress: start }}
      onDismiss={() => setDismissed(true)}
    />
  );
}
