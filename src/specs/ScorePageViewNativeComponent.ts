import { codegenNativeComponent, type CodegenTypes, type HostComponent, type ViewProps } from 'react-native';

export type PageShownEvent = Readonly<{
  page: CodegenTypes.Int32;
  /** Prop change → first draw with a full-resolution bitmap, ms. */
  latencyMs: CodegenTypes.Double;
  /** JS turn request (turnRequestedAtMs) → first draw, ms; 0 when not provided. */
  endToEndMs: CodegenTypes.Double;
  /** The bitmap was already cached when the page changed. */
  fromCache: boolean;
  /** How long the render itself took (whenever it happened), ms. */
  renderMs: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  docId?: string;
  /** -1 = draw nothing. */
  page?: CodegenTypes.Int32;
  /** SINGLE | HALF */
  mode?: CodegenTypes.WithDefault<string, 'SINGLE'>;
  halfSplit?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.5>;
  /** ORIGINAL | PAPER | SEPIA | NIGHT | CONTRAST */
  pageFilter?: CodegenTypes.WithDefault<string, 'ORIGINAL'>;
  prefetchRadius?: CodegenTypes.WithDefault<CodegenTypes.Int32, 2>;
  /** Instrumentation: NativeScoreRenderer.nowMs() captured when JS requested this page. */
  turnRequestedAtMs?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  /** Horizontal placement of the fitted page: LEFT | CENTER | RIGHT (two-up pages hug the spine). */
  alignX?: CodegenTypes.WithDefault<string, 'CENTER'>;
  /** Registers this view with KeyRouter so pedal turns can be applied natively ('' = none). */
  readerSlot?: CodegenTypes.WithDefault<string, ''>;
  /** Thumbnail: lowest render priority, no prefetch, no onPageShown. */
  thumbnail?: CodegenTypes.WithDefault<boolean, false>;
  /**
   * Zoom sharpening. The view is scaled by a transform on an ancestor; when zoomScale > 1 the view
   * renders the visible region (zoomRect, normalised 0..1 in this view's own coordinates) at
   * zoomScale × resolution and draws it over the base bitmap.
   */
  zoomScale?: CodegenTypes.WithDefault<CodegenTypes.Float, 1>;
  zoomLeft?: CodegenTypes.WithDefault<CodegenTypes.Float, 0>;
  zoomTop?: CodegenTypes.WithDefault<CodegenTypes.Float, 0>;
  zoomRight?: CodegenTypes.WithDefault<CodegenTypes.Float, 1>;
  zoomBottom?: CodegenTypes.WithDefault<CodegenTypes.Float, 1>;
  onPageShown?: CodegenTypes.DirectEventHandler<PageShownEvent>;
}

export default codegenNativeComponent<NativeProps>('ScorePageView') as HostComponent<NativeProps>;
