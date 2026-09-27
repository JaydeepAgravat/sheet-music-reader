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
  /** FLAG_KEEP_SCREEN_ON on the activity window. */
  setKeepAwake(on: boolean): void;
  /** Hides status + navigation bars (swipe from the edge shows them transiently). */
  setImmersive(on: boolean): void;
  /** true = lock to the current orientation; false = follow the sensor/system again. */
  setOrientationLock(locked: boolean): void;
  /**
   * System date picker. initial: 'YYYY-MM-DD' or '' (today). Resolves 'YYYY-MM-DD', '' when the
   * user taps clearLabel (neutral button; omitted when clearLabel is ''), or null when cancelled.
   */
  pickDate(initial: string, clearLabel: string): Promise<string | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppSystem');
