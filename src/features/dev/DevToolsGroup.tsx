/** Settings → developer rows (debug builds only; strings intentionally not translated). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/RootNavigator';
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
