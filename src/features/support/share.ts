import { Linking } from 'react-native';
import NativeSupport from '@/specs/NativeSupport';
import { SUPPORT_EMAIL } from '@/config/support';
import { recentLog } from '@/platform/log';
import { getAppInfo } from './appInfo';
import { deviceSummary, formatAppLog, mailtoUri } from './crashReport';

/** System share sheet with plain text (email apps included). Returns false if it couldn't open. */
export function shareText(subject: string, text: string, recipient = ''): boolean {
  try {
    if (!NativeSupport) return false;
    NativeSupport.shareText(subject, text, recipient);
    return true;
  } catch {
    return false;
  }
}

/** Share a crash report, pre-addressed to support for email apps. */
export function shareReport(subject: string, text: string): boolean {
  return shareText(subject, text, SUPPORT_EMAIL);
}

/** Opens the user's email app with subject + app/device facts; falls back to the share sheet. */
export async function emailSupport(subject: string, greeting: string): Promise<void> {
  const body = `${greeting}\n\n\n—\n${deviceSummary(getAppInfo())}\n`;
  try {
    await Linking.openURL(mailtoUri(SUPPORT_EMAIL, subject, body));
  } catch {
    shareText(subject, body, SUPPORT_EMAIL);
  }
}

/** "Send app log": recent log + app/device facts via the share sheet. */
export function shareAppLog(subject: string): boolean {
  return shareText(subject, formatAppLog(getAppInfo(), recentLog(100)), SUPPORT_EMAIL);
}
