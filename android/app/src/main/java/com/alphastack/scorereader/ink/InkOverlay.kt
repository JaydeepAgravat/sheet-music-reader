package com.alphastack.scorereader.ink

import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderNode
import android.os.Build
import android.view.MotionEvent
import android.view.View
import com.alphastack.scorereader.renderer.PageFilters
import java.util.UUID
import kotlin.math.ceil
import kotlin.math.floor

/**
 * Ink for one ScorePageView: draws the committed strokes of the pages it shows, captures stylus /
 * finger input into new strokes, and runs the stroke eraser. The host supplies [InkPlacement]s
 * (where each page is drawn) and forwards onDraw / onTouchEvent.
 *
 * Drawing: committed ink is recorded into two RenderNodes (highlighters, pens) and re-recorded only
 * when strokes, geometry or the filter change. Unzoomed, each node has a compositing layer sized
 * to the ink's bounds, so a frame of live drawing costs one layer blit, not 2,000 paths; the
 * highlighter layer composites with MULTIPLY (SCREEN on the inverted Night page). Zoomed (the
 * view is scaled by an ancestor), the nodes draw without layers so ink is rasterised at the
 * zoomed resolution and stays sharp. The live stroke is drawn directly on top every frame.
 *
 * Input: a stylus draws when the tool config allows it and claims the gesture from RN / gesture
 * handler at once; a finger draws only in annotate mode and never claims it, so a second finger
 * still becomes a pinch (the stroke is discarded).
 */
class InkOverlay(private val view: View) : InkStore.Listener {

  private val store = InkStore.shared
  private val density = view.resources.displayMetrics.density

  var inkKey = ""
    private set

  private var filterName: String? = null
  private var penFilter: ColorFilter? = null
  private var highlightFilter: ColorFilter? = null
  private var highlightBlend = BlendMode.MULTIPLY

  // --- Recorded committed ink ------------------------------------------------------------------
  private val penNode = RenderNode("inkPens")
  private val highlightNode = RenderNode("inkHighlights")
  private val penBounds = RectF()
  private val highlightBounds = RectF()
  private var penCount = 0
  private var highlightCount = 0
  private var recordedPlacements: List<InkPlacement> = emptyList()
  private var recordedVersions = LongArray(0)
  private var recordedKey = ""
  private var recordedFilter: String? = null
  private var recorded = false
  private var shownPages = IntArray(0)

