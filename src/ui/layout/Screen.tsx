import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IconButton, Text } from '@/ui/components';
import { breakpoints, space, useTheme } from '@/ui/theme';

type Props = {
  title: string;
  /** Right side of the title row (icon buttons). */
  actions?: React.ReactNode;
  /** Pinned under the title (e.g. search). */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** Scrollable body (default) or a fixed body that manages its own scrolling (lists). */
  scroll?: boolean;
  /** Vertically centre short content (empty states), nudged slightly above true centre. */
  centerContent?: boolean;
  /** Pushed (non-tab) screens: shows a back button before the title. */
  onBack?: () => void;
};

/** Standard top-level screen: large serif title, generous gutters that widen on tablets, content capped for readability. */
export function Screen({ title, actions, header, children, scroll = true, centerContent = false, onBack }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const gutter = width >= breakpoints.expanded ? space.xxl : width >= breakpoints.medium ? space.xl : space.lg;

  const top = (
    <View style={{ paddingHorizontal: gutter, paddingTop: insets.top + space.lg }}>
      <View style={styles.titleRow}>
        {onBack && (
          <View style={styles.back}>
            <IconButton icon="arrow-left" label={t('common.back')} onPress={onBack} />
          </View>
        )}
        <Text variant="titleL" accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {actions && <View style={styles.actions}>{actions}</View>}
      </View>
      {header && <View style={styles.header}>{header}</View>}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      {top}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: gutter, paddingBottom: space.xxxl }, centerContent && styles.centered]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, { paddingHorizontal: gutter }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  title: { flex: 1 },
  back: { marginLeft: -space.md, marginRight: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: -space.sm },
  header: { marginTop: space.md, marginBottom: space.sm },
  // Optical centre: extra bottom padding lifts content a little above the geometric middle.
  centered: { flexGrow: 1, justifyContent: 'center', paddingBottom: '12%' },
});
