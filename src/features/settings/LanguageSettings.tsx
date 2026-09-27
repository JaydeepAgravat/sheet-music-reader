import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePref, type LanguagePref } from '@/data/prefs';
import i18n, { resolveLanguage } from '@/i18n';
import { ListRow, Menu, type Anchor } from '@/ui/components';

/** Language names are shown in their own language, so anyone can find theirs. */
const NATIVE_NAMES: Record<Exclude<LanguagePref, 'system'>, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
};

const ORDER: LanguagePref[] = ['system', 'en', 'de', 'es', 'fr', 'it', 'ja'];

/** Settings → Language: follow the device, or pick one of the six app languages. */
export function LanguageSettings() {
  const { t } = useTranslation();
  const [language, setLanguage] = usePref('language');
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<React.ComponentRef<typeof View>>(null);

  const label = (l: LanguagePref) => (l === 'system' ? t('language.system', { name: NATIVE_NAMES[resolveLanguage('system')] }) : NATIVE_NAMES[l]);

  const pick = (l: LanguagePref) => {
    setLanguage(l);
    i18n.changeLanguage(resolveLanguage(l)).catch(() => {});
  };

  return (
    <View ref={ref} collapsable={false}>
      <ListRow
        icon="globe-simple"
        title={t('language.title')}
        subtitle={label(language)}
        chevron
        onPress={() => ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }))}
      />
      <Menu
        visible={anchor !== null}
        anchor={anchor}
        title={t('language.title')}
        onClose={() => setAnchor(null)}
        items={ORDER.map(l => ({ key: l, label: label(l), selected: language === l, onPress: () => pick(l) }))}
      />
    </View>
  );
}
