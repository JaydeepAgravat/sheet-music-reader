import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Support plumbing: crash capture, app/device info, sharing text. android/.../support/SupportModule.kt.
 * Nothing here touches the network: reports only leave the device if the user shares them.
 */
export type AppInfo = {
  /** Launcher label (the brand name lives in android/app/src/main/res/values/strings.xml). */
  appName: string;
  /** versionName, e.g. "1.0.0". */
  version: string;
  /** versionCode. */
  build: CodegenTypes.Double;
  /** Android release, e.g. "15". */
  android: string;
  sdk: CodegenTypes.Int32;
  /** "Samsung SM-X710". */
  device: string;
};

export interface Spec extends TurboModule {
  /** The report saved by the last crash (native and/or JS), then deletes it. null = no crash. Synchronous. */
  takeCrashReport(): string | null;
  /**
   * Stores a fatal JS error (body text; native adds the app/device header). Synchronous on purpose:
   * it must hit the disk before RN rethrows the error and the process dies. Returns false on failure.
   */
  recordJsCrash(text: string): boolean;
  /** System share sheet (ACTION_SEND text/plain, includes email apps). recipient '' = none. */
  shareText(subject: string, text: string, recipient: string): void;
  appInfo(): AppInfo;
}

/** Nullable on purpose: crash handling must never be the thing that crashes (and Jest has no natives). */
export default TurboModuleRegistry.get<Spec>('Support');
