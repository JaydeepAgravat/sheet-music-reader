import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import NativeKeyEvents, { type InputDeviceInfo } from '@/specs/NativeKeyEvents';
import { navigationRef } from '@/app/navigationRef';
import { getPref, setPref } from '@/data/prefs';
import { haptic } from '@/platform/haptics';
import { Button, Sheet, Text } from '@/ui/components';
import { showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { space, useTheme } from '@/ui/theme';
import { usePedalConfigSync } from './pedalConfig';
import { PedalTester, useKeyCapture } from './PedalTester';

type PedalSheetState = { device: InputDeviceInfo | null; show: (d: InputDeviceInfo) => void; hide: () => void };

export const usePedalSheet = create<PedalSheetState>(set => ({
  device: null,
  show: device => set({ device }),
  hide: () => set({ device: null }),
}));

/**
 * App-level pedal wiring: syncs the key map to native and greets a newly connected pedal once with a
 * "press it to test" sheet. In the reader we never interrupt — a quiet toast instead.
 */
export function PedalHost() {
  const { t } = useTranslation();
  const device = usePedalSheet(s => s.device);
  const hide = usePedalSheet(s => s.hide);
  usePedalConfigSync();

  useEffect(() => {
    const sub = NativeKeyEvents.onDeviceAdded(d => {
      const greeted = getPref('greetedPedals');
      const key = d.descriptor || d.name;
      if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === 'Reader') {
        showToast({ message: t('pedals.connectedToast', { name: d.name || t('pedals.unnamedDevice') }), icon: 'bluetooth' });
        return;
      }
      if (greeted.includes(key)) return;
      setPref('greetedPedals', [...greeted, key].slice(-20));
      haptic('confirm');
      usePedalSheet.getState().show(d);
    });
    return () => sub.remove();
  }, [t]);

  return <PedalDetectedSheet device={device} onClose={hide} />;
}

function PedalDetectedSheet({ device, onClose }: { device: InputDeviceInfo | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lastKey = useKeyCapture(device !== null);
  const customise = () => {
    onClose();
    if (navigationRef.isReady()) navigationRef.navigate('Pedals');
  };
  return (
    <Sheet visible={device !== null} onClose={onClose}>
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: colors.accentContainer }]}>
          <Icon name="pedal" size={36} color="onAccentContainer" />
        </View>
        <Text variant="titleM" style={styles.center}>
          {t('pedals.detectedTitle', { name: device?.name || t('pedals.unnamedDevice') })}
        </Text>
        <Text variant="body" color="textSecondary" style={styles.center}>
          {t('pedals.detectedBody')}
        </Text>
        <View style={styles.tester}>
          <PedalTester lastKey={lastKey} />
        </View>
        <Text variant="caption" color="textTertiary" style={styles.center}>
          {t('pedals.detectedKeyboardNote')}
        </Text>
        <View style={styles.actions}>
          <Button label={t('pedals.customise')} variant="secondary" icon="sliders-horizontal" onPress={customise} />
          <Button label={t('common.done')} onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.xl },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  tester: { alignSelf: 'stretch', marginVertical: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
