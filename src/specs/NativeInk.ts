import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Ink (annotations). android/.../ink/*.
 *
 * Native owns drawing: ScorePageView (inkKey prop) captures stylus/finger input, smooths it, draws
 * the live stroke and every committed stroke of the pages it shows. The in-memory model of an
 * open score lives in native InkStore, keyed by inkKey (the score id). JS owns persistence
 * (SQLite) and undo/redo: it loads a score's strokes into native, persists what onInkEdit reports,
 * and applies undo/redo through addStrokes/removeStrokes.
 *
 * Coordinates: points are normalised to the source page (x, y in 0..1 of the page's width/height),
 * so ink survives zoom, page modes, rotation and future crop.
 */

export type InkStrokeWire = {
  id: string;
  page: CodegenTypes.Int32;
  /** PEN | HIGHLIGHTER (highlighter blends with multiply). */
  kind: string;
  /** ARGB as an unsigned 32-bit number (alpha = opacity). */
  color: CodegenTypes.Double;
  /** Stroke width in PDF points of the source page. */
  width: CodegenTypes.Double;
  /** Base64 of little-endian Float32 triples [x, y, pressure] (x, y normalised 0..1). */
  points: string;
};

export type InkToolConfig = {
  /** Annotate mode is on: fingers draw too (unless a stylus has been seen and fingerDraws is off). */
  annotating: boolean;
  /** A stylus draws even outside annotate mode (off in performance mode). */
  stylusDraws: boolean;
  /** In annotate mode, fingers draw even after a stylus has been seen. */
  fingerDraws: boolean;
  /** PEN | HIGHLIGHTER | ERASER */
  tool: string;
  color: CodegenTypes.Double;
  width: CodegenTypes.Double;
};

export type InkEditEvent = {
  inkKey: string;
  /** A finished stroke (at most one per event). */
  added: ReadonlyArray<InkStrokeWire>;
  /** Strokes removed by one eraser gesture (already gone from the screen). */
  removedIds: ReadonlyArray<string>;
};

export type StylusEvent = {
  /** STYLUS | ERASER */
  toolType: string;
};

export interface Spec extends TurboModule {
  /** Adds (or replaces, by id) strokes of an open score. Views showing their pages redraw. */
  addStrokes(inkKey: string, strokes: ReadonlyArray<InkStrokeWire>): void;
  removeStrokes(inkKey: string, ids: ReadonlyArray<string>): void;
  /** Drops the in-memory ink of a score (reader closed). */
  releaseInk(inkKey: string): void;
  setTool(config: InkToolConfig): void;
  /** A stylus has touched the screen since the app started. */
  hasSeenStylus(): boolean;

  readonly onInkEdit: CodegenTypes.EventEmitter<InkEditEvent>;
  /** First stylus contact of the app session (and after the pen's eraser end is first used). */
  readonly onStylus: CodegenTypes.EventEmitter<StylusEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Ink');
