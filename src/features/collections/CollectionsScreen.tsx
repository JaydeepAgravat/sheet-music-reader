import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import { allCollectionCovers, createCollection, listCollections, renameCollection } from '@/data/repos/collections';
import { Button, EmptyState, Menu, type Anchor, type MenuItem } from '@/ui/components';
import { useFeedback } from '@/ui/feedback/store';
import { EmptyCollectionsArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';
import { breakpoints, space } from '@/ui/theme';
import { CollectionNameDialog, CollectionTile, deleteWithUndo, type CollectionWithCovers } from './CollectionParts';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type NameDialog = { mode: 'create' } | { mode: 'rename'; id: string; name: string } | null;

/** Collections tab: a grid of stacked-cover tiles (2 columns on phones, 3–4 on tablets). */
export function CollectionsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomObstruction = useFeedback(st => st.bottomObstruction);

  const collections: CollectionWithCovers[] = useLiveQuery(
    ['collections', 'scores'],
    () => {
      const covers = allCollectionCovers(3);
      return listCollections().map(c => ({ ...c, covers: covers.get(c.id) ?? [] }));
    },
    [],
  );
  const [menu, setMenu] = useState<{ collection: CollectionWithCovers; anchor: Anchor } | null>(null);
  const [dialog, setDialog] = useState<NameDialog>(null);

  const railWidth = width >= breakpoints.medium ? 88 : 0;
  const gutter = width >= breakpoints.expanded ? space.xxl : width >= breakpoints.medium ? space.xl : space.lg;
  const columns = Math.min(4, Math.max(2, Math.floor((width - railWidth - gutter * 2) / 220)));

  const open = useCallback((c: CollectionWithCovers) => nav.navigate('Collection', { collectionId: c.id }), [nav]);
  const showMenu = useCallback((collection: CollectionWithCovers, anchor: Anchor) => setMenu({ collection, anchor }), []);
  const rename = useCallback((c: CollectionWithCovers) => setDialog({ mode: 'rename', id: c.id, name: c.name }), []);
  const remove = useCallback((c: CollectionWithCovers) => deleteWithUndo(c, t), [t]);

  const menuItems: MenuItem[] = menu
    ? [
        { key: 'open', label: t('collections.open'), icon: 'folder-open', onPress: () => open(menu.collection) },
        { key: 'rename', label: t('common.rename'), icon: 'pencil-simple', onPress: () => rename(menu.collection) },
        { key: 'delete', label: t('collections.delete'), icon: 'trash', destructive: true, dividerBefore: true, onPress: () => remove(menu.collection) },
      ]
    : [];

  const taken = useMemo(
    () => collections.filter(c => dialog?.mode !== 'rename' || c.id !== dialog.id).map(c => c.name),
    [collections, dialog],
  );

  const newButton = <Button label={t('collections.new')} icon="plus" variant="tonal" onPress={() => setDialog({ mode: 'create' })} />;

  const overlays = (
    <>
      <Menu visible={menu !== null} anchor={menu?.anchor ?? null} title={menu?.collection.name} items={menuItems} onClose={() => setMenu(null)} />
      <CollectionNameDialog
        visible={dialog !== null}
        title={dialog?.mode === 'rename' ? t('collections.renameTitle') : t('collections.new')}
        confirmLabel={dialog?.mode === 'rename' ? t('common.save') : t('collections.create')}
        initial={dialog?.mode === 'rename' ? dialog.name : ''}
        taken={taken}
        onCancel={() => setDialog(null)}
        onSubmit={name => {
          if (dialog?.mode === 'rename') renameCollection(dialog.id, name);
          else createCollection(name);
          setDialog(null);
        }}
      />
    </>
  );

  if (collections.length === 0) {
    return (
      <Screen centerContent title={t('nav.collections')}>
        <EmptyState
          art={<EmptyCollectionsArt />}
          title={t('collections.emptyTitle')}
          body={t('collections.emptyBody')}
          action={{ label: t('collections.new'), icon: 'plus', onPress: () => setDialog({ mode: 'create' }) }}
        />
        {overlays}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} title={t('nav.collections')} actions={newButton}>
      <FlashList
        key={`cols-${columns}`}
        data={collections}
        numColumns={columns}
        keyExtractor={c => c.id}
        style={styles.list}
        contentContainerStyle={{ paddingTop: space.sm, paddingBottom: space.xxxl + (bottomObstruction > 0 ? 0 : insets.bottom) }}
        renderItem={({ item }) => <CollectionTile collection={item} onOpen={open} onMenu={showMenu} onRename={rename} onDelete={remove} />}
      />
      {overlays}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -space.xs },
});
