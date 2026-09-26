import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconButton, Text, type Anchor } from '@/ui/components';
import type { IconName } from '@/ui/icons';
import { space } from '@/ui/theme';

export type TopBarAction = {
  key: string;
  icon: IconName;
  label: string;
  selected?: boolean;
  /** Receives the button's window rect so menus can anchor to it. */
  onPress: (anchor: Anchor) => void;
};

type Props = {
  title: string;
  composer: string | null;
  onBack: () => void;
  actions: TopBarAction[];
};

function AnchoredIconButton({ action }: { action: TopBarAction }) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const press = () => {
    if (ref.current) ref.current.measureInWindow((x, y, width, height) => action.onPress({ x, y, width, height }));
    else action.onPress({ x: 0, y: 0, width: 0, height: 0 });
  };
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon={action.icon} label={action.label} selected={action.selected} onPress={press} />
    </View>
  );
}

export function ReaderTopBar({ title, composer, onBack, actions }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      <IconButton icon="arrow-left" label={t('common.back')} onPress={onBack} />
      <View style={styles.titles} accessible accessibilityRole="header">
        <Text variant="titleM" numberOfLines={1}>
          {title}
        </Text>
        {composer ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {composer}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actions.map(a => (
          <AnchoredIconButton key={a.key} action={a} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs, minHeight: 60 },
  titles: { flex: 1, paddingHorizontal: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
