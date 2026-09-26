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
  page?: CodegenTypes.Int32;
  /** SINGLE | HALF */
  mode?: CodegenTypes.WithDefault<string, 'SINGLE'>;
  halfSplit?: CodegenTypes.WithDefault<CodegenTypes.Float, 0.5>;
  /** ORIGINAL | PAPER | SEPIA | NIGHT | CONTRAST */
  pageFilter?: CodegenTypes.WithDefault<string, 'ORIGINAL'>;
  prefetchRadius?: CodegenTypes.WithDefault<CodegenTypes.Int32, 2>;
  /** Instrumentation: NativeScoreRenderer.nowMs() captured when JS requested this page. */
  turnRequestedAtMs?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  onPageShown?: CodegenTypes.DirectEventHandler<PageShownEvent>;
}

export default codegenNativeComponent<NativeProps>('ScorePageView') as HostComponent<NativeProps>;
