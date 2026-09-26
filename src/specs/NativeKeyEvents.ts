import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Pedal / keyboard input. android/.../keys/KeyEventsModule.kt + KeyRouter.kt.
 *
 * MainActivity.dispatchKeyEvent hands every key to KeyRouter. Mapped keys are consumed only while
 * the reader is active (so arrows still move focus elsewhere). Key repeats (long press) and presses
 * inside the debounce window are swallowed.
 *
 * Instant turns: the reader pushes a TurnPlan describing exactly what its page views should show
 * after NEXT / PREV. On a pedal press, native applies that plan straight to the registered
 * ScorePageViews (readerSlot prop) on the UI thread — no JS round trip — then emits onPedal with
 * applied = true. A plan is single-use: a second press before JS pushes a new plan arrives with
 * applied = false and JS turns the page itself.
 */

/** NEXT | PREV | NEXT_SONG | PREV_SONG | TOGGLE_HALF | TOGGLE_PERFORMANCE */
export type KeyActionName = string;

export type SlotTarget = {
  /** ScorePageView readerSlot, e.g. 'main' or 'right'. */
  slot: string;
  /** -1 = show nothing (e.g. the right page of the last two-up spread). */
  page: CodegenTypes.Int32;
  /** SINGLE | HALF */
  mode: string;
};

export type TurnPlan = {
  id: CodegenTypes.Int32;
  /** Empty = native must not turn for this direction (end of score, zoomed, slide animation on…). */
  next: ReadonlyArray<SlotTarget>;
  prev: ReadonlyArray<SlotTarget>;
};

export type PedalEvent = {
  action: KeyActionName;
  keyCode: CodegenTypes.Int32;
  deviceName: string;
  /** The plan was applied natively; JS should adopt the plan's position for that direction. */
  applied: boolean;
  /** Id of the applied plan (0 when not applied). */
  planId: CodegenTypes.Int32;
};

export type LearnedKeyEvent = {
  keyCode: CodegenTypes.Int32;
  /** KeyEvent.keyCodeToString without the KEYCODE_ prefix, e.g. 'PAGE_DOWN'. */
  keyName: string;
  deviceName: string;
  deviceId: CodegenTypes.Int32;
};

export type InputDeviceInfo = {
  id: CodegenTypes.Int32;
  name: string;
  /** Stable per physical device across reconnects. */
  descriptor: string;
  external: boolean;
};

export interface Spec extends TurboModule {
  /** Replaces the whole key map. keyCodes[i] triggers actions[i]. */
  setMappings(keyCodes: ReadonlyArray<CodegenTypes.Int32>, actions: ReadonlyArray<string>): void;
  /** Presses closer together than this are ignored (default 200). */
  setDebounceMs(ms: CodegenTypes.Int32): void;
  /** Mapped keys are consumed + emitted only while true. */
  setReaderActive(active: boolean): void;
  setTurnPlan(plan: TurnPlan): void;
  clearTurnPlan(): void;
  /** While learning, every key-down (except BACK/HOME/POWER) is consumed and emitted as onKeyLearned. */
  setLearning(learning: boolean): void;
  /** External keyboard-class devices currently connected (pedals present as keyboards). */
  getConnectedDevices(): ReadonlyArray<InputDeviceInfo>;
  /** Configuration.keyboard != KEYBOARD_NOKEYS (Android hides the soft keyboard in this state). */
  hasHardwareKeyboard(): boolean;

  readonly onPedal: CodegenTypes.EventEmitter<PedalEvent>;
  readonly onKeyLearned: CodegenTypes.EventEmitter<LearnedKeyEvent>;
  readonly onDeviceAdded: CodegenTypes.EventEmitter<InputDeviceInfo>;
  readonly onDeviceRemoved: CodegenTypes.EventEmitter<InputDeviceInfo>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('KeyEvents');
