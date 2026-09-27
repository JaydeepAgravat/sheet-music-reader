package com.alphastack.scorereader.ink

/**
 * Stroke eraser geometry, in page points: a stroke is hit when the eraser centre lies within
 * radius + half the stroke width of any of its segments. The normalised bbox rejects almost every
 * stroke before the per-segment loop, so a pass over thousands of strokes stays well under a frame.
 */
object InkHitTest {
  fun hits(stroke: InkStroke, x: Float, y: Float, radiusPt: Float, pageW: Float, pageH: Float): Boolean {
    if (pageW <= 0f || pageH <= 0f || stroke.pointCount == 0) return false
    val reach = radiusPt + stroke.widthPt / 2f
    val nx = x / pageW
    val ny = y / pageH
    val rx = reach / pageW
    val ry = reach / pageH
    if (nx < stroke.minX - rx || nx > stroke.maxX + rx || ny < stroke.minY - ry || ny > stroke.maxY + ry) return false

    val pts = stroke.points
    val reach2 = reach * reach
    var ax = pts[0] * pageW
    var ay = pts[1] * pageH
    if (stroke.pointCount == 1) return dist2(x, y, ax, ay) <= reach2
    var i = 3
    while (i + 1 < pts.size) {
      val bx = pts[i] * pageW
      val by = pts[i + 1] * pageH
      if (segmentDist2(x, y, ax, ay, bx, by) <= reach2) return true
      ax = bx
      ay = by
      i += 3
    }
    return false
  }

  /** Ids of [strokes] hit at (x, y). */
  fun hitIds(strokes: List<InkStroke>, x: Float, y: Float, radiusPt: Float, pageW: Float, pageH: Float): List<String> {
    var out: ArrayList<String>? = null
    for (s in strokes) {
      if (hits(s, x, y, radiusPt, pageW, pageH)) (out ?: ArrayList<String>().also { out = it }).add(s.id)
    }
    return out ?: emptyList()
  }

  private fun dist2(x: Float, y: Float, ax: Float, ay: Float): Float {
    val dx = x - ax
    val dy = y - ay
    return dx * dx + dy * dy
  }

  private fun segmentDist2(x: Float, y: Float, ax: Float, ay: Float, bx: Float, by: Float): Float {
    val vx = bx - ax
    val vy = by - ay
    val len2 = vx * vx + vy * vy
    if (len2 == 0f) return dist2(x, y, ax, ay)
    val t = (((x - ax) * vx + (y - ay) * vy) / len2).coerceIn(0f, 1f)
    return dist2(x, y, ax + t * vx, ay + t * vy)
  }
}
