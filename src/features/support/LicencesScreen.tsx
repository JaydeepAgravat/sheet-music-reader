import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Surface, Text } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { Screen } from '@/ui/layout/Screen';
import { minTouch, radius, space, useTheme } from '@/ui/theme';
import { loadLicenses, type LicenseGroupId, type LicenseItem } from './licenseData';

type Row =
  | { type: 'intro'; key: string }
  | { type: 'header'; key: string; group: LicenseGroupId }
  | { type: 'item'; key: string; item: LicenseItem; first: boolean; last: boolean; open: boolean };

const GROUP_TITLE = {
  fonts: 'support.licencesScreen.fonts',
  icons: 'support.licencesScreen.icons',
  libraries: 'support.licencesScreen.libraries',
} as const;

function subtitle(item: LicenseItem): string {
  return item.version ? `${item.license} · ${item.version}` : item.license;
}

const LicenceRow = React.memo(function LicenceRowImpl({
  row,
  text,
  onToggle,
}: {
  row: Extract<Row, { type: 'item' }>;
  text: string | null;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { item, first, last, open } = row;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
        first && styles.cardFirst,
        last && styles.cardLast,
        !last && {
          borderBottomColor: colors.borderSubtle,
          borderBottomWidth: StyleSheet.hairlineWidth * 2,
        },
      ]}
    >
      <Surface
        onPress={() => onToggle(item.id)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${item.name}, ${subtitle(item)}`}
        accessibilityHint={t(
          open ? 'support.licencesScreen.hideText' : 'support.licencesScreen.showText',
        )}
        style={styles.row}
      >
        <View style={styles.flex}>
          <Text variant="bodyStrong">{item.name}</Text>
          <Text variant="caption" color="textSecondary">
            {subtitle(item)}
          </Text>
        </View>
        <Icon name={open ? 'caret-up' : 'caret-down'} size={18} color="textTertiary" />
      </Surface>
      {open && text !== null && (
        <View style={[styles.textBox, { backgroundColor: colors.surfaceSunken }]}>
          {item.url ? (
            <Text variant="caption" color="textSecondary" selectable style={styles.url}>
              {item.url}
            </Text>
          ) : null}
          <Text variant="caption" color="textPrimary" selectable>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
});

/**
 * Fonts, icons and libraries with their licences (licenses.json, `npm run licenses`). Texts render
 * only when a row is expanded; FlashList keeps the ~70 rows cheap.
 */
export function LicencesScreen() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const data = useMemo(loadLicenses, []);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  // Same 720 dp reading column as the other settings screens, while the whole width still scrolls.
  const [side, setSide] = useState(0);

  const toggle = useCallback((id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ type: 'intro', key: 'intro' }];
    for (const g of data.groups) {
      if (!g.items.length) continue;
      out.push({ type: 'header', key: `h:${g.id}`, group: g.id });
      g.items.forEach((item, i) =>
        out.push({
          type: 'item',
          key: item.id,
          item,
          first: i === 0,
          last: i === g.items.length - 1,
          open: openIds.has(item.id),
        }),
      );
    }
    return out;
  }, [data, openIds]);

  return (
    <Screen title={t('support.licencesScreen.title')} onBack={() => nav.goBack()} scroll={false}>
      <View
        style={styles.fill}
        onLayout={e => setSide(Math.max(0, (e.nativeEvent.layout.width - MAX_COLUMN) / 2))}
      >
        <FlashList
          data={rows}
          keyExtractor={r => r.key}
          getItemType={r => (r.type === 'item' ? (r.open ? 'itemOpen' : 'item') : r.type)}
          contentContainerStyle={{
            paddingBottom: space.xxxl + insets.bottom,
            paddingHorizontal: side,
          }}
          renderItem={({ item: row }) => {
            if (row.type === 'intro') {
              return (
                <Text variant="body" color="textSecondary" style={styles.intro}>
                  {t('support.licencesScreen.intro')}
                </Text>
              );
            }
            if (row.type === 'header') {
              return (
                <Text
                  variant="overline"
                  color="textSecondary"
                  accessibilityRole="header"
                  style={styles.header}
                >
                  {t(GROUP_TITLE[row.group]).toUpperCase()}
                </Text>
              );
            }
            return (
              <LicenceRow
                row={row}
                text={row.open ? data.texts[row.item.textId] ?? '' : null}
                onToggle={toggle}
              />
            );
          }}
        />
      </View>
    </Screen>
  );
}

const MAX_COLUMN = 720;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  intro: { marginTop: space.xs, marginBottom: space.sm, marginLeft: space.xs },
  header: { marginTop: space.lg, marginBottom: space.sm, marginLeft: space.xs },
  card: {
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    borderRightWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  cardFirst: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cardLast: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouch + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
  },
  flex: { flex: 1, gap: 2 },
  textBox: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.md,
  },
  url: { marginBottom: space.sm },
});
