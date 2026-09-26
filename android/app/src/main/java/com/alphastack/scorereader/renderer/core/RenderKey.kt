package com.alphastack.scorereader.renderer.core

/**
 * Identifies one rendered bitmap. Crop edges are quantised to 1/1000 of the page so tiny float
 * differences don't defeat the cache.
 */
data class RenderKey(
    val docId: String,
    val page: Int,
    val widthPx: Int,
    val heightPx: Int,
    val crop: Crop = Crop.FULL,
) {
  val byteCount: Int
    get() = widthPx * heightPx * 4

  data class Crop(val l: Int, val t: Int, val r: Int, val b: Int) {
    companion object {
      val FULL = Crop(0, 0, 1000, 1000)

      fun of(l: Float, t: Float, r: Float, b: Float) =
          Crop(q(l), q(t), q(r), q(b)).takeIf { it.r > it.l && it.b > it.t } ?: FULL

      private fun q(v: Float) = (v.coerceIn(0f, 1f) * 1000f).toInt()
    }
  }
}

/** Lower value = rendered sooner. */
object Priority {
  const val VISIBLE = 0
  const val PREVIEW = 1
  /** Neighbours get NEIGHBOR + distance (±1 before ±2). */
  const val NEIGHBOR = 2
  const val THUMBNAIL = 20
}

data class PageSize(val widthPt: Float, val heightPt: Float)
