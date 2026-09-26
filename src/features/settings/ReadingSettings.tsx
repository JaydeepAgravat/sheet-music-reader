import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Divider, ListRow, SegmentedControl, Switch, Text } from '@/ui/components';
import { usePref, type GlobalPageFilter, type PageTurnStyle, type TapZones } from '@/data/prefs';
import { space } from '@/ui/theme';

/**
 * Reading preferences. Shown in Settings and, without leaving the score, in the reader's
 * "Reading options" sheet.
 */
export function ReadingSettings({ onOpenPedals }: { onOpenPedals?: () => void }) {
  const { t } = useTranslation();
  const [pageTurn, setPageTurn] = usePref('pageTurn');
  const [tapZones, setTapZones] = usePref('tapZones');
  const [filter, setFilter] = usePref('defaultFilter');
  const [volumeKeys, setVolumeKeys] = usePref('volumeKeysTurn');

  return (
    <View>
      <View style={styles.padded}>
        <Text variant="bodyStrong">{t('reading.pageTurn')}</Text>
        <Text variant="caption" color="textSecondary" style={styles.hint}>
          {t('reading.pageTurnHint')}
        </Text>
        <SegmentedControl<PageTurnStyle>
          value={pageTurn}
          onChange={setPageTurn}
          segments={[
            { value: 'instant', label: t('reading.turnInstant') },
            { value: 'slide', label: t('reading.turnSlide') },
          ]}
        />
      </View>
      <Divider inset={space.lg} />
      <View style={styles.padded}>
        <Text variant="bodyStrong">{t('reading.tapZones')}</Text>
        <Text variant="caption" color="textSecondary" style={styles.hint}>
          {tapZones === 'sides' ? t('reading.tapSidesHint') : t('reading.tapAnywhereHint')}
        </Text>
        <SegmentedControl<TapZones>
          value={tapZones}
          onChange={setTapZones}
          segments={[
            { value: 'sides', label: t('reading.tapSides') },
            { value: 'anywhere', label: t('reading.tapAnywhere') },
          ]}
        />
      </View>
      <Divider inset={space.lg} />
      <View style={styles.padded}>
        <Text variant="bodyStrong">{t('reading.defaultFilter')}</Text>
        <Text variant="caption" color="textSecondary" style={styles.hint}>
          {t('reading.defaultFilterHint')}
        </Text>
        <SegmentedControl<GlobalPageFilter>
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'ORIGINAL', label: t('filters.ORIGINAL') },
            { value: 'PAPER', label: t('filters.PAPER') },
            { value: 'SEPIA', label: t('filters.SEPIA') },
            { value: 'NIGHT', label: t('filters.NIGHT') },
          ]}
        />
      </View>
      <Divider inset={space.lg} />
      <ListRow
        icon="vibrate"
        title={t('reading.volumeKeys')}
        subtitle={t('reading.volumeKeysHint')}
        trailing={<Switch value={volumeKeys} onValueChange={setVolumeKeys} label={t('reading.volumeKeys')} />}
      />
      {onOpenPedals && (
        <>
          <Divider inset={66} />
          <ListRow icon="pedal" title={t('pedals.title')} subtitle={t('pedals.rowHint')} chevron onPress={onOpenPedals} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { padding: space.lg },
  hint: { marginTop: 2, marginBottom: space.md },
});
