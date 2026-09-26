import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/ui/components';
import { EmptyCollectionsArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';

export function CollectionsScreen() {
  const { t } = useTranslation();
  return (
    <Screen centerContent title={t('nav.collections')}>
      <EmptyState art={<EmptyCollectionsArt />} title={t('collections.emptyTitle')} body={t('collections.emptyBody')} />
    </Screen>
  );
}
