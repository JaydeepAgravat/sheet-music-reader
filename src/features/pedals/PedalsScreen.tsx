import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import NativeKeyEvents, { type InputDeviceInfo } from '@/specs/NativeKeyEvents';
import { useLiveQuery } from '@/data/db/live';
import { usePref } from '@/data/prefs';
import { forgetKey, learnKey, listLearned, resetLearned } from '@/data/repos/pedals';
import { keyLabel, keysByAction, type PedalAction } from '@/domain/pedals/keymap';
import { haptic } from '@/platform/haptics';
import { Button, Chip, Divider, ListRow, Sheet, Slider, Switch, Text } from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { Screen } from '@/ui/layout/Screen';
import { radius, space, useTheme } from '@/ui/theme';
import { PedalTester, useKeyCapture } from './PedalTester';

const ACTIONS: PedalAction[] = ['NEXT', 'PREV', 'TOGGLE_HALF', 'TOGGLE_PERFORMANCE', 'NEXT_SONG', 'PREV_SONG'];

/** Settings → Pedals: live test, connected devices, key assignment (learn), debounce, volume keys. */
export function PedalsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const learned = useLiveQuery(['pedal_mappings'], listLearned, []);
  const [volumeKeys, setVolumeKeys] = usePref('volumeKeysTurn');
  const [debounceMs, setDebounceMs] = usePref('pedalDebounceMs');
  const [debounceDraft, setDebounceDraft] = useState(debounceMs);
  const [assigning, setAssigning] = useState<PedalAction | null>(null);
  const devices = useConnectedDevices();
  const lastKey = useKeyCapture(focused);
  const byAction = keysByAction(learned, volumeKeys);

  // While the "press a key" sheet is open, the next captured key is assigned.
  const handled = useRef<typeof lastKey>(null);
  useEffect(() => {
    if (!assigning || !lastKey || handled.current === lastKey) return;
    handled.current = lastKey;
    learnKey({ keyCode: lastKey.keyCode, action: assigning, keyName: lastKey.keyName, deviceName: lastKey.deviceName });
    haptic('confirm');
    showToast({
      message: t('pedals.assigned', { key: keyLabel(lastKey.keyCode, lastKey.keyName), action: t(`pedals.actions.${assigning}`) }),
      icon: 'check-circle',
    });
    setAssigning(null);
  }, [assigning, lastKey, t]);

  const openAssign = (a: PedalAction) => {
    handled.current = lastKey; // ignore the key that was pressed before opening
    setAssigning(a);
  };

  const reset = () => {
    const before = listLearned();
    resetLearned();
    showSnackbar({
      message: t('pedals.resetDone'),
      action: { label: t('common.undo'), onPress: () => before.forEach(learnKey) },
    });
  };

  const group = [styles.group, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }];

  return (
    <Screen title={t('pedals.title')} onBack={() => nav.goBack()}>
      <View style={styles.column}>
        <Section title={t('pedals.test')} />
        <View style={[group, styles.padded]}>
          <PedalTester lastKey={lastKey} />
        </View>

        <Section title={t('pedals.devices')} />
        <View style={group}>
          {devices.length === 0 ? (
            <ListRow icon="bluetooth" title={t('pedals.noDevice')} subtitle={t('pedals.noDeviceHint')} />
          ) : (
            devices.map((d, i) => (
              <View key={d.descriptor || d.id}>
                {i > 0 && <Divider inset={66} />}
                <ListRow icon="pedal" title={d.name || t('pedals.unnamedDevice')} subtitle={t('pedals.connected')} />
              </View>
            ))
          )}
        </View>

        <Section title={t('pedals.keys')} />
        <View style={group}>
          {ACTIONS.map((a, i) => (
            <View key={a}>
              {i > 0 && <Divider inset={space.lg} />}
              <View style={styles.actionRow}>
                <View style={styles.actionText}>
                  <Text variant="bodyStrong">{t(`pedals.actions.${a}`)}</Text>
                  <View style={styles.keys}>
                    {byAction[a].length === 0 ? (
                      <Text variant="caption" color="textTertiary">
                        {t('pedals.noKeys')}
                      </Text>
                    ) : (
                      byAction[a].map(code => {
                        const custom = learned.find(m => m.keyCode === code);
                        return (
                          <Chip
                            key={code}
                            label={keyLabel(code, custom?.keyName)}
                            selected={!!custom}
                            trailingIcon={custom ? 'x' : undefined}
                            onPress={custom ? () => forgetKey(code) : undefined}
                            accessibilityHint={custom ? t('pedals.removeKeyHint') : undefined}
                          />
                        );
                      })
                    )}
                  </View>
                </View>
                <Button label={t('pedals.assign')} variant="ghost" icon="plus" onPress={() => openAssign(a)} />
              </View>
            </View>
          ))}
          {learned.length > 0 && (
            <>
              <Divider />
              <ListRow icon="arrow-counter-clockwise" title={t('pedals.reset')} onPress={reset} />
            </>
          )}
        </View>

        <Section title={t('pedals.behaviour')} />
        <View style={group}>
          <View style={styles.padded}>
            <View style={styles.sliderHead}>
              <Text variant="bodyStrong">{t('pedals.debounce')}</Text>
              <Text variant="numeric" color="textSecondary">
                {t('pedals.ms', { ms: debounceDraft })}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary" style={styles.hint}>
              {t('pedals.debounceHint')}
            </Text>
            <Slider
              value={debounceDraft}
              min={100}
              max={400}
              step={25}
              onChange={setDebounceDraft}
              onCommit={setDebounceMs}
              label={t('pedals.debounce')}
              formatValue={v => t('pedals.ms', { ms: v })}
            />
          </View>
          <Divider inset={space.lg} />
          <ListRow
            icon="vibrate"
            title={t('reading.volumeKeys')}
            subtitle={t('reading.volumeKeysHint')}
            trailing={<Switch value={volumeKeys} onValueChange={setVolumeKeys} label={t('reading.volumeKeys')} />}
          />
        </View>

        <View style={[styles.note, { backgroundColor: colors.surfaceSunken }]}>
          <Icon name="keyboard" size={22} color="textSecondary" />
          <View style={styles.noteText}>
            <Text variant="bodyStrong">{t('pedals.keyboardTitle')}</Text>
            <Text variant="caption" color="textSecondary">
              {t('pedals.keyboardBody')}
            </Text>
          </View>
        </View>
      </View>

      <Sheet visible={assigning !== null} onClose={() => setAssigning(null)} title={t('pedals.assignTitle')}>
        <View style={styles.assign}>
          <View style={[styles.assignIcon, { backgroundColor: colors.accentContainer }]}>
            <Icon name="pedal" size={40} color="onAccentContainer" />
          </View>
          <Text variant="titleM" style={styles.center}>
            {assigning ? t('pedals.pressFor', { action: t(`pedals.actions.${assigning}`) }) : ''}
          </Text>
          <Text variant="body" color="textSecondary" style={styles.center}>
            {t('pedals.assignBody')}
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text variant="overline" color="textSecondary" style={styles.section}>
      {title.toUpperCase()}
    </Text>
  );
}

/** Keyboard-class external devices, kept current as pedals connect and disconnect. */
export function useConnectedDevices(): InputDeviceInfo[] {
  const [devices, setDevices] = useState<InputDeviceInfo[]>(() => [...NativeKeyEvents.getConnectedDevices()]);
  useEffect(() => {
    const refresh = () => setDevices([...NativeKeyEvents.getConnectedDevices()]);
    const a = NativeKeyEvents.onDeviceAdded(refresh);
    const r = NativeKeyEvents.onDeviceRemoved(refresh);
    return () => {
      a.remove();
      r.remove();
    };
  }, []);
  return devices;
}

const styles = StyleSheet.create({
  column: { maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: space.xl },
  section: { marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  padded: { padding: space.lg },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.md, gap: space.sm },
  actionText: { flex: 1, gap: space.sm },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { marginTop: 2, marginBottom: space.sm },
  note: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, marginTop: space.xl },
  noteText: { flex: 1, gap: 2 },
  assign: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xxl },
  assignIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
