package com.alphastack.scorereader.ink

import android.graphics.Path

enum class InkKind {
  PEN,
  HIGHLIGHTER;

  companion object {
    fun parse(value: String?) = if (value == "HIGHLIGHTER") HIGHLIGHTER else PEN
  }
}

/**
 * One committed stroke. Points are [x, y, pressure] triples with x/y normalised to the source page,
 * so a stroke is independent of how (or how large) the page is shown. Immutable apart from the
 * cached path, which is built in page-point space on first draw and reused until the page size
 * changes.
 */
class InkStroke(
    val id: String,
    val page: Int,
    val kind: InkKind,
    val color: Int,
    val widthPt: Float,
    val points: FloatArray,
) {
  val pointCount: Int
    get() = points.size / 3

  /** Normalised bounds of the centre line (width not included). */
  val minX: Float
  val minY: Float
  val maxX: Float
  val maxY: Float

  init {
    var x0 = Float.POSITIVE_INFINITY
    var y0 = Float.POSITIVE_INFINITY
    var x1 = Float.NEGATIVE_INFINITY
    var y1 = Float.NEGATIVE_INFINITY
    var i = 0
    while (i + 1 < points.size) {
      val x = points[i]
      val y = points[i + 1]
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      i += 3
    }
    if (x0 > x1) {
      x0 = 0f; x1 = 0f; y0 = 0f; y1 = 0f
    }
    minX = x0; minY = y0; maxX = x1; maxY = y1
  }

  private var path: Path? = null
  private var pathW = 0f
  private var pathH = 0f

  /** The smoothed centre line in page points (UI thread only). */
  fun path(pageW: Float, pageH: Float): Path {
    val cached = path
    if (cached != null && pathW == pageW && pathH == pageH) return cached
    val p = cached ?: Path()
    InkPaths.build(p, points, pointCount, pageW, pageH)
    path = p
    pathW = pageW
    pathH = pageH
    return p
  }
}

/** Smoothed polyline → Path: quadratic Béziers through segment midpoints (C1-continuous, cheap). */
object InkPaths {
  /** Offset for a single-point stroke, so round caps draw a dot even where zero-length paths don't. */
  private const val DOT = 0.01f

  fun build(path: Path, pts: FloatArray, count: Int, sx: Float, sy: Float) {
    path.rewind()
    if (count <= 0) return
    val x0 = pts[0] * sx
    val y0 = pts[1] * sy
    path.moveTo(x0, y0)
    if (count == 1) {
      path.lineTo(x0 + DOT, y0)
      return
    }
    if (count == 2) {
      path.lineTo(pts[3] * sx, pts[4] * sy)
      return
    }
    for (i in 1 until count - 1) {
      val cx = pts[i * 3] * sx
      val cy = pts[i * 3 + 1] * sy
      val nx = pts[(i + 1) * 3] * sx
      val ny = pts[(i + 1) * 3 + 1] * sy
      path.quadTo(cx, cy, (cx + nx) / 2f, (cy + ny) / 2f)
    }
    path.lineTo(pts[(count - 1) * 3] * sx, pts[(count - 1) * 3 + 1] * sy)
  }
}
