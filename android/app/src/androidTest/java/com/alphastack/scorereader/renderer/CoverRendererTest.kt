package com.alphastack.scorereader.renderer

import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.alphastack.scorereader.renderer.core.CoverRenderer
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CoverRendererTest {
  private val dir = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "cover-test").apply { mkdirs() }

  /** Portrait 2:3 pages with a black bar at the very top. */
  private fun pdf(pages: Int): File {
    val doc = PdfDocument()
    repeat(pages) { i ->
      val page = doc.startPage(PdfDocument.PageInfo.Builder(400, 600, i + 1).create())
      page.canvas.drawRect(0f, 0f, 400f, 20f, Paint().apply { color = Color.BLACK })
      doc.finishPage(page)
    }
    val f = File(dir, "doc$pages.pdf")
    f.outputStream().use { doc.writeTo(it) }
    doc.close()
    return f
  }

  @Test
  fun cropsFromTheTopToTheAspect() {
    val out = File(dir, "covers/a.webp")
    val r = CoverRenderer.render(pdf(3), out, 200, 1.0)
    assertEquals(CoverRenderer.Result(200, 200, 3), r)
    val bmp = BitmapFactory.decodeFile(out.path)
    assertNotNull(bmp)
    assertEquals(200, bmp.width)
    assertEquals(200, bmp.height)
    assertTrue("top bar rendered", Color.red(bmp.getPixel(100, 2)) < 64)
    assertTrue("white paper", Color.red(bmp.getPixel(100, 150)) > 230)
    assertFalse("no temp file left", File(out.parentFile, ".a.webp.tmp").exists())
  }

  @Test
  fun shortPageIsNotPadded() {
    val r = CoverRenderer.render(pdf(1), File(dir, "b.webp"), 200, 0.5) // wants 400 tall; page is 300
    assertEquals(CoverRenderer.Result(200, 300, 1), r)
  }

  @Test(expected = Exception::class)
  fun corruptFileThrows() {
    val bad = File(dir, "bad.pdf").apply { writeText("not a pdf") }
    CoverRenderer.render(bad, File(dir, "c.webp"), 200, 1.0)
  }
}
