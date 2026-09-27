package com.alphastack.scorereader.ink

/** Current drawing tool, as set from JS (NativeInk.setTool). Immutable: swapped as a whole. */
data class InkTool(
    val annotating: Boolean = false,
    val stylusDraws: Boolean = true,
    val fingerDraws: Boolean = false,
    val tool: Kind = Kind.PEN,
    val color: Int = 0xFF1C1B19.toInt(),
    val widthPt: Float = 1.2f,
) {
  enum class Kind {
    PEN,
    HIGHLIGHTER,
    ERASER;

    companion object {
      fun parse(value: String?) =
          when (value) {
            "HIGHLIGHTER" -> HIGHLIGHTER
            "ERASER" -> ERASER
            else -> PEN
          }
    }
  }
}

/** Where view-originated edits go (the Ink module, which forwards them to JS). */
interface InkSink {
  fun onInkEdit(inkKey: String, added: List<InkStroke>, removedIds: List<String>)

  fun onStylus(toolType: String)
}

/**
 * In-memory ink of the open scores: inkKey → page → strokes in z-order.
 *
 * Stroke lists and listeners are UI-thread only (the Ink module posts JS calls to the main looper),
 * so views always read a consistent state without locking. Every change stamps the page with a
 * new version from one global counter, which lets views skip re-recording unchanged ink — also
 * across releaseInk/reload, where a per-page counter would restart and collide.
 */
class InkStore {
  fun interface Listener {
    fun onInkChanged(inkKey: String, page: Int)
  }

  private class PageInk {
    val strokes = ArrayList<InkStroke>()
    var version = 0L
  }

  private class Doc {
    val pages = HashMap<Int, PageInk>()
    /** Stroke id → page, so loads and replacements don't scan every list. */
    val pageOf = HashMap<String, Int>()
  }

  private val docs = HashMap<String, Doc>()
  private val listeners = ArrayList<Listener>()
  private var clock = 0L

  @Volatile var tool = InkTool()
  @Volatile var stylusSeen = false
  @Volatile var eraserSeen = false
  @Volatile var sink: InkSink? = null

  fun strokes(inkKey: String, page: Int): List<InkStroke> = docs[inkKey]?.pages?.get(page)?.strokes ?: emptyList()

  /** 0 = no ink loaded for the page. */
  fun version(inkKey: String, page: Int): Long = docs[inkKey]?.pages?.get(page)?.version ?: 0L

  /** Adds strokes, replacing any with the same id (in place when it stays on the same page). */
  fun add(inkKey: String, strokes: List<InkStroke>) {
    if (strokes.isEmpty()) return
    val doc = docs.getOrPut(inkKey) { Doc() }
    val changed = HashSet<Int>()
    for (s in strokes) {
      val target = doc.pages.getOrPut(s.page) { PageInk() }
      when (val prev = doc.pageOf[s.id]) {
        null -> target.strokes += s
        s.page -> target.strokes[target.strokes.indexOfFirst { it.id == s.id }] = s
        else -> {
          doc.pages[prev]?.strokes?.removeAll { it.id == s.id }
          changed += prev
          target.strokes += s
        }
      }
      doc.pageOf[s.id] = s.page
      changed += s.page
    }
    touch(doc, inkKey, changed)
  }

  /** Removes strokes by id; returns the ones that were present. */
  fun remove(inkKey: String, ids: Collection<String>): List<InkStroke> {
    val doc = docs[inkKey] ?: return emptyList()
    val byPage = HashMap<Int, HashSet<String>>()
    for (id in ids) doc.pageOf.remove(id)?.let { p -> byPage.getOrPut(p) { HashSet() } += id }
    if (byPage.isEmpty()) return emptyList()
    val removed = ArrayList<InkStroke>()
    for ((p, set) in byPage) {
      doc.pages[p]?.strokes?.removeAll { s -> (s.id in set).also { if (it) removed += s } }
    }
    touch(doc, inkKey, byPage.keys)
    return removed
  }

  fun release(inkKey: String) {
    val doc = docs.remove(inkKey) ?: return
    val snapshot = listeners.toList()
    for ((p, ink) in doc.pages) if (ink.strokes.isNotEmpty()) snapshot.forEach { it.onInkChanged(inkKey, p) }
  }

  fun addListener(l: Listener) {
    if (l !in listeners) listeners += l
  }

  fun removeListener(l: Listener) {
    listeners -= l
  }

  private fun touch(doc: Doc, inkKey: String, pages: Set<Int>) {
    if (pages.isEmpty()) return
    for (p in pages) doc.pages[p]?.version = ++clock
    val snapshot = listeners.toList()
    for (p in pages) snapshot.forEach { it.onInkChanged(inkKey, p) }
  }

  companion object {
    /** The app-wide store shared by the Ink module and every ScorePageView. */
    val shared = InkStore()
  }
}
