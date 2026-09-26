package com.alphastack.scorereader.keys

import android.view.KeyEvent
import com.alphastack.scorereader.renderer.ScorePageView
import java.lang.ref.WeakReference

/**
 * Process-wide pedal router. MainActivity.dispatchKeyEvent hands every key here (UI thread); the
 * KeyEvents module configures [filter] from the JS thread and receives the resulting events.
 *
 * Reader page views register under their readerSlot so a pedal turn can be applied to them
 * directly on the UI thread, a frame or more before JS could re-render.
 */
object KeyRouter {

  val filter = KeyFilter()

  /** The live module (null before JS loads it / after reload): without it nothing is consumed. */
  @Volatile var module: KeyEventsModule? = null

  private val views = HashMap<String, WeakReference<ScorePageView>>()

  fun register(slot: String, view: ScorePageView) {
    synchronized(views) { views[slot] = WeakReference(view) }
  }

  /** Only removes the slot if it still points at [view] (a newer view may have taken it). */
  fun unregister(slot: String, view: ScorePageView) {
    synchronized(views) { if (views[slot]?.get() === view) views.remove(slot) }
  }

  /** Returns true when the event was consumed. UI thread. */
  fun handle(event: KeyEvent): Boolean {
    val m = module?.takeIf { it.canEmit } ?: return false
    val down =
        when (event.action) {
          KeyEvent.ACTION_DOWN -> true
          KeyEvent.ACTION_UP -> false
          else -> return false
        }
    return when (val d = filter.decide(event.keyCode, down, event.repeatCount, event.eventTime)) {
      KeyFilter.Decision.Pass -> false
      KeyFilter.Decision.Consume -> true
      is KeyFilter.Decision.Learned -> {
        m.emitKeyLearned(d.keyCode, event.device?.name ?: "", event.deviceId)
        true
      }
      is KeyFilter.Decision.Action -> {
        d.targets?.forEach { t -> viewFor(t.slot)?.applyNativeTurn(t.page, t.mode) }
        m.emitPedal(d.action, event.keyCode, event.device?.name ?: "", d.targets != null, d.planId)
        true
      }
    }
  }

  private fun viewFor(slot: String): ScorePageView? = synchronized(views) { views[slot]?.get() }
}
