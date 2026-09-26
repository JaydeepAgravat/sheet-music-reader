package com.alphastack.scorereader.renderer

import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter

/**
 * Page colour filters applied at draw time (GPU), so switching costs no re-render.
 * Night inverts ink/paper but lands on soft tones (not pure black/white) to avoid glare on stage.
 */
object PageFilters {
  fun forName(name: String?): ColorMatrixColorFilter? =
      when (name) {
        "PAPER" -> matrix(floatArrayOf(
            0.99f, 0f, 0f, 0f, 0f,
            0f, 0.96f, 0f, 0f, 0f,
            0f, 0f, 0.88f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f))
        "SEPIA" -> matrix(floatArrayOf(
            0.393f * 0.85f + 0.15f, 0.769f * 0.85f, 0.189f * 0.85f, 0f, 0f,
            0.349f * 0.85f, 0.686f * 0.85f + 0.15f, 0.168f * 0.85f, 0f, 0f,
            0.272f * 0.85f, 0.534f * 0.85f, 0.131f * 0.85f + 0.15f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f))
        // Invert with a contrast stretch: white AND off-white scanned paper (~#E0) land near
        // black; ink lands on a soft warm off-white (#F2EEE6-ish) rather than glaring pure white.
        "NIGHT" -> matrix(floatArrayOf(
            -1.08f, 0f, 0f, 0f, 258f,
            0f, -1.08f, 0f, 0f, 254f,
            0f, 0f, -1.08f, 0f, 246f,
            0f, 0f, 0f, 1f, 0f))
        // Cleans faded scans: darker ink, whiter paper.
        "CONTRAST" -> {
          val k = 1.45f
          val o = 128f * (1 - k) + 18f
          matrix(floatArrayOf(k, 0f, 0f, 0f, o, 0f, k, 0f, 0f, o, 0f, 0f, k, 0f, o, 0f, 0f, 0f, 1f, 0f))
        }
        else -> null
      }

  private fun matrix(values: FloatArray) = ColorMatrixColorFilter(ColorMatrix(values))
}
