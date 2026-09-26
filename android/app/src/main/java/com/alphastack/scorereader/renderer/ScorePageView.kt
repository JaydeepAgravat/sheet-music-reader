package com.alphastack.scorereader.renderer

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import com.alphastack.scorereader.renderer.core.PageBitmap
import com.alphastack.scorereader.renderer.core.PageSize
import com.alphastack.scorereader.renderer.core.Priority
import com.alphastack.scorereader.renderer.core.RenderEngine
import com.alphastack.scorereader.renderer.core.RenderKey
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Draws one score page (or a half-page composite) fitted inside the view.
 *
 * - Bitmaps come from [RenderEngine]; a cached page draws in the same frame the prop arrives.
 * - Neighbours ±[prefetchRadius] are rendered ahead at this view's exact pixel size.
 * - HALF mode: top band = next page's top, bottom band = current page's bottom, both cut from the
 *   same full-page bitmaps single mode uses (so switching modes needs no new renders).
 */
class ScorePageView(context: Context) : View(context), RenderEngine.Listener {

  var onPageShown: ((page: Int, latencyMs: Double, endToEndMs: Double, fromCache: Boolean, renderMs: Double) -> Unit)? = null

  private val engine = RenderEngine.get(context)
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
  private val paperPaint = Paint().apply { color = Color.WHITE }
  private val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val density = resources.displayMetrics.density
  private val tagFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xB31C1B19.toInt() }
  private val tagText =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFF3F0EA.toInt()
        textSize = 11.5f * resources.displayMetrics.scaledDensity.coerceAtMost(resources.displayMetrics.density * 1.6f)
        typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
      }

  // Props
  private var docId: String? = null
  private var page = 0
  private var mode = Mode.SINGLE
  private var halfSplit = 0.5f
  private var prefetchRadius = 2
  private var pageSizes: List<PageSize> = emptyList()

  // Bitmaps currently pinned for drawing (released when no longer needed).
  private val pinned = HashMap<RenderKey, PageBitmap>()
  private var pageChangedAt = 0L
  private var reportedFor = -1
  private var cachedAtChange = false
  private var turnRequestedAtNs = 0L

  enum class Mode { SINGLE, HALF }

  fun setDocId(value: String?) {
    if (value == docId) return
    docId = value
    pageSizes = value?.let { engine.session(it)?.pageSizes } ?: emptyList()
    releaseAll()
    markPageChanged()
    refresh()
  }

  fun setPage(value: Int) {
    if (value == page) return
    page = value
    markPageChanged()
    refresh()
  }

  fun setMode(value: String?) {
    val m = if (value == "HALF") Mode.HALF else Mode.SINGLE
    if (m == mode) return
    mode = m
    markPageChanged()
    refresh()
  }

  fun setHalfSplit(value: Float) {
    halfSplit = value.coerceIn(0.2f, 0.8f)
    invalidate()
  }

  fun setFilter(value: String?) {
    paint.colorFilter = PageFilters.forName(value)
    paperPaint.colorFilter = paint.colorFilter
    dividerPaint.color = if (value == "NIGHT") 0x33FFFFFF else 0x22000000
    invalidate()
  }

  fun setTurnRequestedAt(ms: Double) {
    turnRequestedAtNs = (ms * 1e6).toLong()
  }

  fun setPrefetchRadius(value: Int) {
    prefetchRadius = value.coerceIn(0, 4)
    refresh()
  }

  private fun markPageChanged() {
    pageChangedAt = SystemClock.elapsedRealtimeNanos()
    reportedFor = -1
    cachedAtChange = visiblePages().all { p -> keyFor(p)?.let { engine.store.get(it) != null } == true }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    engine.addListener(this)
    refresh()
  }

  override fun onDetachedFromWindow() {
    engine.removeListener(this)
    releaseAll()
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    refresh()
  }

  // --- Layout math ---------------------------------------------------------------------------

  /** Destination rect for a page fitted (contain) and centred in the view. */
  private fun fitRect(p: Int): RectF? {
    val size = pageSizes.getOrNull(p) ?: return null
    if (width == 0 || height == 0) return null
    val scale = min(width / size.widthPt, height / size.heightPt)
    val w = size.widthPt * scale
    val h = size.heightPt * scale
    val l = (width - w) / 2f
    val t = (height - h) / 2f
    return RectF(l, t, l + w, t + h)
  }

  private fun keyFor(p: Int): RenderKey? {
    val id = docId ?: return null
    val r = fitRect(p) ?: return null
    return RenderKey(id, p, r.width().roundToInt().coerceAtLeast(1), r.height().roundToInt().coerceAtLeast(1))
  }

  /** Pages needed on screen right now. */
  private fun visiblePages(): List<Int> =
      if (mode == Mode.HALF && page + 1 < pageSizes.size) listOf(page, page + 1) else listOf(page)

  // --- Rendering requests ----------------------------------------------------------------------

  private fun refresh() {
    val id = docId ?: return invalidate()
    if (pageSizes.isEmpty()) pageSizes = engine.session(id)?.pageSizes ?: return
    if (width == 0 || height == 0) return

    val wanted = HashSet<RenderKey>()
    visiblePages().forEach { p -> keyFor(p)?.let { wanted += it; engine.request(it, Priority.VISIBLE, this) } }
    for (d in 1..prefetchRadius) {
      for (p in intArrayOf(page + d, page - d)) {
        if (p !in pageSizes.indices) continue
        keyFor(p)?.let { k ->
          wanted += k
          if (engine.store.get(k) == null) engine.request(k, Priority.NEIGHBOR + d, this)
        }
      }
    }
    // Stale neighbours from a previous position no longer need rendering.
    engine.cancelFor(id, this) { it in wanted }
    // Unpin bitmaps we no longer draw.
    pinned.keys.filter { it.page !in visiblePages() || it !in wanted }.forEach { k -> pinned.remove(k)?.let { engine.store.release(it) } }
    invalidate()
  }

  override fun onPageRendered(entry: PageBitmap) {
    if (entry.key.docId != docId) return
    if (entry.key.page in visiblePages()) invalidate()
  }

  private fun bitmapFor(p: Int): PageBitmap? {
    val key = keyFor(p) ?: return null
    pinned[key]?.let { return it }
    val e = engine.store.acquire(key) ?: return null
    pinned[key] = e
    return e
  }

  private fun releaseAll() {
    pinned.values.forEach { engine.store.release(it) }
    pinned.clear()
  }

  // --- Drawing ---------------------------------------------------------------------------------

  override fun onDraw(canvas: Canvas) {
    if (docId == null || pageSizes.isEmpty()) return
    if (mode == Mode.HALF && page + 1 < pageSizes.size) drawHalf(canvas) else drawSingle(canvas)
  }

  private fun drawSingle(canvas: Canvas) {
    val dst = fitRect(page) ?: return
    val bmp = bitmapFor(page)
    if (bmp == null) {
      canvas.drawRect(dst, paperPaint) // blank paper until the render lands (never a flash of empty)
      return
    }
    canvas.drawBitmap(bmp.bitmap, null, dst, paint)
    reportShown(bmp)
  }

  private fun drawHalf(canvas: Canvas) {
    val cur = fitRect(page) ?: return
    val next = fitRect(page + 1) ?: return
    val splitY = cur.top + cur.height() * halfSplit
    val nextBmp = bitmapFor(page + 1)
    val curBmp = bitmapFor(page)

    // Top band: next page's top portion [0, split].
    val topDst = RectF(next.left, cur.top, next.right, splitY)
    if (nextBmp != null) {
      val b = nextBmp.bitmap
      canvas.drawBitmap(b, Rect(0, 0, b.width, (b.height * halfSplit).roundToInt()), topDst, paint)
    } else canvas.drawRect(topDst, paperPaint)

    // Bottom band: current page's bottom portion [split, 1].
    val bottomDst = RectF(cur.left, splitY, cur.right, cur.bottom)
    if (curBmp != null) {
      val b = curBmp.bitmap
      canvas.drawBitmap(b, Rect(0, (b.height * halfSplit).roundToInt(), b.width, b.height), bottomDst, paint)
    } else canvas.drawRect(bottomDst, paperPaint)

    // Soft divider so the player always knows which half is which.
    dividerPaint.strokeWidth = max(1f, density)
    canvas.drawLine(min(cur.left, next.left) + 24f, splitY, max(cur.right, next.right) - 24f, splitY, dividerPaint)

    // Page tags: which page each half belongs to (next page above, current page below).
    val tagX = min(cur.left, next.left) + 12f * density
    drawTag(canvas, "p. ${page + 2}", tagX, splitY - 6f * density, above = true)
    drawTag(canvas, "p. ${page + 1}", tagX, splitY + 6f * density, above = false)

    if (nextBmp != null && curBmp != null) reportShown(nextBmp)
  }

  private fun drawTag(canvas: Canvas, label: String, x: Float, y: Float, above: Boolean) {
    val padH = 8f * density
    val h = tagText.textSize + 8f * density
    val w = tagText.measureText(label) + padH * 2
    val top = if (above) y - h else y
    val r = RectF(x, top, x + w, top + h)
    canvas.drawRoundRect(r, h / 2, h / 2, tagFill)
    val baseline = r.centerY() - (tagText.descent() + tagText.ascent()) / 2
    canvas.drawText(label, x + padH, baseline, tagText)
  }

  private fun reportShown(entry: PageBitmap) {
    if (reportedFor == page) return
    reportedFor = page
    val now = SystemClock.elapsedRealtimeNanos()
    val latency = (now - pageChangedAt) / 1e6
    val endToEnd = if (turnRequestedAtNs > 0) (now - turnRequestedAtNs) / 1e6 else 0.0
    onPageShown?.invoke(page, latency, endToEnd, cachedAtChange, entry.renderMs)
  }
}
