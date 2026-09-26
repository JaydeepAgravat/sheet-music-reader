/** Settings → developer rows (debug builds only; strings intentionally not translated). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/RootNavigator';
import { benchmarkSearch, removeSyntheticScores, seedSyntheticScores } from '@/dev/libraryBench';
import { seedLibraryFromTestPdfs } from '@/dev/seedLibrary';
import { usePedalSheet } from '@/features/pedals/PedalHost';
import { Divider, ListRow } from '@/ui/components';
import { showToast } from '@/ui/feedback/store';
import { radius, space, useTheme } from '@/ui/theme';

export function DevToolsGroup() {
  const { colors } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <ListRow icon="palette" title="Design showcase" chevron onPress={() => nav.navigate('Showcase')} />
      <Divider inset={66} />
      <ListRow icon="file-pdf" title="Renderer lab" chevron onPress={() => nav.navigate('RendererLab')} />
      <Divider inset={66} />
      <ListRow
        icon="tray-arrow-down"
        title="Add test PDFs to library"
        onPress={async () => {
          const r = await seedLibraryFromTestPdfs();
          showToast({ message: `Added ${r.added} · failed ${r.failed}`, icon: 'info' });
        }}
      />
      <Divider inset={66} />
      <ListRow icon="plus" title="Seed 5,000 synthetic scores" onPress={() => showToast({ message: `Added ${seedSyntheticScores(5000)}`, icon: 'info' })} />
      <Divider inset={66} />
      <ListRow
        icon="timer"
        title="Benchmark search"
        onPress={() => {
          const r = benchmarkSearch();
          showToast({ message: `${r.total} scores · search p95 ${r.search.p95} ms · list p95 ${r.list.p95} ms`, icon: 'timer', duration: 8000 });
        }}
      />
      <Divider inset={66} />
      <ListRow icon="trash" title="Remove synthetic scores" onPress={removeSyntheticScores} />
      <Divider inset={66} />
      <ListRow
        icon="bluetooth"
        title="Simulate pedal connected"
        onPress={() => usePedalSheet.getState().show({ id: -1, name: 'AirTurn DIGIT III', descriptor: 'dev', external: true })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden', marginTop: space.xl },
});
