import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type OpenedDocument = {
  docId: string;
  pageCount: number;
  /** Flattened [w0, h0, w1, h1, …] in PDF points. */
  pageSizes: number[];
  /** Time to open + read all page sizes, ms. */
  openMs: number;
};

export type RendererStats = {
  entries: number;
  bytes: number;
  pooled: number;
  pooledBytes: number;
  maxBytes: number;
  openDocuments: number;
};

export type TestPdf = { name: string; path: string; bytes: number };

/** android/.../renderer/ScoreRendererModule.kt */
export interface Spec extends TurboModule {
  /** Opens a PDF (off the main thread). Rejects with code E_OPEN for unreadable/corrupt files. */
  open(path: string): Promise<OpenedDocument>;
  /** Cancels pending renders, then closes safely on the document's render thread. */
  close(docId: string): void;
  getStats(): RendererStats;
  clearCache(): void;
  /** Native monotonic clock (SystemClock.elapsedRealtime), ms — to time JS → pixel on one clock. */
  nowMs(): number;
  /** Dev: PDFs pushed by scripts/push-test-pdfs.sh into files/test-pdfs. */
  listTestPdfs(): Promise<TestPdf[]>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ScoreRenderer');
