package com.alphastack.scorereader.saf

import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PdfRulesTest {

  private fun bytes(prefix: Int, tail: String = "%PDF-1.7\n"): ByteArray =
      ByteArray(prefix) { 'x'.code.toByte() } + tail.toByteArray(Charsets.US_ASCII)

  @Test
  fun headerAtStart() {
    val b = bytes(0)
    assertEquals(0, PdfRules.headerOffset(b, b.size))
  }

  @Test
  fun headerAfterJunkWithinWindow() {
    val b = bytes(500)
    assertEquals(500, PdfRules.headerOffset(b, b.size))
    val edge = bytes(PdfRules.HEADER_WINDOW - 5) // marker ends exactly at the window edge
    assertEquals(PdfRules.HEADER_WINDOW - 5, PdfRules.headerOffset(edge, edge.size))
  }

  @Test
  fun headerBeyondWindowIsRejected() {
    val b = bytes(PdfRules.HEADER_WINDOW - 4) // marker straddles the window edge
    assertEquals(-1, PdfRules.headerOffset(b, b.size))
  }

  @Test
  fun onlyValidBytesAreSearched() {
    val b = bytes(10)
    assertEquals(-1, PdfRules.headerOffset(b, 12))
    assertEquals(-1, PdfRules.headerOffset(ByteArray(0), 0))
    assertEquals(-1, PdfRules.headerOffset("%PDF".toByteArray(), 4))
  }

  @Test
  fun notAPdf() {
    val b = "<html>%PD F-".toByteArray()
    assertEquals(-1, PdfRules.headerOffset(b, b.size))
  }

  @Test
  fun pdfByMimeOrName() {
    assertTrue(PdfRules.isPdf("application/pdf", "score"))
    assertTrue(PdfRules.isPdf("APPLICATION/PDF", null))
    assertTrue(PdfRules.isPdf("application/octet-stream", "Autumn Leaves.PDF"))
    assertTrue(PdfRules.isPdf(null, "a.pdf"))
    assertFalse(PdfRules.isPdf("application/octet-stream", "notes.txt"))
    assertFalse(PdfRules.isPdf("image/png", "pdf"))
    assertFalse(PdfRules.isPdf(null, null))
  }

  @Test
  fun relativeDirJoining() {
    assertEquals("Jazz", PdfRules.childDir("", "Jazz"))
    assertEquals("Jazz/Standards", PdfRules.childDir("Jazz", "Standards"))
  }

  @Test
  fun hiddenNames() {
    assertTrue(PdfRules.isHidden(".thumbnails"))
    assertTrue(PdfRules.isHidden("._score.pdf"))
    assertFalse(PdfRules.isHidden("score.pdf"))
  }

  @Test
  fun sha256Hex() {
    val d = MessageDigest.getInstance("SHA-256").digest("abc".toByteArray())
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", PdfRules.hex(d))
    assertEquals("00ff10", PdfRules.hex(byteArrayOf(0, -1, 16)))
  }

  @Test
  fun folderOrderIsPathThenNameCaseInsensitive() {
    fun f(dir: String, name: String) = SourceFile("u", name, 1, dir, false)
    val sorted =
        listOf(f("jazz", "b.pdf"), f("", "Z.pdf"), f("Jazz/Standards", "a.pdf"), f("", "a.pdf"), f("Jazz", "A.pdf"), f("Classical", "x.pdf"))
            .sortedWith(SourceFile.ORDER)
    assertEquals(
        listOf("/a.pdf", "/Z.pdf", "Classical/x.pdf", "Jazz/A.pdf", "jazz/b.pdf", "Jazz/Standards/a.pdf"),
        sorted.map { "${it.relativeDir}/${it.name}" })
  }
}
