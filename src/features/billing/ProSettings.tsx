import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '@/data/db/live';
import { countScores } from '@/data/repos/scores';
import { countSetlists } from '@/data/repos/setlists';
import { Button, Divider, ListRow, Switch } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { space, useTheme } from '@/ui/theme';
import { FREE_SCORE_LIMIT, FREE_SETLIST_LIMIT, openPaywall, restorePurchases, setDevPro, usePro } from './entitlement';

/**
 * Settings → Pro group: where the user stands, the way to Pro, and Restore purchase.
 * Mount inside a settings group card (like ReadingSettings).
 */
export function ProSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isPro = usePro(s => s.isPro);
  const pending = usePro(s => s.state === 'pending');
  const busy = usePro(s => s.busy);
  const { counted } = useLiveQuery(['scores'], () => countScores(), []);
  const setlists = useLiveQuery(['setlists'], () => countSetlists(), []);

  const usage = [
    t('billing.settings.scoresUsed', { used: counted, limit: FREE_SCORE_LIMIT }),
    t('billing.settings.setlistsUsed', { used: setlists, limit: FREE_SETLIST_LIMIT }),
  ].join(' · ');

  return (
    <View>
      {isPro ? (
        <ListRow
          icon="seal-check"
          title={t('billing.settings.proTitle')}
          subtitle={t('billing.settings.proBody')}
          trailing={<Icon name="check-circle" weight="fill" size={22} color="accent" />}
        />
      ) : (
        <ListRow
          icon={pending ? 'hourglass-medium' : 'sparkle'}
          title={t('billing.settings.freeTitle')}
          subtitle={pending ? t('billing.paywall.pending') : usage}
          trailing={<Button label={t('billing.getPro')} variant="tonal" onPress={() => openPaywall('settings')} />}
        />
      )}
      <Divider inset={66} />
      <ListRow
        icon="arrow-counter-clockwise"
        title={t('billing.restore.action')}
        subtitle={t('billing.restore.hint')}
        disabled={busy}
        onPress={restorePurchases}
        trailing={busy ? <ActivityIndicator size="small" color={colors.textSecondary} style={styles.spinner} /> : undefined}
      />
      {__DEV__ && <DevProRow />}
    </View>
  );
}

/** Debug builds only: flip Pro in memory (never cached) to test gating without Play. */
function DevProRow() {
  const isPro = usePro(s => s.isPro);
  return (
    <>
      <Divider inset={66} />
      {/* eslint-disable-next-line i18next/no-literal-string -- debug-only row */}
      <ListRow icon="gear-six" title="Pretend Pro (debug)" trailing={<Switch value={isPro} onValueChange={setDevPro} label="Pretend Pro" />} />
    </>
  );
}

const styles = StyleSheet.create({
  spinner: { marginRight: space.sm },
});
