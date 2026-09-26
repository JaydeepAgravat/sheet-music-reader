/**
 * Design Showcase (dev only). The Phase 1 review surface: every token and component, live,
 * in the current theme and font scale. Strings here are intentionally not translated.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePref, type ThemeMode } from '@/data/prefs';
import { haptic, type HapticKind } from '@/platform/haptics';
import {
  Banner,
  Button,
  Chip,
  Dialog,
  Divider,
  EmptyState,
  IconButton,
  ListRow,
  ProgressPill,
  ScoreCard,
  SearchBar,
  SegmentedControl,
  Sheet,
  Skeleton,
  Slider,
  Switch,
  Text,
  TextField,
} from '@/ui/components';
import { showSnackbar, showToast } from '@/ui/feedback/store';
import { Icon } from '@/ui/icons';
import { glyphs, type IconName } from '@/ui/icons/glyphs';
import { EmptyCollectionsArt, EmptyLibraryArt, EmptySetlistsArt } from '@/ui/illustrations/Illustrations';
import { breakpoints, inkPresets, radius, space, typography, useTheme, type ColorTokens, type TypographyRole } from '@/ui/theme';

export function ShowcaseScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [mode, setMode] = usePref('themeMode');
  const gutter = width >= breakpoints.expanded ? space.xxl : width >= breakpoints.medium ? space.xl : space.lg;

  return (
    <View style={[styles.fill, { backgroundColor: colors.canvas }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm, paddingHorizontal: gutter - space.sm, borderBottomColor: colors.borderSubtle }]}>
        <IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />
        <Text variant="titleM" style={styles.fill} numberOfLines={1}>
          Design showcase
        </Text>
        <View style={styles.themeSwitch}>
          <SegmentedControl<ThemeMode>
            iconOnly
            value={mode}
            onChange={setMode}
            segments={[
              { value: 'system', label: 'System theme', icon: 'circle-half' },
              { value: 'light', label: 'Light theme', icon: 'sun' },
              { value: 'dark', label: 'Dark theme', icon: 'moon' },
            ]}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.xxxl }}>
        <View style={styles.column}>
          <Colors />
          <Typography />
          <Icons />
          <Buttons />
          <Controls />
          <Inputs />
          <Lists />
          <Feedback />
          <Cards />
          <Empties />
          <Haptics />
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="accent">
        {title.toUpperCase()}
      </Text>
      {note && (
        <Text variant="caption" color="textSecondary" style={styles.note}>
          {note}
        </Text>
      )}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const Row = ({ children, gap = space.md }: { children: React.ReactNode; gap?: number }) => (
  <View style={[styles.row, { gap }]}>{children}</View>
);

/* ---------- Colour ---------- */

const swatchGroups: { label: string; keys: (keyof ColorTokens)[] }[] = [
  { label: 'Surfaces', keys: ['canvas', 'surface', 'surfaceRaised', 'surfaceSunken', 'inverseSurface'] },
  { label: 'Text', keys: ['textPrimary', 'textSecondary', 'textTertiary'] },
  { label: 'Accent', keys: ['accent', 'onAccent', 'accentContainer', 'onAccentContainer', 'inverseAccent'] },
  { label: 'Status & lines', keys: ['danger', 'dangerContainer', 'success', 'borderSubtle', 'borderStrong'] },
];

