package com.alphastack.scorereader.keys

/** One page view's target after a native turn. */
data class SlotTarget(val slot: String, val page: Int, val mode: String)

/** What the reader's views should show after NEXT / PREV. Empty list = native must not turn. */
data class TurnPlan(val id: Int, val next: List<SlotTarget>, val prev: List<SlotTarget>)

/**
 * The pure part of pedal handling: consumption, repeat/debounce filtering, key mapping, learn mode
 * and the single-use turn plan. No Android types so it runs as a JVM unit test.
 *
 * Written from the JS thread (setters), read from the UI thread ([decide]) — hence synchronized.
 */
class KeyFilter {

  sealed interface Decision {
    /** Not ours: let the activity dispatch it normally. */
    data object Pass : Decision

    /** Swallow silently (key-ups, repeats, debounced presses). */
    data object Consume : Decision

    /** Learn mode captured a key-down. */
    data class Learned(val keyCode: Int) : Decision

    /**
     * A mapped press fired [action]. [targets] is the plan's list for NEXT/PREV when it can be
     * applied natively (then [planId] identifies it), else null.
     */
    data class Action(val action: String, val targets: List<SlotTarget>?, val planId: Int) : Decision
  }

  private var mapping: Map<Int, String> = emptyMap()
  private var debounceMs = DEFAULT_DEBOUNCE_MS
  private var readerActive = false
  private var learning = false
  private var plan: TurnPlan? = null
  private var lastActionAt = Long.MIN_VALUE

  @Synchronized
  fun setMappings(keyCodes: List<Int>, actions: List<String>) {
    mapping = keyCodes.zip(actions).toMap()
  }

  @Synchronized
  fun setDebounceMs(ms: Long) {
    debounceMs = ms.coerceAtLeast(0)
  }

  @Synchronized
  fun setReaderActive(active: Boolean) {
    readerActive = active
    // A plan describes the reader's current position; outside the reader it can only be stale.
    if (!active) plan = null
  }

  @Synchronized
  fun setLearning(value: Boolean) {
    learning = value
  }

  @Synchronized
  fun setPlan(value: TurnPlan?) {
    plan = value
  }

  /** Back to the state of a fresh process (JS reloaded). Mappings are kept; JS re-sends them. */
  @Synchronized
  fun reset() {
    readerActive = false
    learning = false
    plan = null
    lastActionAt = Long.MIN_VALUE
  }

  /** [timeMs] is the event's own timestamp (KeyEvent.eventTime), so queued events debounce correctly. */
  @Synchronized
  fun decide(keyCode: Int, down: Boolean, repeatCount: Int, timeMs: Long): Decision {
    if (learning) {
      if (keyCode in SYSTEM_KEYS) return Decision.Pass
      return if (down && repeatCount == 0) Decision.Learned(keyCode) else Decision.Consume
    }
    val action = mapping[keyCode] ?: return Decision.Pass
    if (!readerActive) return Decision.Pass
    if (!down || repeatCount > 0) return Decision.Consume
    if (lastActionAt != Long.MIN_VALUE && timeMs - lastActionAt < debounceMs) return Decision.Consume
    lastActionAt = timeMs

    // Any action changes what the reader shows, so the current plan is spent either way: applying
    // a stale plan after JS moved on would jump to the wrong page.
    val p = plan
    plan = null
    val targets =
        when (action) {
          NEXT -> p?.next
          PREV -> p?.prev
          else -> null
        }?.takeIf { it.isNotEmpty() }
    return Decision.Action(action, targets, if (targets != null) p!!.id else 0)
  }

  companion object {
    const val DEFAULT_DEBOUNCE_MS = 200L
    const val NEXT = "NEXT"
    const val PREV = "PREV"

    // KeyEvent.KEYCODE_HOME / BACK / POWER: never captured, so learn mode can't trap the user.
    private val SYSTEM_KEYS = setOf(3, 4, 26)
  }
}
