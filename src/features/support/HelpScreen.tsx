import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '@/app/RootNavigator';
import { Button, Divider, ListRow, Surface, Text } from '@/ui/components';
import { showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { Screen } from '@/ui/layout/Screen';
import { minTouch, radius, space, useTheme } from '@/ui/theme';
import { getAppInfo } from './appInfo';
import { deviceSummary } from './crashReport';
import { emailSupport, shareAppLog } from './share';

type FaqId = 'pedals' | 'drive' | 'files' | 'backup' | 'stylus';
const FAQ: readonly FaqId[] = ['pedals', 'drive', 'files', 'backup', 'stylus'];

function FaqItem({
  question,
  answer,
  open,
  onToggle,
  action,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <View>
      <Surface
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={question}
        style={styles.question}
      >
        <Text variant="bodyStrong" style={styles.flex}>
          {question}
        </Text>
        <Icon name={open ? 'caret-up' : 'caret-down'} size={18} color="textTertiary" />
      </Surface>
      {open && (
        <View style={styles.answer}>
          <Text variant="body" color="textSecondary">
            {answer}
          </Text>
          {action && <View style={styles.action}>{action}</View>}
        </View>
      )}
    </View>
  );
}

/** Help & feedback: short answers to the questions musicians actually ask, then a way to reach us. */
export function HelpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [open, setOpen] = useState<FaqId | null>(null);
  const group = [
    styles.group,
    { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
  ];

  const sendLog = () => {
    if (!shareAppLog(t('support.helpScreen.logSubject')))
      showToast({ message: t('support.shareFailed'), icon: 'warning-circle' });
  };

  return (
    <Screen title={t('support.helpScreen.title')} onBack={() => nav.goBack()}>
      <View style={styles.column}>
        <Text variant="overline" color="textSecondary" style={styles.section}>
          {t('support.helpScreen.faq').toUpperCase()}
        </Text>
        <View style={group}>
          {FAQ.map((id, i) => (
            <View key={id}>
              {i > 0 && <Divider inset={space.lg} />}
              <FaqItem
                question={t(`support.helpScreen.${id}Q`)}
                answer={t(`support.helpScreen.${id}A`)}
                open={open === id}
                onToggle={() => setOpen(open === id ? null : id)}
                action={
                  id === 'pedals' ? (
                    <Button
                      label={t('support.helpScreen.pedalsAction')}
                      variant="tonal"
                      icon="pedal"
                      onPress={() => nav.navigate('Pedals')}
                    />
                  ) : undefined
                }
              />
            </View>
          ))}
        </View>

        <Text variant="overline" color="textSecondary" style={styles.section}>
          {t('support.helpScreen.contact').toUpperCase()}
        </Text>
        <Text variant="body" color="textSecondary" style={styles.lead}>
          {t('support.helpScreen.contactBody')}
        </Text>
        <View style={group}>
          <ListRow
            icon="envelope-simple"
            title={t('support.helpScreen.email')}
            subtitle={t('support.helpScreen.emailHint')}
            onPress={() =>
              emailSupport(t('support.helpScreen.emailSubject'), t('support.helpScreen.emailBody'))
            }
          />
          <Divider inset={space.lg} />
          <ListRow
            icon="share-network"
            title={t('support.helpScreen.sendLog')}
            subtitle={t('support.helpScreen.sendLogHint')}
            onPress={sendLog}
          />
        </View>

        <Text
          variant="caption"
          color="textTertiary"
          align="center"
          style={styles.footer}
          selectable
        >
          {deviceSummary(getAppInfo())}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 720, width: '100%', alignSelf: 'center' },
  section: { marginTop: space.lg, marginBottom: space.sm, marginLeft: space.xs },
  lead: { marginBottom: space.md, marginLeft: space.xs },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouch + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  flex: { flex: 1 },
  answer: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  action: { marginTop: space.md, alignItems: 'flex-start' },
  footer: { marginTop: space.xl },
});
