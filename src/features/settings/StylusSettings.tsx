import React from 'react';
import { useTranslation } from 'react-i18next';
import { setPref, usePref } from '@/data/prefs';
import { DEFAULT_INK_PRESETS } from '@/domain/ink/presets';
import { Divider, ListRow, Switch } from '@/ui/components';
import { showSnackbar } from '@/ui/feedback/store';
import { space } from '@/ui/theme';

/** Settings → Stylus & ink. */
export function StylusSettings() {
  const { t } = useTranslation();
  const [stylusAnywhere, setStylusAnywhere] = usePref('inkStylusAnywhere');
  const [fingerDraws, setFingerDraws] = usePref('inkFingerDraws');
  const [presets] = usePref('inkPresets');

  const resetPresets = () => {
    const previous = presets;
    setPref('inkPresets', DEFAULT_INK_PRESETS.map(p => ({ ...p })));
    showSnackbar({ message: t('stylus.presetsReset'), action: { label: t('common.undo'), onPress: () => setPref('inkPresets', previous) } });
  };

  return (
    <>
      <ListRow
        icon="pen-nib"
        title={t('stylus.anywhere')}
        subtitle={t('stylus.anywhereHint')}
        trailing={<Switch value={stylusAnywhere} onValueChange={setStylusAnywhere} label={t('stylus.anywhere')} />}
      />
      <Divider inset={space.lg} />
      <ListRow
        icon="hand"
        title={t('ink.fingerDraws')}
        subtitle={t('stylus.fingerHint')}
        trailing={<Switch value={fingerDraws} onValueChange={setFingerDraws} label={t('ink.fingerDraws')} />}
      />
      <Divider inset={space.lg} />
      <ListRow icon="arrow-counter-clockwise" title={t('stylus.resetPresets')} subtitle={t('stylus.resetPresetsHint')} onPress={resetPresets} />
    </>
  );
}
