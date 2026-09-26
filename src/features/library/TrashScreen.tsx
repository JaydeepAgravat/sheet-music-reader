import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import NativeSafImport from '@/specs/NativeSafImport';
import { useLiveQuery } from '@/data/db/live';
import { daysLeftInTrash, deleteForever, listTrash, restoreScores, type Score } from '@/data/repos/scores';
import { haptic } from '@/platform/haptics';
import { Button, Dialog, Divider, EmptyState, IconButton, Text } from '@/ui/components';
import { showSnackbar } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { Screen } from '@/ui/layout/Screen';
import { radius, space, useTheme } from '@/ui/theme';

const removeFiles = (files: string[]) => files.forEach(f => NativeSafImport.deleteFile(f.replace(/^file:\/\//, '')));

/** Trash: deleted scores stay 30 days, restorable, then disappear for good. */
export function TrashScreen() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const { colors } = useTheme();
  const items = useLiveQuery(['scores'], listTrash, []);
  const [confirm, setConfirm] = useState<string[] | null>(null);

  const restore = (s: Score) => {
    restoreScores([s.id]);
    haptic('confirm');
    showSnackbar({ message: t('trash.restored', { title: s.title }) });
  };

  const actions = items.length > 0 && <Button label={t('trash.empty')} variant="ghost" onPress={() => setConfirm(items.map(s => s.id))} />;

  return (
    <Screen title={t('trash.title')} onBack={() => nav.goBack()} actions={actions} centerContent={items.length === 0}>
      {items.length === 0 ? (
        <EmptyState
          art={
            <View style={[styles.art, { backgroundColor: colors.surfaceSunken }]}>
              <Icon name="trash" size={40} color="textTertiary" />
            </View>
          }
          title={t('trash.emptyTitle')}
          body={t('trash.emptyBody')}
        />
      ) : (
        <View style={styles.column}>
          <Text variant="caption" color="textSecondary" style={styles.hint}>
            {t('trash.hint')}
          </Text>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {items.map((s, i) => (
              <View key={s.id}>
                {i > 0 && <Divider inset={76} />}
                <View style={styles.row}>
                  <View style={[styles.thumb, { borderColor: colors.borderSubtle }]}>
                    {s.coverPath ? <Image source={{ uri: s.coverPath }} style={StyleSheet.absoluteFill} /> : null}
                  </View>
                  <View style={styles.text}>
                    <Text variant="titleS" numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {t('trash.daysLeft', { count: daysLeftInTrash(s.deletedAt ?? Date.now()) })}
                    </Text>
                  </View>
                  <Button label={t('trash.restore')} variant="tonal" onPress={() => restore(s)} />
                  <IconButton icon="x" label={t('trash.deleteForever')} onPress={() => setConfirm([s.id])} />
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
      <Dialog
        visible={confirm !== null}
        title={t('trash.confirmTitle', { count: confirm?.length ?? 0 })}
        body={t('trash.confirmBody')}
        confirm={{
          label: t('trash.deleteForever'),
          variant: 'danger',
          onPress: () => {
            if (confirm) removeFiles(deleteForever(confirm));
            setConfirm(null);
          },
        }}
        cancel={{ label: t('common.cancel'), onPress: () => setConfirm(null) }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 720, width: '100%', alignSelf: 'center' },
  hint: { marginBottom: space.md, marginLeft: space.xs },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, paddingRight: space.xs, paddingVertical: space.sm },
  thumb: { width: 44, height: 55, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth * 2 },
  text: { flex: 1, gap: 2 },
  art: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
});
