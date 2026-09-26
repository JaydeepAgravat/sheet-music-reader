import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import NativeSafImport from '@/specs/NativeSafImport';
import { deleteForever, expiredTrashIds } from '@/data/repos/scores';
import { showToast } from '@/ui/feedback/store';
import { importPendingShares } from './importActions';

/**
 * App-level import plumbing: files shared to the app ("Share → Score Reader", "Open with") are
 * imported immediately, and Trash older than 30 days is purged once per launch.
 */
export function ImportHost() {
  const { t } = useTranslation();

  useEffect(() => {
    const takeShares = () => {
      const n = importPendingShares();
      if (n > 0) showToast({ message: t('import.sharedIncoming', { count: n }), icon: 'tray-arrow-down' });
    };
    takeShares();
    const sub = NativeSafImport.onShareReceived(takeShares);
    return () => sub.remove();
  }, [t]);

  useEffect(() => {
    const files = deleteForever(expiredTrashIds());
    files.forEach(f => NativeSafImport.deleteFile(f.replace(/^file:\/\//, '')));
  }, []);

  return null;
}
