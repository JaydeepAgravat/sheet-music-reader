/**
 * Renderer Lab (dev only): exercise and benchmark the native page renderer against the test
 * corpus (scripts/push-test-pdfs.sh). Phase 2 acceptance numbers come from here and from the
 * Kotlin instrumentation benchmark. Strings are intentionally not translated.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NativeScoreRenderer, { type OpenedDocument, type RendererStats, type TestPdf } from '@/specs/NativeScoreRenderer';
import { ScorePage, type PageFilter, type PageShownEvent } from '@/features/reader/ScorePage';
import { reportToHost } from '@/dev/reportToHost';
import { summarize } from '@/dev/stats';
import { Button, Chip, IconButton, SegmentedControl, Text } from '@/ui/components';
import { radius, space, useTheme } from '@/ui/theme';

type LayoutMode = 'SINGLE' | 'HALF' | 'TWO_UP';
type Doc = OpenedDocument & { name: string };

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const filters: PageFilter[] = ['ORIGINAL', 'PAPER', 'SEPIA', 'NIGHT', 'CONTRAST'];

export function RendererLabScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [files, setFiles] = useState<TestPdf[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [page, setPage] = useState(0);
  const [layout, setLayout] = useState<LayoutMode>('SINGLE');
  const [filter, setFilter] = useState<PageFilter>('ORIGINAL');
  const [status, setStatus] = useState('Pick a test PDF');
  const [result, setResult] = useState<string>('');
  const [stats, setStats] = useState<RendererStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestedAt, setRequestedAt] = useState(0);

  const waiter = useRef<{ page: number; resolve: (e: PageShownEvent & { jsMs: number }) => void; t0: number } | null>(null);
  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;

  useEffect(() => {
    NativeScoreRenderer.listTestPdfs().then(setFiles);
    const t = setInterval(() => setStats(NativeScoreRenderer.getStats()), 500);
    return () => {
      clearInterval(t);
      if (docRef.current) NativeScoreRenderer.close(docRef.current.docId);
    };
  }, []);

  const openFile = useCallback(async (f: TestPdf) => {
    if (docRef.current) NativeScoreRenderer.close(docRef.current.docId);
    setDoc(null);
    setPage(0);
    try {
      const d = await NativeScoreRenderer.open(f.path);
      setDoc({ ...d, name: f.name });
      setStatus(`${f.name}: ${d.pageCount} pages, opened in ${d.openMs.toFixed(0)} ms`);
    } catch (e) {
      setStatus(`${f.name}: ${(e as Error).message}`);
    }
  }, []);

  const step = layout === 'TWO_UP' ? 2 : 1;
  const lastPage = doc ? doc.pageCount - 1 : 0;
  const go = useCallback((delta: number) => setPage(p => Math.min(Math.max(0, p + delta), lastPage)), [lastPage]);

  const onShown = useCallback((e: PageShownEvent) => {
    const w = waiter.current;
    if (w && e.page === w.page) {
      waiter.current = null;
      w.resolve({ ...e, jsMs: performance.now() - w.t0 });
    }
  }, []);

  const turnAndWait = (target: number) =>
    new Promise<(PageShownEvent & { jsMs: number }) | null>(resolve => {
      const timeout = setTimeout(() => {
        waiter.current = null;
        resolve(null);
      }, 4000);
      setRequestedAt(NativeScoreRenderer.nowMs());
      waiter.current = {
        page: target,
        t0: performance.now(),
        resolve: e => {
          clearTimeout(timeout);
          resolve(e);
        },
      };
      setPage(target);
    });

  /** Human-paced pedal turns: measures cached-turn latency (the ±2 prefetch has time to work). */
  const runPaced = async (turns: number, intervalMs: number) => {
    if (!doc) return;
    setBusy(true);
    const native: number[] = [];
    const js: number[] = [];
    const e2e: number[] = [];
    let cached = 0;
    let timeouts = 0;
    let p = page;
    let dir = 1;
    for (let i = 0; i < turns; i++) {
      if (p + dir * step > lastPage || p + dir * step < 0) dir = -dir;
      p += dir * step;
      const e = await turnAndWait(p);
      if (!e) timeouts++;
      else {
        native.push(e.latencyMs);
        js.push(e.jsMs);
        if (e.endToEndMs > 0) e2e.push(e.endToEndMs);
        if (e.fromCache) cached++;
      }
      if (i % 25 === 0) setStatus(`Paced: ${i + 1}/${turns}`);
      await sleep(intervalMs);
    }
    const report = {
      test: 'paced',
      file: doc.name,
      layout,
      turns,
      intervalMs,
      cachedRatio: +(cached / Math.max(1, native.length)).toFixed(3),
      timeouts,
      jsToPixel: summarize(e2e),
      nativeLatency: summarize(native),
      jsRoundtrip: summarize(js),
      stats: NativeScoreRenderer.getStats(),
    };
    finish(report);
  };

  /** Stress: turn every frame without waiting. Checks for OOM / crashes / leaks, not latency. */
  const runBurst = async (turns: number) => {
    if (!doc) return;
    setBusy(true);
    const t0 = performance.now();
    let p = page;
    let dir = 1;
    for (let i = 0; i < turns; i++) {
      if (p + dir > lastPage || p + dir < 0) dir = -dir;
      p += dir;
      setPage(p);
      await sleep(16);
      if (i % 50 === 0) setStatus(`Burst: ${i}/${turns}`);
    }
    await sleep(1500);
    finish({ test: 'burst', file: doc.name, turns, seconds: +((performance.now() - t0) / 1000).toFixed(1), stats: NativeScoreRenderer.getStats() });
  };

  /** Open → render first page → close, repeatedly; plus closes that race an in-flight render. */
  const runOpenClose = async (cycles: number) => {
    const f = files.find(x => x.name === doc?.name) ?? files[0];
    if (!f) return;
    setBusy(true);
    if (docRef.current) NativeScoreRenderer.close(docRef.current.docId);
    setDoc(null);
    const openMs: number[] = [];
    let failures = 0;
    for (let i = 0; i < cycles; i++) {
      try {
        const d = await NativeScoreRenderer.open(f.path);
        openMs.push(d.openMs);
        setPage(0);
        setDoc({ ...d, name: f.name });
        // Half the cycles close immediately (racing the render), half after the page is shown.
        await sleep(i % 2 === 0 ? 0 : 120);
        setDoc(null);
        NativeScoreRenderer.close(d.docId);
      } catch {
        failures++;
      }
      if (i % 10 === 0) setStatus(`Open/close: ${i}/${cycles}`);
    }
    await sleep(500);
    finish({ test: 'openClose', file: f.name, cycles, failures, openMs: summarize(openMs), stats: NativeScoreRenderer.getStats() });
  };

  const finish = (report: object) => {
    const text = JSON.stringify(report, null, 1);
    setResult(text);
    setStatus('Done');
    setBusy(false);
    reportToHost('renderer-bench', report);
  };

  const halfOrSingle = layout === 'HALF' ? 'HALF' : 'SINGLE';

  return (
    <View style={[styles.fill, { backgroundColor: '#0E0F11', paddingTop: insets.top }]}>
      <View style={styles.top}>
        <IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} color="onInverseSurface" />
        <ScrollView horizontal contentContainerStyle={styles.chips} showsHorizontalScrollIndicator={false}>
          {files.length === 0 && <Text color="textTertiary">No test PDFs — run scripts/push-test-pdfs.sh</Text>}
          {files.map(f => (
            <Chip key={f.name} label={`${f.name} · ${(f.bytes / 1048576).toFixed(1)} MB`} selected={doc?.name === f.name} onPress={() => openFile(f)} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.stage}>
        {doc &&
          (layout === 'TWO_UP' ? (
            <View style={styles.row}>
              <ScorePage docId={doc.docId} page={page} filter={filter} turnRequestedAtMs={requestedAt} onPageShown={onShown} style={styles.fill} />
              {page + 1 <= lastPage && <ScorePage docId={doc.docId} page={page + 1} filter={filter} style={styles.fill} />}
            </View>
          ) : (
            <ScorePage docId={doc.docId} page={page} mode={halfOrSingle} filter={filter} turnRequestedAtMs={requestedAt} onPageShown={onShown} style={styles.fill} />
          ))}
        {/* Tap zones: outer 30% turn, centre does nothing here. */}
        <View style={StyleSheet.absoluteFill} pointerEvents={busy ? 'none' : 'box-none'}>
          <View style={styles.row}>
            <Pressable style={styles.zone} onPress={() => go(-step)} accessibilityLabel="Previous page" />
            <View style={styles.center} pointerEvents="none" />
            <Pressable style={styles.zone} onPress={() => go(step)} accessibilityLabel="Next page" />
          </View>
        </View>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.sm, backgroundColor: colors.surface }]}>
        <View style={styles.panelRow}>
          <Text variant="numeric">{doc ? `p. ${page + 1} / ${doc.pageCount}` : '—'}</Text>
          <Text variant="caption" color="textSecondary" style={styles.fill} numberOfLines={1}>
            {status}
          </Text>
          {stats && (
            <Text variant="caption" color="textSecondary">
              cache {stats.entries} · {(stats.bytes / 1048576).toFixed(0)}/{(stats.maxBytes / 1048576).toFixed(0)} MB · pool {stats.pooled} · docs {stats.openDocuments}
            </Text>
          )}
        </View>
        <View style={styles.panelRow}>
          <View style={styles.seg}>
            <SegmentedControl<LayoutMode>
              value={layout}
              onChange={setLayout}
              segments={[
                { value: 'SINGLE', label: 'Single' },
                { value: 'HALF', label: 'Half' },
                { value: 'TWO_UP', label: 'Two-up' },
              ]}
            />
          </View>
          {filters.map(f => (
            <Chip key={f} label={f.toLowerCase()} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
        <View style={styles.panelRow}>
          <Button label="500 paced turns" variant="tonal" disabled={!doc || busy} onPress={() => runPaced(500, 250)} />
          <Button label="500-turn burst" variant="tonal" disabled={!doc || busy} onPress={() => runBurst(500)} />
          <Button label="Open/close ×100" variant="tonal" disabled={files.length === 0 || busy} onPress={() => runOpenClose(100)} />
          <Button label="Clear cache" variant="ghost" onPress={() => NativeScoreRenderer.clearCache()} />
        </View>
        {!!result && (
          <ScrollView style={[styles.result, { backgroundColor: colors.surfaceSunken }]}>
            <Text variant="caption" style={styles.mono}>
              {result}
            </Text>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingRight: space.md },
  chips: { gap: space.sm, alignItems: 'center', paddingVertical: space.sm },
  stage: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  zone: { flex: 3 },
  center: { flex: 4 },
  panel: { padding: space.md, gap: space.sm, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  seg: { width: 300 },
  result: { maxHeight: 180, borderRadius: radius.sm, padding: space.sm },
  mono: { fontFamily: 'monospace' },
});
