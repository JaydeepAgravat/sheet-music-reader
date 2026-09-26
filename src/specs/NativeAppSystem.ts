import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Small platform helpers that RN core doesn't cover well on Android.
 * Implemented in android/.../system/AppSystemModule.kt.
 */
export interface Spec extends TurboModule {
  /**
   * System haptic feedback (respects the user's Android touch-feedback setting).
   * kind: 'tick' | 'confirm' | 'reject' | 'longPress' | 'dragStart' | 'drop' | 'boundary'
   */
  performHaptic(kind: string): void;
  /** true = dark status/nav bar icons (for light backgrounds). */
  setSystemBarIconsDark(dark: boolean): void;
  /** Keeps native UI (splash, system dialogs) in sync with the in-app theme. mode: 'system' | 'light' | 'dark' */
  setNightMode(mode: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppSystem');
