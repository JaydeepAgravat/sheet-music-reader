package com.alphastack.scorereader.renderer

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.os.SystemClock
import android.view.View
import com.alphastack.scorereader.keys.KeyRouter
import com.alphastack.scorereader.renderer.core.PageBitmap
import com.alphastack.scorereader.renderer.core.PageSize
import com.alphastack.scorereader.renderer.core.Priority
import com.alphastack.scorereader.renderer.core.RenderEngine
import com.alphastack.scorereader.renderer.core.RenderKey
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Draws one score page (or a half-page composite) fitted inside the view.
 *
 * - Bitmaps come from [RenderEngine]; a cached page draws in the same frame the prop arrives.
 * - Neighbours ±[prefetchRadius] are rendered ahead at this view's exact pixel size.
 * - HALF mode: top band = next page's top, bottom band = current page's bottom, both cut from the
 *   same full-page bitmaps single mode uses (so switching modes needs no new renders).
 * - Zoom: an ancestor transform scales the view; while zoomed, the visible region is rendered at
 *   zoom resolution as a separate cropped tile and drawn over the (always drawn) base bitmap.
 * - Pedal turns: KeyRouter can set page/mode directly ([applyNativeTurn]); React props still win,
 *   because setters compare against what is displayed, not against the last prop.
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
  private var align = Align.CENTER
  private var readerSlot = ""
  private var thumbnail = false
  private var zoomScale = 1f
  /** Visible region while zoomed, normalised to this view's own (untransformed) size. */
  private val zoomRect = RectF(0f, 0f, 1f, 1f)
  private var pageSizes: List<PageSize> = emptyList()

  // Bitmaps currently pinned for drawing (released when no longer needed).
  private val pinned = HashMap<RenderKey, PageBitmap>()
  private var pageChangedAt = 0L
  private var reportedFor = -1
  private var cachedAtChange = false
  private var turnRequestedAtNs = 0L
  /** Set by a native pedal turn; takes precedence over the JS stamp until React drives a change. */
  private var nativeTurnAtNs = 0L

  // Zoom tile: the key we want now, and the tile being drawn (may be the previous one until the
  // new render lands, so panning never flashes back to the blurry base).
  private var tileKey: RenderKey? = null
  private var tile: PageBitmap? = null
  private val tileRefresh = Runnable { refresh() }

  enum class Mode { SINGLE, HALF }

  enum class Align { LEFT, CENTER, RIGHT }

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
    nativeTurnAtNs = 0
    markPageChanged()
    refresh()
  }

  fun setMode(value: String?) {
    val m = parseMode(value)
    if (m == mode) return
    mode = m
    nativeTurnAtNs = 0
    markPageChanged()
    refresh()
  }

  /**
   * Pedal turn applied on the UI thread without a JS round trip. When JS catches up it re-renders
   * with the same page/mode, which the setters above treat as no-ops.
   */
  fun applyNativeTurn(targetPage: Int, targetMode: String) {
    val m = parseMode(targetMode)
    if (targetPage == page && m == mode) return
    page = targetPage
    mode = m
    nativeTurnAtNs = SystemClock.elapsedRealtimeNanos()
    markPageChanged()
    refresh()
  }

  fun setAlignX(value: String?) {
    val a =
        when (value) {
          "LEFT" -> Align.LEFT
          "RIGHT" -> Align.RIGHT
          else -> Align.CENTER
        }
    if (a == align) return
    align = a
    refresh()
  }

  fun setReaderSlot(value: String?) {
    val slot = value ?: ""
    if (slot == readerSlot) return
    if (readerSlot.isNotEmpty()) KeyRouter.unregister(readerSlot, this)
    readerSlot = slot
    if (slot.isNotEmpty() && isAttachedToWindow) KeyRouter.register(slot, this)
    holdKeyFocus()
  }

  /**
   * The reader's main page holds keyboard focus. Without a focused (non-group) view, Android spends
   * the first navigation key after a touch (PAGE_DOWN, arrows) on leaving touch mode and moving
   * focus — before Activity.dispatchKeyEvent sees it — so the first pedal press after tapping the
   * screen would be lost. A focused leaf view makes ViewRootImpl pass the key through.
   */
  private fun holdKeyFocus() {
    val main = readerSlot == MAIN_SLOT
    isFocusable = main
    isFocusableInTouchMode = main
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) defaultFocusHighlightEnabled = false
    if (main && isAttachedToWindow) post { if (readerSlot == MAIN_SLOT && !hasFocus()) requestFocus() }
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    // Back from a menu/sheet (separate windows): take the key focus back.
    if (hasWindowFocus && readerSlot == MAIN_SLOT && !hasFocus()) requestFocus()
  }

  fun setThumbnail(value: Boolean) {
    if (value == thumbnail) return
    thumbnail = value
    refresh()
  }

  fun setZoomScale(value: Float) {
    if (value == zoomScale) return
    zoomScale = value
    zoomChanged()
  }

  fun setZoomRect(left: Float = zoomRect.left, top: Float = zoomRect.top, right: Float = zoomRect.right, bottom: Float = zoomRect.bottom) {
    if (left == zoomRect.left && top == zoomRect.top && right == zoomRect.right && bottom == zoomRect.bottom) return
    zoomRect.set(left, top, right, bottom)
    zoomChanged()
  }

  /**
   * Zoom props stream in during a pinch/pan; wait for them to settle before asking for a (large)
   * tile render. Leaving zoom releases the tile straight away.
   */
  private fun zoomChanged() {
    removeCallbacks(tileRefresh)
    if (zoomScale <= ZOOM_MIN) refresh() else postDelayed(tileRefresh, TILE_SETTLE_MS)
  }

  private fun parseMode(value: String?) = if (value == "HALF") Mode.HALF else Mode.SINGLE

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
    if (readerSlot.isNotEmpty()) KeyRouter.register(readerSlot, this)
    holdKeyFocus()
    refresh()
  }

  override fun onDetachedFromWindow() {
    engine.removeListener(this)
    if (readerSlot.isNotEmpty()) KeyRouter.unregister(readerSlot, this)
    removeCallbacks(tileRefresh)
    releaseAll()
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    refresh()
  }

  // --- Layout math ---------------------------------------------------------------------------

  /** Destination rect for a page fitted (contain), vertically centred, horizontally per [align]. */
  private fun fitRect(p: Int): RectF? {
    val size = pageSizes.getOrNull(p) ?: return null
    if (width == 0 || height == 0) return null
    val scale = min(width / size.widthPt, height / size.heightPt)
    val w = size.widthPt * scale
    val h = size.heightPt * scale
    val l =
        when (align) {
          Align.LEFT -> 0f
          Align.CENTER -> (width - w) / 2f
          Align.RIGHT -> width - w
        }
    val t = (height - h) / 2f
    return RectF(l, t, l + w, t + h)
  }

  private fun keyFor(p: Int): RenderKey? {
    val id = docId ?: return null
    val r = fitRect(p) ?: return null
    return RenderKey(id, p, r.width().roundToInt().coerceAtLeast(1), r.height().roundToInt().coerceAtLeast(1))
  }

  /** HALF needs a next page; on the last page it falls back to the single layout. */
  private fun isHalfLayout() = mode == Mode.HALF && page + 1 < pageSizes.size

  /** Pages needed on screen right now (none for page -1). */
  private fun visiblePages(): List<Int> =
      when {
        page < 0 -> emptyList()
        isHalfLayout() -> listOf(page, page + 1)
        else -> listOf(page)
      }

  /**
   * The zoomed tile: the part of the page inside the visible zoom region, as a normalised crop,
   * rendered at zoomScale × its on-view size (capped). Single layout only.
   */
  private fun zoomTileKey(): RenderKey? {
    if (zoomScale <= ZOOM_MIN || page < 0 || isHalfLayout()) return null
    val id = docId ?: return null
    val fit = fitRect(page) ?: return null
    val visible = RectF(zoomRect.left * width, zoomRect.top * height, zoomRect.right * width, zoomRect.bottom * height)
    if (!visible.intersect(fit)) return null
    val crop =
        RenderKey.Crop.of(
            (visible.left - fit.left) / fit.width(),
            (visible.top - fit.top) / fit.height(),
            (visible.right - fit.left) / fit.width(),
            (visible.bottom - fit.top) / fit.height(),
        )
    // Size from the quantised crop, so the tile's pixels map exactly onto where it is drawn.
    val w = (crop.r - crop.l) / 1000f * fit.width() * zoomScale
    val h = (crop.b - crop.t) / 1000f * fit.height() * zoomScale
    val s = minOf(1f, MAX_TILE_SIDE / w, MAX_TILE_SIDE / h, sqrt(MAX_TILE_PIXELS / (w * h)))
    return RenderKey(id, page, (w * s).roundToInt().coerceAtLeast(1), (h * s).roundToInt().coerceAtLeast(1), crop)
  }

  private fun tileDst(key: RenderKey, fit: RectF): RectF {
    val c = key.crop
    return RectF(
        fit.left + c.l / 1000f * fit.width(),
        fit.top + c.t / 1000f * fit.height(),
        fit.left + c.r / 1000f * fit.width(),
        fit.top + c.b / 1000f * fit.height(),
    )
  }

  // --- Rendering requests ----------------------------------------------------------------------

  private fun refresh() {
    val id = docId ?: return invalidate()
    if (pageSizes.isEmpty()) pageSizes = engine.session(id)?.pageSizes ?: return
    if (width == 0 || height == 0) return

    val wanted = HashSet<RenderKey>()
    val visiblePriority = if (thumbnail) Priority.THUMBNAIL else Priority.VISIBLE
    visiblePages().forEach { p -> keyFor(p)?.let { wanted += it; engine.request(it, visiblePriority, this) } }
    val radius = if (thumbnail || page < 0) 0 else prefetchRadius
    for (d in 1..radius) {
      for (p in intArrayOf(page + d, page - d)) {
        if (p !in pageSizes.indices) continue
        keyFor(p)?.let { k ->
          wanted += k
          if (engine.store.get(k) == null) engine.request(k, Priority.NEIGHBOR + d, this)
        }
      }
    }
    tileKey =
        zoomTileKey()?.also { k ->
          wanted += k
          if (engine.store.get(k) == null) engine.request(k, Priority.VISIBLE, this)
        }
    // An old tile keeps drawing while its replacement renders, but only for the same page + zoom.
    tile?.let { t -> if (tileKey == null || t.key.page != page || t.key.docId != id) releaseTile() }
    // Stale neighbours / tiles from a previous position no longer need rendering.
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
    releaseTile()
  }

  private fun releaseTile() {
    tile?.let { engine.store.release(it) }
    tile = null
  }

  // --- Drawing ---------------------------------------------------------------------------------

  override fun onDraw(canvas: Canvas) {
    if (docId == null || pageSizes.isEmpty() || page < 0) return
    if (isHalfLayout()) drawHalf(canvas) else drawSingle(canvas)
  }

  private fun drawSingle(canvas: Canvas) {
    val dst = fitRect(page) ?: return
    val bmp = bitmapFor(page)
    // Blank paper until the render lands (never a flash of empty).
    if (bmp == null) canvas.drawRect(dst, paperPaint) else canvas.drawBitmap(bmp.bitmap, null, dst, paint)
    drawTile(canvas, dst)
    if (bmp != null) reportShown(bmp)
  }

  private fun drawTile(canvas: Canvas, fit: RectF) {
    val want = tileKey
    if (want != null && tile?.key != want) {
      engine.store.acquire(want)?.let { fresh ->
        releaseTile()
        tile = fresh
      }
    }
    val t = tile ?: return
    canvas.drawBitmap(t.bitmap, null, tileDst(t.key, fit), paint)
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
    if (thumbnail || reportedFor == page) return
    reportedFor = page
    val now = SystemClock.elapsedRealtimeNanos()
    val latency = (now - pageChangedAt) / 1e6
    val start = if (nativeTurnAtNs > 0) nativeTurnAtNs else turnRequestedAtNs
    val endToEnd = if (start > 0) (now - start) / 1e6 else 0.0
    onPageShown?.invoke(page, latency, endToEnd, cachedAtChange, entry.renderMs)
  }

  companion object {
    /** Below this the base bitmap is sharp enough; no tile. */
    private const val MAIN_SLOT = "main"
    private const val ZOOM_MIN = 1.02f
    private const val TILE_SETTLE_MS = 120L
    private const val MAX_TILE_SIDE = 4096f
    private const val MAX_TILE_PIXELS = 16_000_000f
  }
}