function Colors() {
  const { colors } = useTheme();
  return (
    <Section title="Colour" note="Semantic tokens. Every text pair passes WCAG AA (npm run check:contrast).">
      {swatchGroups.map(g => (
        <View key={g.label} style={styles.swatchGroup}>
          <Text variant="labelSmall" color="textSecondary">
            {g.label}
          </Text>
          <View style={styles.wrap}>
            {g.keys.map(k => (
              <View key={k} style={styles.swatch}>
                <View style={[styles.swatchChip, { backgroundColor: colors[k], borderColor: colors.borderSubtle }]} />
                <Text variant="caption" numberOfLines={1}>
                  {k}
                </Text>
                <Text variant="caption" color="textTertiary" numberOfLines={1}>
                  {colors[k].toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={styles.swatchGroup}>
        <Text variant="labelSmall" color="textSecondary">
          Ink presets (on paper)
        </Text>
        <View style={[styles.inkPaper, { borderColor: colors.borderSubtle }]}>
          {Object.entries(inkPresets).map(([name, ink]) => (
            <View key={name} style={styles.inkItem}>
              <View style={[styles.inkStroke, { backgroundColor: ink.color, opacity: ink.opacity, height: name === 'highlighter' ? 14 : 4 }]} />
              <Text variant="caption" style={{ color: '#5F5B54' }}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Section>
  );
}

/* ---------- Type ---------- */

const typeSamples: { role: TypographyRole; sample: string }[] = [
  { role: 'display', sample: 'Your music, ready.' },
  { role: 'titleL', sample: 'Library' },
  { role: 'titleM', sample: 'Clair de Lune' },
  { role: 'titleS', sample: 'Gymnopédie No. 1' },
  { role: 'body', sample: 'Bring in your PDFs from Files, Drive or any folder.' },
  { role: 'bodyStrong', sample: 'Haptic feedback' },
  { role: 'label', sample: 'Import' },
  { role: 'labelSmall', sample: 'Collections' },
  { role: 'caption', sample: 'Claude Debussy · 5 pages' },
  { role: 'overline', sample: 'RECENTLY PLAYED' },
  { role: 'numeric', sample: 'p. 12 / 148' },
];

function Typography() {
  return (
    <Section title="Typography" note="Source Serif 4 (optical sizes) for titles · Inter for UI. Try 200% font size in Android settings.">
      {typeSamples.map(({ role, sample }) => (
        <View key={role} style={styles.typeRow}>
          <Text variant="caption" color="textTertiary" style={styles.typeMeta}>
            {role} · {typography[role].fontSize}
          </Text>
          <Text variant={role} style={styles.fill}>
            {sample}
          </Text>
        </View>
      ))}
      <View style={styles.typeRow}>
        <Text variant="caption" color="textTertiary" style={styles.typeMeta}>
          ja fallback
        </Text>
        <Text variant="body" style={styles.fill}>
          楽譜はまだありません — ライブラリ
        </Text>
      </View>
      <View style={styles.typeRow}>
        <Text variant="caption" color="textTertiary" style={styles.typeMeta}>
          Bravura
        </Text>
        <Text style={{ fontFamily: 'Bravura', fontSize: 34, lineHeight: 48 }}>{'\uE050  \uE062  \uE0A4  \uE4C0  \uE520  \uE521\uE522  \uE522'}</Text>
      </View>
    </Section>
  );
}

/* ---------- Icons ---------- */

function Icons() {
  const [fill, setFill] = useState(false);
  const names = Object.keys(glyphs) as IconName[];
  return (
    <Section title={`Icons · ${names.length}`} note="Phosphor Regular for idle, Fill for active. Custom mode icons (page-*, pedal) on the same grid.">
      <View style={styles.iconToggle}>
        <Text variant="label">Fill weight</Text>
        <Switch value={fill} onValueChange={setFill} label="Fill weight" />
      </View>
      <View style={styles.wrap}>
        {names.map(n => (
          <View key={n} style={styles.iconCell} accessible accessibilityLabel={n}>
            <Icon name={n} weight={fill ? 'fill' : 'regular'} />
            <Text variant="caption" color="textTertiary" numberOfLines={1} style={styles.iconName}>
              {n}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ---------- Buttons ---------- */

function Buttons() {
  const [loading, setLoading] = useState(false);
  return (
    <Section title="Buttons" note="48dp minimum height. Ripple tuned per variant.">
      <Row>
        <Button label="Primary" onPress={() => {}} />
        <Button label="Tonal" variant="tonal" onPress={() => {}} />
        <Button label="Secondary" variant="secondary" onPress={() => {}} />
        <Button label="Ghost" variant="ghost" onPress={() => {}} />
        <Button label="Delete" variant="danger" icon="trash" onPress={() => {}} />
      </Row>
      <Row>
        <Button label="Import scores" icon="tray-arrow-down" size="lg" onPress={() => {}} />
        <Button
          label="Save"
          loading={loading}
          onPress={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1500);
          }}
        />
        <Button label="Disabled" disabled onPress={() => {}} />
      </Row>
      <Button label="Block button" variant="tonal" block onPress={() => {}} />
    </Section>
  );
}

/* ---------- Controls ---------- */

function Controls() {
  const [mode, setMode] = useState<'single' | 'two' | 'half'>('single');
  const [on, setOn] = useState(true);
  const [chips, setChips] = useState<Record<string, boolean>>({ Favourites: true });
  const [split, setSplit] = useState(0.5);
  const [debounce, setDebounce] = useState(200);
  const [tool, setTool] = useState<IconName>('pencil-simple');
  return (
    <Section title="Controls">
      <Row gap={space.xs}>
        {(['pencil-simple', 'highlighter', 'eraser'] as IconName[]).map(i => (
          <IconButton key={i} icon={i} label={i} selected={tool === i} onPress={() => setTool(i)} />
        ))}
        <IconButton icon="arrow-counter-clockwise" label="Undo" onPress={() => {}} />
        <IconButton icon="arrow-clockwise" label="Redo" disabled />
        <IconButton icon="dots-three-vertical" label="More" variant="tonal" onPress={() => {}} />
      </Row>
      <Row gap={space.sm}>
        {['Favourites', 'Jazz', 'Piano'].map(c => (
          <Chip key={c} label={c} selected={!!chips[c]} onPress={() => setChips(s => ({ ...s, [c]: !s[c] }))} />
        ))}
        <Chip label="Composer" dropdown count={2} selected onPress={() => {}} />
        <Chip label="Key" dropdown onPress={() => {}} />
      </Row>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        segments={[
          { value: 'single', label: 'Single', icon: 'page-single' as IconName },
          { value: 'two', label: 'Two-up', icon: 'page-two-up' as IconName },
          { value: 'half', label: 'Half-page', icon: 'page-half' as IconName },
        ]}
      />
      <ListRow title="Keep screen awake" subtitle="While a score is open" trailing={<Switch value={on} onValueChange={setOn} label="Keep screen awake" />} />
      <View>
        <Text variant="label">Half-page split · {Math.round(split * 100)}%</Text>
        <Slider value={split} onChange={setSplit} min={0.3} max={0.7} label="Half-page split" formatValue={v => `${Math.round(v * 100)}%`} />
      </View>
      <View>
        <Text variant="label">Pedal debounce · {debounce} ms (stepped, haptic ticks)</Text>
        <Slider value={debounce} onChange={setDebounce} min={100} max={400} step={25} label="Pedal debounce" formatValue={v => `${v} ms`} />
      </View>
    </Section>
  );
}

/* ---------- Inputs ---------- */

function Inputs() {
  const [q, setQ] = useState('Debussy');
  const [title, setTitle] = useState('Clair de Lune');
  return (
    <Section title="Inputs" note="Labels always visible; focus ring in accent.">
      <SearchBar value={q} onChangeText={setQ} placeholder="Search scores, composers, tags" size="lg" />
      <TextField label="Title" value={title} onChangeText={setTitle} hint="Shown on the cover and in search" />
      <TextField label="Tempo (BPM)" value="abc" error="Enter a number between 20 and 400" keyboardType="number-pad" />
    </Section>
  );
}

/* ---------- Lists ---------- */

function Lists() {
  const { colors } = useTheme();
  return (
    <Section title="List rows">
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        <ListRow icon="keyboard" title="Pedals" subtitle="AirTurn DIGIT III · connected" chevron onPress={() => {}} />
        <Divider inset={66} />
        <ListRow icon="archive" title="Backup" subtitle="Last backup 12 days ago" chevron onPress={() => {}} />
        <Divider inset={66} />
        <ListRow icon="globe-simple" title="Language" trailing={<Text color="textSecondary">English</Text>} chevron onPress={() => {}} />
        <Divider inset={66} />
        <ListRow icon="trash" title="Empty trash" destructive onPress={() => {}} />
      </View>
    </Section>
  );
}

/* ---------- Feedback ---------- */

function Feedback() {
  const [banner, setBanner] = useState(true);
  const [progress, setProgress] = useState(0.1);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setProgress(p => (p >= 1 ? 0.05 : Math.min(1, p + 0.07))), 600);
    return () => clearInterval(t);
  }, []);

  return (
    <Section title="Feedback & overlays" note="Snackbar: swipe sideways to dismiss. Sheet: drag the handle down, tap the scrim or press back.">
      {banner ? (
        <Banner
          icon="archive"
          message="Your library lives only on this tablet. Back it up to a folder or Drive?"
          action={{ label: 'Back up now', onPress: () => setBanner(false) }}
          onDismiss={() => setBanner(false)}
        />
      ) : (
        <Button label="Show banner again" variant="ghost" onPress={() => setBanner(true)} />
      )}
      <ProgressPill label={`Importing ${Math.min(24, Math.ceil(progress * 24))} of 24`} progress={progress} />
      <Row>
        <Button
          label="Snackbar + Undo"
          variant="secondary"
          onPress={() => showSnackbar({ message: 'Deleted 3 scores', action: { label: 'Undo', onPress: () => showToast({ message: 'Restored 3 scores', icon: 'check' }) } })}
        />
        <Button label="Toast pill" variant="secondary" onPress={() => showToast({ message: 'Resumed at p. 7', icon: 'book-open' })} />
        <Button label="Sheet" variant="secondary" onPress={() => setSheet(true)} />
        <Button label="Dialog" variant="secondary" onPress={() => setDialog(true)} />
      </Row>
      <View style={styles.skeletons}>
        <Skeleton width={96} height={120} rounded={radius.sm} />
        <View style={[styles.fill, { gap: space.sm }]}>
          <Skeleton height={16} width="70%" />
          <Skeleton height={12} width="45%" />
          <Skeleton height={12} width="30%" />
        </View>
      </View>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Page filter">
        <View style={styles.sheetBody}>
          {(['Original', 'Paper', 'Sepia', 'Night', 'High contrast'] as const).map((f, i) => (
            <ListRow key={f} title={f} trailing={i === 0 ? <Icon name="check" color="accent" /> : undefined} onPress={() => setSheet(false)} />
          ))}
        </View>
      </Sheet>
      <Dialog
        visible={dialog}
        title="Move 12 scores to Trash?"
        body="You can restore them from Trash for 30 days."
        cancel={{ label: 'Cancel', onPress: () => setDialog(false) }}
        confirm={{
          label: 'Move to Trash',
          variant: 'danger',
          onPress: () => {
            setDialog(false);
            showSnackbar({ message: 'Moved 12 scores to Trash', action: { label: 'Undo', onPress: () => {} } });
          },
        }}
      />
    </Section>
  );
}

/* ---------- Cards ---------- */

const demoScores = [
  { title: 'Clair de Lune', composer: 'Claude Debussy', favorite: true, annotated: true },
  { title: 'Autumn Leaves', composer: 'Joseph Kosma', inSetlist: true },
  { title: 'Prelude in C major, BWV 846', composer: 'J. S. Bach', annotated: true },
  { title: 'Gymnopédie No. 1', composer: 'Erik Satie', favorite: true },
  { title: 'Amazing Grace', composer: 'Traditional', inSetlist: true },
  { title: 'The Entertainer', composer: 'Scott Joplin' },
];

function Cards() {
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const cols = width >= 1200 ? 6 : width >= breakpoints.expanded ? 5 : width >= breakpoints.medium ? 4 : 2;
  return (
    <Section title="Score cards" note="Cover = top of page 1. Long-press to select. Badges only when relevant.">
      <View style={styles.cardGrid}>
        {demoScores.map(s => (
          <View key={s.title} style={{ width: `${100 / cols}%` }}>
            <ScoreCard
              {...s}
              selected={selected === s.title}
              onPress={() => setSelected(null)}
              onLongPress={() => {
                haptic('longPress');
                setSelected(s.title);
              }}
            />
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ---------- Empty states ---------- */

function Empties() {
  const { width } = useWindowDimensions();
  const wide = width >= breakpoints.expanded;
  return (
    <Section title="Empty states">
      <View style={wide ? styles.row : undefined}>
        <View style={wide && styles.fill}>
          <EmptyState art={<EmptyLibraryArt size={160} />} title="No scores yet" body="Bring in your PDFs from Files, Drive or any folder." action={{ label: 'Import your first score', icon: 'tray-arrow-down', onPress: () => {} }} />
        </View>
        <View style={wide && styles.fill}>
          <EmptyState art={<EmptySetlistsArt size={160} />} title="No setlists yet" body="Line up the songs for your next gig." />
        </View>
        <View style={wide && styles.fill}>
          <EmptyState art={<EmptyCollectionsArt size={160} />} title="No collections yet" body="Group scores the way you think about them." />
        </View>
      </View>
    </Section>
  );
}

/* ---------- Haptics ---------- */

const hapticKinds: HapticKind[] = ['tick', 'confirm', 'reject', 'longPress', 'dragStart', 'drop', 'boundary'];

function Haptics() {
  return (
    <Section title="Haptics" note="Feel each semantic haptic. Respects the in-app toggle and Android touch-feedback setting.">
      <Row gap={space.sm}>
        {hapticKinds.map(k => (
          <Button key={k} label={k} variant="secondary" onPress={() => haptic(k)} />
        ))}
      </Row>
    </Section>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  themeSwitch: { width: 150 },
  column: { maxWidth: 1080, width: '100%', alignSelf: 'center' },
  section: { paddingTop: space.xxl },
  note: { marginTop: space.xs },
  sectionBody: { marginTop: space.lg, gap: space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatchGroup: { gap: space.sm },
  swatch: { width: 124, gap: 2 },
  swatchChip: { height: 52, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth * 2, marginBottom: space.xs },
  inkPaper: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, padding: space.lg, borderRadius: radius.md, backgroundColor: '#FFFEFB', borderWidth: StyleSheet.hairlineWidth * 2 },
  inkItem: { gap: space.sm, width: 110 },
  inkStroke: { width: 96, borderRadius: 7 },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.lg },
  typeMeta: { width: 104 },
  iconToggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconCell: { width: 84, alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  iconName: { maxWidth: 80 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  skeletons: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  sheetBody: { paddingBottom: space.sm },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs, rowGap: space.md },
});
