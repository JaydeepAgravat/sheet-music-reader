package com.alphastack.scorereader.renderer.core

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Library cover thumbnails: the top of page 1 as a small lossy WebP. Uses its own PdfRenderer so
 * covers never queue behind (or evict) the reader's renders. Blocking — call off the main thread.
 */
object CoverRenderer {

  data class Result(val width: Int, val height: Int, val pageCount: Int)

  /** Thrown for password-protected PDFs, which PdfRenderer can't open. */
  class PasswordProtectedException(cause: Throwable) : IOException("PASSWORD", cause)

  fun render(pdf: File, out: File, widthPx: Int, aspect: Double): Result {
    val w = widthPx.coerceIn(1, MAX_WIDTH)
    var pfd: ParcelFileDescriptor? = null
    var renderer: PdfRenderer? = null
    var bitmap: Bitmap? = null
    try {
      pfd = ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY)
      renderer =
          try {
            PdfRenderer(pfd)
          } catch (e: SecurityException) {
            // PdfRenderer reports encrypted documents as a SecurityException ("…requires password…").
            val msg = e.message.orEmpty().lowercase()
            if ("password" in msg || "encrypt" in msg) throw PasswordProtectedException(e) else throw e
          }
      val pageCount = renderer.pageCount
      if (pageCount == 0) throw IOException("PDF has no pages")
      val bmp =
          renderer.openPage(0).use { page ->
            val scale = w / page.width.toFloat()
            val fullH = (page.height * scale).roundToInt().coerceAtLeast(1)
            val h = if (aspect > 0) min(fullH, (w / aspect).roundToInt().coerceAtLeast(1)) else fullH
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { b ->
              bitmap = b
              // PDF pages are transparent; covers sit on white paper. The bitmap clips the page's
              // lower part, which is exactly the top crop we want.
              b.eraseColor(Color.WHITE)
              page.render(b, null, Matrix().apply { setScale(scale, scale) }, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            }
          }
      write(bmp, out)
      return Result(bmp.width, bmp.height, pageCount)
    } finally {
      bitmap?.recycle()
      try {
        renderer?.close()
      } catch (_: Throwable) {}
      try {
        pfd?.close()
      } catch (_: Throwable) {}
    }
  }

  /** Temp file + rename, so a reader never sees a half-written cover. */
  private fun write(bitmap: Bitmap, out: File) {
    out.parentFile?.mkdirs()
    val tmp = File(out.parentFile, ".${out.name}.tmp")
    try {
      FileOutputStream(tmp).use { stream ->
        if (!bitmap.compress(webpFormat(), QUALITY, stream)) throw IOException("WebP encode failed")
      }
      if (!tmp.renameTo(out)) {
        out.delete()
        if (!tmp.renameTo(out)) throw IOException("Can't write ${out.path}")
      }
    } finally {
      tmp.delete()
    }
  }

  @Suppress("DEPRECATION")
  private fun webpFormat() =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP

  private const val QUALITY = 82
  private const val MAX_WIDTH = 4096
}
