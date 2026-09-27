import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import NativeAppSystem from '@/specs/NativeAppSystem';
import { localIsoDate, type Setlist } from '@/data/repos/setlists';
import { dateBucket, formatEventDate } from '@/domain/setlists/dates';
import { Button, Dialog, IconButton, Surface, Text, TextField, type Anchor } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

type ViewRef = React.ComponentRef<typeof View>;

/** "Today" / "Tomorrow" / "Sat 4 Oct", or null without a date. */
export function useEventDateLabel(): (date: string | null) => string | null {
  const { t, i18n } = useTranslation();
  const today = localIsoDate();
  return date => {
    if (!date) return null;
    const b = dateBucket(date, today);
    if (b === 'today') return t('setlists.today');
    if (b === 'tomorrow') return t('setlists.tomorrow');
    return formatEventDate(date, today, i18n.language);
  };
}

/** 2×2 mosaic of the first covers (paper tiles when there are fewer). */
export function CoverMosaic({ covers, size }: { covers: string[]; size: number }) {
  const { colors } = useTheme();
  // Two columns + a 2px gutter inside a hairline border, rounded down so the row never wraps.
  const inner = size - 2 * StyleSheet.hairlineWidth;
  const cell = Math.floor((inner - 2) / 2);
  const cellH = Math.floor((inner * 1.25 - 2) / 2);
  return (
    <View style={[styles.mosaic, { width: size, height: size * 1.25, backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle }]}>
      {[0, 1, 2, 3].map(i => {
        const uri = covers[i];
        return (
          <View key={i} style={[styles.cell, { width: cell, height: cellH, backgroundColor: uri ? '#FFFEFB' : colors.surface }]}>
            {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function SetlistCard({
  setlist,
  onOpen,
  onPlay,
  onMore,
}: {
  setlist: Setlist;
  onOpen: () => void;
  onPlay: () => void;
  onMore: (a: Anchor) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dateLabel = useEventDateLabel()(setlist.eventDate);
  const bucket = dateBucket(setlist.eventDate, localIsoDate());
  const moreRef = useRef<ViewRef>(null);
  const soon = bucket === 'today' || bucket === 'tomorrow';
  const meta = [
    t('setlists.songs', { count: setlist.itemCount }),
    setlist.missingCount ? t('setlists.missingCount', { count: setlist.missingCount }) : null,
  ].filter(Boolean);
  return (
    <Surface
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[setlist.name, dateLabel, ...meta].filter(Boolean).join(', ')}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
    >
      <CoverMosaic covers={setlist.coverPaths} size={64} />
      <View style={styles.cardText}>
        <Text variant="titleS" numberOfLines={2}>
          {setlist.name}
        </Text>
        {dateLabel && (
          <View style={[styles.datePill, { backgroundColor: soon ? colors.accentContainer : colors.surfaceSunken }]}>
            <Icon name="calendar-blank" size={14} color={soon ? 'onAccentContainer' : 'textSecondary'} weight={soon ? 'fill' : 'regular'} />
            <Text variant="labelSmall" color={soon ? 'onAccentContainer' : 'textSecondary'}>
              {dateLabel}
            </Text>
          </View>
        )}
        <Text variant="caption" color={setlist.missingCount ? 'danger' : 'textSecondary'} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      </View>
      <View style={styles.cardActions}>
        <IconButton icon="play" label={t('setlists.play')} variant="tonal" onPress={onPlay} disabled={setlist.itemCount - setlist.missingCount === 0} />
        <View ref={moreRef} collapsable={false}>
          <IconButton
            icon="dots-three-vertical"
            label={t('common.moreOptions')}
            size="sm"
            onPress={() => moreRef.current?.measureInWindow((x, y, width, height) => onMore({ x, y, width, height }))}
          />
        </View>
      </View>
    </Surface>
  );
}

/** Create / rename: name + optional event date (system date picker). */
export function SetlistNameDialog({
  visible,
  title,
  confirmLabel,
  initialName,
  initialDate,
  withDate,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  initialName: string;
  initialDate: string | null;
  withDate: boolean;
  onSubmit: (name: string, date: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [date, setDate] = useState<string | null>(initialDate);
  const label = useEventDateLabel()(date);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setDate(initialDate);
    }
  }, [visible, initialName, initialDate]);

  const pick = async () => {
    const picked = await NativeAppSystem.pickDate(date ?? '', date ? t('setlists.noDate') : '');
    if (picked === null) return;
    setDate(picked || null);
  };

  const submit = () => onSubmit(name.trim() || t('setlists.untitled'), date);

  return (
    <Dialog visible={visible} title={title} confirm={{ label: confirmLabel, onPress: submit }} cancel={{ label: t('common.cancel'), onPress: onCancel }}>
      <View style={styles.dialogBody}>
        <TextField
          label={t('setlists.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('setlists.namePlaceholder')}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {withDate && (
          <View style={styles.dateRow}>
            <Button label={label ?? t('setlists.setDate')} icon="calendar-blank" variant="secondary" onPress={pick} />
          </View>
        )}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-between', justifyContent: 'space-between', borderRadius: radius.sm, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cell: { overflow: 'hidden' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.md,
    paddingLeft: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardText: { flex: 1, gap: space.xs, alignItems: 'flex-start' },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  dialogBody: { gap: space.md },
  dateRow: { flexDirection: 'row' },
});
