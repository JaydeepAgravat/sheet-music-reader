import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NativeSupport from '@/specs/NativeSupport';
import { logInfo } from '@/platform/log';
import { Dialog } from '@/ui/components';
import { showToast } from '@/ui/feedback/store';
import { formatSharedReport } from './crashReport';
import { shareReport } from './share';

/** Let the first screen settle before asking. */
const ASK_DELAY_MS = 700;

/**
 * Next launch after a crash: one calm question. The report is read (and deleted from disk) once;
 * it only leaves the device if the user taps "Send report" and picks an app. Never automatic.
 */
export function CrashPromptHost() {
  const { t } = useTranslation();
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      let text: string | null = null;
      try {
        text = NativeSupport?.takeCrashReport() ?? null;
      } catch {
        text = null;
      }
      if (text) {
        logInfo('Crash report from the previous session found');
        setReport(text);
      }
    }, ASK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const send = () => {
    if (
      report &&
      !shareReport(t('support.crash.subject'), formatSharedReport(t('support.crash.intro'), report))
    ) {
      showToast({ message: t('support.shareFailed'), icon: 'warning-circle' });
    }
    setReport(null);
  };

  return (
    <Dialog
      visible={report !== null}
      title={t('support.crash.title')}
      body={t('support.crash.body')}
      confirm={{ label: t('support.crash.send'), onPress: send }}
      cancel={{ label: t('support.crash.notNow'), onPress: () => setReport(null) }}
    />
  );
}
