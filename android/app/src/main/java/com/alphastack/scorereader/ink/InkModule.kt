package com.alphastack.scorereader.ink

import android.os.Handler
import android.os.Looper
import com.alphastack.scorereader.specs.NativeInkSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap

/**
 * JS side of ink: loads/undoes strokes into [InkStore] and reports what views draw or erase.
 * Calls arrive on the JS thread; payloads are decoded there and the store is mutated on the UI
 * thread (its only thread), in call order.
 */
class InkModule(reactContext: ReactApplicationContext) : NativeInkSpec(reactContext), InkSink {

  private val store = InkStore.shared

  /** The C++ side installs the emitter after construction; until then events can't reach JS. */
  private val canEmit: Boolean
    get() = mEventEmitterCallback != null

  override fun getName() = NAME

  override fun initialize() {
    super.initialize()
    store.sink = this
  }

  override fun invalidate() {
    if (store.sink === this) store.sink = null
    super.invalidate()
  }

  override fun addStrokes(inkKey: String, strokes: ReadableArray) {
    val decoded = List(strokes.size()) { i -> strokes.getMap(i)?.let(::strokeFromWire) }.filterNotNull()
    main.post { store.add(inkKey, decoded) }
  }

  override fun removeStrokes(inkKey: String, ids: ReadableArray) {
    val list = List(ids.size()) { ids.getString(it) }.filterNotNull()
    main.post { store.remove(inkKey, list) }
  }

  override fun releaseInk(inkKey: String) {
    main.post { store.release(inkKey) }
  }

  override fun setTool(config: ReadableMap) {
    store.tool =
        InkTool(
            annotating = config.getBoolean("annotating"),
            stylusDraws = config.getBoolean("stylusDraws"),
            fingerDraws = config.getBoolean("fingerDraws"),
            tool = InkTool.Kind.parse(config.getString("tool")),
            color = InkCodec.colorFromWire(config.getDouble("color")),
            widthPt = config.getDouble("width").toFloat(),
        )
  }

  override fun hasSeenStylus(): Boolean = store.stylusSeen

  // --- InkSink (UI thread) -----------------------------------------------------------------------

  override fun onInkEdit(inkKey: String, added: List<InkStroke>, removedIds: List<String>) {
    if (!canEmit) return
    emitOnInkEdit(
        Arguments.createMap().apply {
          putString("inkKey", inkKey)
          putArray("added", Arguments.createArray().apply { added.forEach { pushMap(strokeToWire(it)) } })
          putArray("removedIds", Arguments.createArray().apply { removedIds.forEach { pushString(it) } })
        })
  }

  override fun onStylus(toolType: String) {
    if (!canEmit) return
    emitOnStylus(Arguments.createMap().apply { putString("toolType", toolType) })
  }

  private fun strokeFromWire(m: ReadableMap): InkStroke? {
    val id = m.getString("id") ?: return null
    val points = m.getString("points") ?: return null
    return InkCodec.decode(id, m.getInt("page"), m.getString("kind"), m.getDouble("color"), m.getDouble("width"), points)
  }

  private fun strokeToWire(s: InkStroke): WritableMap =
      Arguments.createMap().apply {
        putString("id", s.id)
        putInt("page", s.page)
        putString("kind", s.kind.name)
        putDouble("color", InkCodec.colorToWire(s.color))
        putDouble("width", s.widthPt.toDouble())
        putString("points", InkCodec.encodePoints(s.points))
      }

  companion object {
    const val NAME = "Ink"
    private val main = Handler(Looper.getMainLooper())
  }
}
