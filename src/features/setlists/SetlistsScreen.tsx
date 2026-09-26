import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/ui/components';
import { EmptySetlistsArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';

export function SetlistsScreen() {
  const { t } = useTranslation();
  return (
    <Screen centerContent title={t('nav.setlists')}>
      <EmptyState art={<EmptySetlistsArt />} title={t('setlists.emptyTitle')} body={t('setlists.emptyBody')} />
    </Screen>
  );
}