  private val strokePaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
      }
  private val highlightLayerPaint = Paint()
  private val tmpRect = RectF()

  // --- Live gesture ----------------------------------------------------------------------------
  private enum class Gesture { NONE, DRAW, ERASE }

  private var gesture = Gesture.NONE
  private var pointerId = -1
  private var byStylus = false
  private var placement: InkPlacement? = null
  private var liveKind = InkKind.PEN
  private var liveColor = 0
  private var liveWidth = 1f
  private val smoother = InkSmoother()
  private val livePath = Path()
  private val erased = ArrayList<InkStroke>()
  private var cursorX = 0f
  private var cursorY = 0f
  private var zoom = 1f
  private val pt = FloatArray(2)
  private val cursorPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = 0x99808080.toInt()
      }

  fun setInkKey(value: String) {
    if (value == inkKey) return
    cancelGesture()
    inkKey = value
    view.invalidate()
  }

  fun setFilter(name: String?) {
    if (name == filterName) return
    filterName = name
    val night = name == "NIGHT"
    penFilter = if (night) nightInkFilter else PageFilters.forName(name)
    // Inverting a highlighter would turn yellow into dark blue; on the dark page keep its hue and screen it.
    highlightFilter = if (night) null else PageFilters.forName(name)
    highlightBlend = if (night) BlendMode.SCREEN else BlendMode.MULTIPLY
    highlightLayerPaint.blendMode = highlightBlend
    view.invalidate()
  }

  fun attach() = store.addListener(this)

  fun detach() {
    cancelGesture()
    store.removeListener(this)
    penNode.discardDisplayList()
    highlightNode.discardDisplayList()
    recorded = false
  }

  override fun onInkChanged(inkKey: String, page: Int) {
    if (inkKey == this.inkKey && page in shownPages) view.invalidate()
  }

  // --- Drawing ---------------------------------------------------------------------------------

  /** Draws committed + live ink over the page bitmaps. [zoomScale] is the ancestor's scale. */
  fun draw(canvas: Canvas, placements: List<InkPlacement>, zoomScale: Float) {
    zoom = zoomScale.coerceAtLeast(0.01f)
    if (shownPages.size != placements.size || placements.indices.any { shownPages[it] != placements[it].page }) {
      shownPages = IntArray(placements.size) { placements[it].page }
    }
    if (inkKey.isEmpty() || placements.isEmpty()) return
    if (canvas.isHardwareAccelerated) {
      if (needsRecord(placements)) record(placements)
      val layered = zoomScale <= ZOOM_LAYER_MAX
      drawNode(canvas, highlightNode, highlightBounds, highlightCount, layered, highlightLayerPaint)
      drawNode(canvas, penNode, penBounds, penCount, layered, null)
    } else {
      for (pl in placements) drawStrokes(canvas, pl, InkKind.HIGHLIGHTER, direct = true)
      for (pl in placements) drawStrokes(canvas, pl, InkKind.PEN, direct = true)
    }
    drawLive(canvas)
  }

  private fun needsRecord(placements: List<InkPlacement>): Boolean {
    if (!recorded || recordedKey != inkKey || recordedFilter != filterName) return true
    if (placements.size != recordedPlacements.size) return true
    for (i in placements.indices) {
      if (!placements[i].sameGeometry(recordedPlacements[i])) return true
      if (store.version(inkKey, placements[i].page) != recordedVersions[i]) return true
    }
    return false
  }

  private fun record(placements: List<InkPlacement>) {
    recordedPlacements = placements
    recordedVersions = LongArray(placements.size) { store.version(inkKey, placements[it].page) }
    recordedKey = inkKey
    recordedFilter = filterName
    recorded = true
    highlightCount = recordKind(highlightNode, highlightBounds, placements, InkKind.HIGHLIGHTER)
    penCount = recordKind(penNode, penBounds, placements, InkKind.PEN)
  }

  /** Records one kind into [node], positioned at the (pixel-aligned) bounds of that ink. */
  private fun recordKind(node: RenderNode, bounds: RectF, placements: List<InkPlacement>, kind: InkKind): Int {
    bounds.setEmpty()
    var count = 0
    for (pl in placements) {
      val area = RectF()
      for (s in store.strokes(inkKey, pl.page)) {
        if (s.kind != kind) continue
        count++
        val half = s.widthPt / 2f + 1f
        tmpRect.set(s.minX * pl.pageW - half, s.minY * pl.pageH - half, s.maxX * pl.pageW + half, s.maxY * pl.pageH + half)
        area.union(tmpRect)
      }
      if (area.isEmpty) continue
      pl.matrix.mapRect(area)
      if (area.intersect(pl.clip)) bounds.union(area)
    }
    if (count == 0 || bounds.isEmpty) {
      node.discardDisplayList()
      return 0
    }
    bounds.set(floor(bounds.left), floor(bounds.top), ceil(bounds.right), ceil(bounds.bottom))
    node.setPosition(bounds.left.toInt(), bounds.top.toInt(), bounds.right.toInt(), bounds.bottom.toInt())
    val c = node.beginRecording()
    try {
      c.translate(-bounds.left, -bounds.top)
      for (pl in placements) drawStrokes(c, pl, kind, direct = false)
    } finally {
      node.endRecording()
    }
    return count
  }

  private fun drawNode(canvas: Canvas, node: RenderNode, bounds: RectF, count: Int, layered: Boolean, blend: Paint?) {
    if (count == 0 || !node.hasDisplayList()) return
    // Few strokes are cheaper to draw than to keep a layer for.
    if (layered && count >= LAYER_MIN_STROKES) {
      node.setUseCompositingLayer(true, blend)
      canvas.drawRenderNode(node)
      return
    }
    node.setUseCompositingLayer(false, null)
    if (blend != null) {
      canvas.saveLayer(bounds, blend)
      canvas.drawRenderNode(node)
      canvas.restore()
    } else canvas.drawRenderNode(node)
  }

  /**
   * Strokes of one kind on one placement. [direct] = drawn straight onto the view (blend per
   * stroke); otherwise recorded into a node whose layer applies the blend.
   */
  private fun drawStrokes(canvas: Canvas, pl: InkPlacement, kind: InkKind, direct: Boolean) {
    val strokes = store.strokes(inkKey, pl.page)
    if (strokes.none { it.kind == kind }) return
    configure(strokePaint, kind, direct)
    canvas.save()
    canvas.clipRect(pl.clip)
    canvas.concat(pl.matrix)
    for (s in strokes) {
      if (s.kind != kind) continue
      strokePaint.color = s.color
      strokePaint.strokeWidth = s.widthPt
      canvas.drawPath(s.path(pl.pageW, pl.pageH), strokePaint)
    }
    canvas.restore()
  }

  private fun configure(paint: Paint, kind: InkKind, direct: Boolean) {
    if (kind == InkKind.HIGHLIGHTER) {
      paint.colorFilter = highlightFilter
      paint.blendMode = if (direct) highlightBlend else null
    } else {
      paint.colorFilter = penFilter
      paint.blendMode = null
    }
  }

  private fun drawLive(canvas: Canvas) {
    when (gesture) {
      Gesture.DRAW -> {
        val pl = placement ?: return
        InkPaths.build(livePath, smoother.buffer, smoother.count, 1f, 1f)
        if (smoother.count > 1) livePath.lineTo(smoother.rawX, smoother.rawY)
        configure(strokePaint, liveKind, direct = true)
        strokePaint.color = liveColor
        strokePaint.strokeWidth = liveWidth
        canvas.save()
        canvas.clipRect(pl.clip)
        canvas.concat(pl.matrix)
        canvas.drawPath(livePath, strokePaint)
        canvas.restore()
      }
      Gesture.ERASE -> {
        cursorPaint.strokeWidth = 1.5f * density / zoom
        canvas.drawCircle(cursorX, cursorY, ERASER_RADIUS_DP * density / zoom, cursorPaint)
      }
      Gesture.NONE -> {}
    }
  }

  // --- Input -----------------------------------------------------------------------------------

  /** Returns true when ink handles the event (the host must not pass it on). */
  fun onTouchEvent(e: MotionEvent, placements: List<InkPlacement>, enabled: Boolean): Boolean {
    if (e.actionMasked == MotionEvent.ACTION_DOWN) {
      cancelGesture()
      pointerId = -1
      val tool = e.getToolType(0)
      val stylus = tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER
      if (stylus) noteStylus(tool)
      if (!enabled || inkKey.isEmpty()) return false
      return begin(e, placements, tool, stylus)
    }
    if (gesture == Gesture.NONE) return pointerId != -1
    when (e.actionMasked) {
      MotionEvent.ACTION_MOVE -> move(e, placements)
      MotionEvent.ACTION_POINTER_DOWN -> if (!byStylus) cancelGesture()
      MotionEvent.ACTION_POINTER_UP -> if (e.getPointerId(e.actionIndex) == pointerId) finish()
      MotionEvent.ACTION_UP -> if (isCanceled(e)) cancelGesture() else finish()
      MotionEvent.ACTION_CANCEL -> cancelGesture()
    }
    return true
  }

  private fun begin(e: MotionEvent, placements: List<InkPlacement>, tool: Int, stylus: Boolean): Boolean {
    val cfg = store.tool
    val allowed = if (stylus) cfg.stylusDraws || cfg.annotating else cfg.annotating && (cfg.fingerDraws || !store.stylusSeen)
    if (!allowed) return false
    val x = e.x
    val y = e.y
    val pl = placements.firstOrNull { it.contains(x, y) && !it.visible.isEmpty } ?: return false
    val erase =
        tool == MotionEvent.TOOL_TYPE_ERASER ||
            (stylus && e.buttonState and MotionEvent.BUTTON_STYLUS_PRIMARY != 0) ||
            cfg.tool == InkTool.Kind.ERASER

    pointerId = e.getPointerId(0)
    byStylus = stylus
    placement = pl
    if (stylus) view.parent?.requestDisallowInterceptTouchEvent(true)
    view.requestUnbufferedDispatch(e)

    if (erase) {
      gesture = Gesture.ERASE
      erased.clear()
      eraseAt(x, y, placements)
    } else {
      gesture = Gesture.DRAW
      liveKind = if (cfg.tool == InkTool.Kind.HIGHLIGHTER) InkKind.HIGHLIGHTER else InkKind.PEN
      liveColor = cfg.color
      liveWidth = cfg.widthPt
      toPageClamped(pl, x, y)
      smoother.begin(pt[0], pt[1], pressureAt(e, 0, -1), MIN_DISTANCE_PX / (pl.scale * zoom))
    }
    view.invalidate()
    return true
  }

  private fun move(e: MotionEvent, placements: List<InkPlacement>) {
    val i = e.findPointerIndex(pointerId)
    if (i < 0) return
    for (h in 0 until e.historySize) sample(e.getHistoricalX(i, h), e.getHistoricalY(i, h), pressureAt(e, i, h), placements)
    sample(e.getX(i), e.getY(i), pressureAt(e, i, -1), placements)
    view.invalidate()
  }

  private fun sample(x: Float, y: Float, p: Float, placements: List<InkPlacement>) {
    when (gesture) {
      Gesture.DRAW -> {
        val pl = placement ?: return
        toPageClamped(pl, x, y)
        smoother.add(pt[0], pt[1], p)
      }
      Gesture.ERASE -> eraseAt(x, y, placements)
      Gesture.NONE -> {}
    }
  }

  private fun eraseAt(x: Float, y: Float, placements: List<InkPlacement>) {
    cursorX = x
    cursorY = y
    val radiusPx = ERASER_RADIUS_DP * density / zoom
    for (pl in placements) {
      if (!pl.contains(x, y)) continue
      pl.toPage(x, y, pt)
      val ids = InkHitTest.hitIds(store.strokes(inkKey, pl.page), pt[0], pt[1], radiusPx / pl.scale, pl.pageW, pl.pageH)
      if (ids.isNotEmpty()) erased += store.remove(inkKey, ids)
    }
  }

  private fun finish() {
    when (gesture) {
      Gesture.DRAW -> {
        val pl = placement
        if (pl != null && smoother.count > 0) {
          smoother.end()
          val pts = smoother.points()
          var j = 0
          while (j < pts.size) {
            pts[j] = (pts[j] / pl.pageW).coerceIn(0f, 1f)
            pts[j + 1] = (pts[j + 1] / pl.pageH).coerceIn(0f, 1f)
            j += 3
          }
          val stroke = InkStroke(UUID.randomUUID().toString(), pl.page, liveKind, liveColor, liveWidth, pts)
          val key = inkKey
          reset()
          store.add(key, listOf(stroke))
          store.sink?.onInkEdit(key, listOf(stroke), emptyList())
        } else reset()
      }
      Gesture.ERASE -> {
        val ids = erased.map { it.id }
        val key = inkKey
        reset()
        if (ids.isNotEmpty()) store.sink?.onInkEdit(key, emptyList(), ids)
      }
      Gesture.NONE -> reset()
    }
    view.invalidate()
  }

  /** Drops the gesture: a live stroke vanishes, erased strokes come back (nothing is reported). */
  private fun cancelGesture() {
    if (gesture == Gesture.ERASE && erased.isNotEmpty()) store.add(inkKey, erased.toList())
    val had = gesture != Gesture.NONE
    reset()
    if (had) view.invalidate()
  }

  private fun reset() {
    gesture = Gesture.NONE
    placement = null
    smoother.reset()
    erased.clear()
    // Keep consuming the rest of a gesture we claimed (pointerId stays until the next DOWN).
  }

  private fun noteStylus(tool: Int) {
    val sink = store.sink
    if (tool == MotionEvent.TOOL_TYPE_ERASER && !store.eraserSeen) {
      store.eraserSeen = true
      store.stylusSeen = true
      sink?.onStylus("ERASER")
    } else if (!store.stylusSeen) {
      store.stylusSeen = true
      sink?.onStylus(if (tool == MotionEvent.TOOL_TYPE_ERASER) "ERASER" else "STYLUS")
    }
  }

  private fun toPageClamped(pl: InkPlacement, x: Float, y: Float) {
    pl.toPage(x, y, pt)
    val v = pl.visible
    pt[0] = pt[0].coerceIn(v.left, v.right)
    pt[1] = pt[1].coerceIn(v.top, v.bottom)
  }

  /** Stored for the future pressure-sensitive path; v1 draws constant width. */
  private fun pressureAt(e: MotionEvent, i: Int, h: Int): Float {
    if (!byStylus) return FINGER_PRESSURE
    return (if (h < 0) e.getPressure(i) else e.getHistoricalPressure(i, h)).coerceIn(0f, 1f)
  }

  private fun isCanceled(e: MotionEvent) =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && e.flags and MotionEvent.FLAG_CANCELED != 0

  private companion object {
    const val ZOOM_LAYER_MAX = 1.02f
    const val LAYER_MIN_STROKES = 12
    const val ERASER_RADIUS_DP = 12f
    /** Decimation distance in device pixels. */
    const val MIN_DISTANCE_PX = 0.6f
    const val FINGER_PRESSURE = 0.5f

    /**
     * Night for ink: inverts lightness but keeps hue (c' = c − 2·luma, stretched and offset like the
     * page's Night matrix), so black ink turns into the same soft off-white as the notes while a red
     * pen stays red instead of turning cyan.
     */
    val nightInkFilter: ColorFilter = run {
      val a = 1.08f
      val wr = 0.2126f
      val wg = 0.7152f
      val wb = 0.0722f
      ColorMatrixColorFilter(
          ColorMatrix(
              floatArrayOf(
                  a * (1 - 2 * wr), -2 * a * wg, -2 * a * wb, 0f, 258f,
                  -2 * a * wr, a * (1 - 2 * wg), -2 * a * wb, 0f, 254f,
                  -2 * a * wr, -2 * a * wg, a * (1 - 2 * wb), 0f, 246f,
                  0f, 0f, 0f, 1f, 0f)))
    }
  }
}
