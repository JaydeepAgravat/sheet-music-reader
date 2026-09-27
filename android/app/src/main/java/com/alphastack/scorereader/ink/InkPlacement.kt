package com.alphastack.scorereader.ink

import android.graphics.Matrix
import android.graphics.RectF

/**
 * One page region a view shows: [clip] in view pixels and [matrix] mapping page points to view
 * pixels exactly as the page bitmap is drawn there. Drawing and touch mapping both go through
 * it, so ink lands where it was drawn in every page mode.
 */
class InkPlacement(val page: Int, val pageW: Float, val pageH: Float, val clip: RectF, val matrix: Matrix) {
  private val inverse = Matrix().also { matrix.invert(it) }
  private val values = FloatArray(9).also { matrix.getValues(it) }

  /** View pixels per page point (horizontal). */
  val scale: Float
    get() = values[Matrix.MSCALE_X]

  /** The part of the page visible through [clip], in page points. */
  val visible: RectF =
      RectF(clip).also {
        inverse.mapRect(it)
        if (!it.intersect(0f, 0f, pageW, pageH)) it.setEmpty()
      }

  fun contains(x: Float, y: Float) = clip.contains(x, y)

  /** View pixels → page points, written to out[0..1]. */
  fun toPage(x: Float, y: Float, out: FloatArray) {
    out[0] = x
    out[1] = y
    inverse.mapPoints(out, 0, out, 0, 1)
  }

  /** Geometry identity, used to tell whether recorded ink is still valid. */
  fun sameGeometry(o: InkPlacement) =
      page == o.page && pageW == o.pageW && pageH == o.pageH && clip == o.clip && values.contentEquals(o.values)
}
