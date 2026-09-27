import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '@/app/RootNavigator';
import { useLiveQuery } from '@/data/db/live';
import {
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  listItems,
  listSetlists,
  localIsoDate,
  restoreSetlist,
  updateSetlist,
  type Setlist,
} from '@/data/repos/setlists';
import { dateBucket } from '@/domain/setlists/dates';
import { haptic } from '@/platform/haptics';
import { Button, EmptyState, IconButton, Menu, Text, type Anchor } from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { EmptySetlistsArt } from '@/ui/illustrations/Illustrations';
import { Screen } from '@/ui/layout/Screen';
import { breakpoints, space } from '@/ui/theme';
import { requirePro } from '@/features/billing/entitlement';
import { SetlistCard, SetlistNameDialog } from './SetlistParts';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Section = { key: 'soon' | 'undated' | 'past'; title: string; items: Setlist[] };

/** Plays a setlist from its first playable song. */
export function playSetlist(nav: Nav, setlistId: string, fromIndex = 0): boolean {
  const items = listItems(setlistId);
  const i = items.findIndex((it, idx) => idx >= fromIndex && !it.score.deleted);
  const item = i >= 0 ? items[i] : undefined;
  if (!item) return false;
  nav.navigate('Reader', { scoreId: item.scoreId, setlistId, itemIndex: i });
  return true;
}

export function SetlistsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const setlists = useLiveQuery(['setlists', 'setlist_items', 'scores'], () => listSetlists(), []);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Setlist | null>(null);
  const [menu, setMenu] = useState<{ setlist: Setlist; anchor: Anchor } | null>(null);
  const columns = width >= breakpoints.expanded ? 2 : 1;

  const today = localIsoDate();
  const sections: Section[] = [
    { key: 'soon', title: t('setlists.upcoming'), items: setlists.filter(s => ['today', 'tomorrow', 'upcoming'].includes(dateBucket(s.eventDate, today))) },
    { key: 'undated', title: t('setlists.undated'), items: setlists.filter(s => !s.eventDate) },
    { key: 'past', title: t('setlists.past'), items: setlists.filter(s => dateBucket(s.eventDate, today) === 'past') },
  ].filter((s): s is Section => s.items.length > 0);
  const showHeadings = sections.length > 1;

  // Check the free limit before asking for a name, not after.
  const startCreate = () => {
    if (requirePro('setlists')) setCreating(true);
  };

  const create = (name: string, date: string | null) => {
    setCreating(false);
    const id = createSetlist(name, date);
    haptic('confirm');
    nav.navigate('Setlist', { setlistId: id, addSongs: true });
  };

  const remove = (s: Setlist) => {
    const snap = deleteSetlist(s.id);
    if (!snap) return;
    showSnackbar({ message: t('setlists.deleted', { name: s.name }), action: { label: t('common.undo'), onPress: () => restoreSetlist(snap) } });
  };

  const duplicate = (s: Setlist) => {
    if (!requirePro('setlists')) return;
    const name = t('setlists.duplicateName', { name: s.name });
    if (duplicateSetlist(s.id, name)) showToast({ message: t('setlists.duplicated', { name }), icon: 'copy' });
  };

  const newButton = <IconButton icon="plus" label={t('setlists.newSetlist')} onPress={startCreate} variant="tonal" />;

  return (
    <>
      {setlists.length === 0 ? (
        <Screen centerContent title={t('nav.setlists')}>
          <EmptyState art={<EmptySetlistsArt />} title={t('setlists.emptyTitle')} body={t('setlists.emptyBody')} />
          <View style={styles.emptyAction}>
            <Button label={t('setlists.newSetlist')} icon="plus" onPress={startCreate} />
          </View>
        </Screen>
      ) : (
        <Screen title={t('nav.setlists')} actions={newButton} scroll={false}>
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}>
            {sections.map(section => (
              <View key={section.key} style={styles.section}>
                {showHeadings && (
                  <Text variant="overline" color="textSecondary" accessibilityRole="header">
                    {section.title.toUpperCase()}
                  </Text>
                )}
                <View style={[styles.grid, columns > 1 && styles.gridWide]}>
                  {section.items.map(s => (
                    <View key={s.id} style={columns > 1 ? styles.cellWide : undefined}>
                      <SetlistCard
                        setlist={s}
                        onOpen={() => nav.navigate('Setlist', { setlistId: s.id })}
                        onPlay={() => playSetlist(nav, s.id)}
                        onMore={anchor => setMenu({ setlist: s, anchor })}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </Screen>
      )}

      <Menu
        visible={menu !== null}
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                { key: 'rename', label: t('setlists.rename'), icon: 'pencil-simple', onPress: () => setRenaming(menu.setlist) },
                { key: 'duplicate', label: t('setlists.duplicate'), icon: 'copy', onPress: () => duplicate(menu.setlist) },
                { key: 'delete', label: t('setlists.delete'), icon: 'trash', destructive: true, dividerBefore: true, onPress: () => remove(menu.setlist) },
              ]
            : []
        }
      />
      <SetlistNameDialog
        visible={creating}
        title={t('setlists.newSetlist')}
        confirmLabel={t('common.save')}
        initialName=""
        initialDate={null}
        withDate
        onSubmit={create}
        onCancel={() => setCreating(false)}
      />
      <SetlistNameDialog
        visible={renaming !== null}
        title={t('setlists.rename')}
        confirmLabel={t('common.save')}
        initialName={renaming?.name ?? ''}
        initialDate={renaming?.eventDate ?? null}
        withDate
        onSubmit={(name, date) => {
          if (renaming) updateSetlist(renaming.id, { name, eventDate: date });
          setRenaming(null);
        }}
        onCancel={() => setRenaming(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xl, paddingTop: space.md },
  section: { gap: space.sm },
  grid: { gap: space.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWide: { width: '49.2%' },
  emptyAction: { flexDirection: 'row', justifyContent: 'center', marginTop: space.lg },
});
