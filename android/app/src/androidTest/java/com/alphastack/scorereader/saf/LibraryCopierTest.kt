package com.alphastack.scorereader.saf

import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import kotlin.random.Random
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LibraryCopierTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val dir = File(context.cacheDir, "copier-test")
  private val copier = LibraryCopier(context)

  @Before
  fun clean() {
    dir.deleteRecursively()
    dir.mkdirs()
  }

  private fun pdf(pages: Int, name: String = "src.pdf"): File {
    val doc = PdfDocument()
    repeat(pages) { i -> doc.finishPage(doc.startPage(PdfDocument.PageInfo.Builder(400, 600, i + 1).create())) }
    val f = File(dir, name)
    f.outputStream().use { doc.writeTo(it) }
    doc.close()
    return f
  }

  private fun sha256(f: File) = PdfRules.hex(MessageDigest.getInstance("SHA-256").digest(f.readBytes()))

  private fun assertNoTemp(dest: File) = assertFalse("temp file removed", File(dest.path + ".part").exists())

  private fun expectCode(code: String, block: () -> Unit) {
    try {
      block()
      fail("expected $code")
    } catch (e: LibraryCopier.CopyException) {
      assertEquals(code, e.code)
    }
  }

  @Test
  fun copiesAndHashes() {
    val src = pdf(3)
    val dest = File(dir, "library/nested/a.pdf") // parents don't exist yet
    val r = copier.copy(Uri.fromFile(src), dest)
    assertEquals(dest.absolutePath, r.file.absolutePath)
    assertEquals(src.length(), r.size)
    assertEquals(sha256(src), r.sha256)
    assertArrayEquals(src.readBytes(), dest.readBytes())
    assertNoTemp(dest)
  }

  @Test
  fun largeFileSpansManyBuffers() {
    // A valid header followed by ~1 MiB of noise: exercises the 64 KiB loop and header capture.
    val src = File(dir, "big.pdf")
    src.writeBytes(pdf(1).readBytes() + Random(7).nextBytes(1_000_003))
    val dest = File(dir, "big-out.pdf")
    val r = copier.copy(Uri.fromFile(src), dest)
    assertEquals(src.length(), r.size)
    assertEquals(sha256(src), r.sha256)
    assertNoTemp(dest)
  }

  @Test
  fun acceptsLeadingJunk() {
    val src = File(dir, "junk.pdf")
    src.writeBytes(ByteArray(700) { 0x20 } + pdf(1).readBytes())
    val r = copier.copy(Uri.fromFile(src), File(dir, "junk-out.pdf"))
    assertEquals(sha256(src), r.sha256)
  }

  @Test
  fun replacesExistingDestination() {
    val dest = File(dir, "same.pdf").apply { writeText("old") }
    val src = pdf(2)
    copier.copy(Uri.fromFile(src), dest)
    assertArrayEquals(src.readBytes(), dest.readBytes())
  }

  @Test
  fun rejectsNonPdf() {
    val src = File(dir, "fake.pdf").apply { writeBytes(Random(1).nextBytes(200_000)) }
    val dest = File(dir, "fake-out.pdf")
    expectCode(LibraryCopier.E_NOT_PDF) { copier.copy(Uri.fromFile(src), dest) }
    assertFalse(dest.exists())
    assertNoTemp(dest)
  }

  @Test
  fun rejectsTinyNonPdf() {
    val src = File(dir, "tiny.pdf").apply { writeText("%PD") }
    val dest = File(dir, "tiny-out.pdf")
    expectCode(LibraryCopier.E_NOT_PDF) { copier.copy(Uri.fromFile(src), dest) }
    assertNoTemp(dest)
  }

  @Test
  fun missingSourceIsCopyError() {
    val dest = File(dir, "missing-out.pdf")
    expectCode(LibraryCopier.E_COPY) { copier.copy(Uri.fromFile(File(dir, "nope.pdf")), dest) }
    assertFalse(dest.exists())
    assertNoTemp(dest)
  }

  @Test
  fun concurrentCopiesDontInterfere() {
    val a = pdf(1, "a.pdf")
    val b = pdf(5, "b.pdf")
    val results = arrayOfNulls<LibraryCopier.Result>(2)
    val threads =
        listOf(a, b).mapIndexed { i, src -> Thread { results[i] = copier.copy(Uri.fromFile(src), File(dir, "c$i.pdf")) } }
    threads.forEach { it.start() }
    threads.forEach { it.join() }
    assertEquals(sha256(a), results[0]!!.sha256)
    assertEquals(sha256(b), results[1]!!.sha256)
    assertTrue(File(dir, "c1.pdf").length() == b.length())
  }
}
