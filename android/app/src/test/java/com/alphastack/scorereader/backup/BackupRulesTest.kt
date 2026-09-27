package com.alphastack.scorereader.backup

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupRulesTest {
  private val sha = "a".repeat(64)

  @Test
  fun entryNames() {
    assertEquals("pdfs/$sha.pdf", BackupRules.pdfEntry(sha))
    assertEquals("covers/$sha.webp", BackupRules.coverEntry(sha))
    assertTrue(BackupRules.isSha256(sha))
    assertFalse(BackupRules.isSha256("A".repeat(64)))
    assertFalse(BackupRules.isSha256("a".repeat(63)))
  }

  @Test
  fun safeNamesAreAccepted() {
    listOf("manifest.json", "library.json", BackupRules.pdfEntry(sha), BackupRules.coverEntry(sha), "a/b/c.txt").forEach {
      assertTrue(it, BackupRules.isSafeEntryName(it))
    }
  }

  @Test
  fun zipSlipNamesAreRejected() {
    listOf(
            "",
            "../evil.pdf",
            "pdfs/../../evil.pdf",
            "pdfs/..",
            "/etc/passwd",
            "pdfs//x.pdf",
            "pdfs/./x.pdf",
            "pdfs\\..\\x.pdf",
            "C:/x.pdf",
            "pdfs/x\u0000.pdf",
            "pdfs/",
            "a".repeat(256),
        )
        .forEach { assertFalse(it, BackupRules.isSafeEntryName(it)) }
  }

  @Test
  fun destinationsMustStayInsideTheRoot() {
    val root = Files.createTempDirectory("bk").toFile()
    try {
      assertTrue(BackupRules.isInside(root, File(root, "library/x.pdf")))
      assertFalse(BackupRules.isInside(root, File(root, "../x.pdf")))
      assertFalse(BackupRules.isInside(root, File(root, "library/../../x.pdf")))
      assertFalse(BackupRules.isInside(root, root))
      assertFalse(BackupRules.isInside(root, File(root.path + "-sibling/x.pdf")))
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun noSpaceMessages() {
    assertTrue(BackupRules.isNoSpaceMessage("write failed: ENOSPC (No space left on device)"))
    assertTrue(BackupRules.isNoSpaceMessage("No space left on device"))
    assertFalse(BackupRules.isNoSpaceMessage(null))
    assertFalse(BackupRules.isNoSpaceMessage("EIO"))
  }

  @Test
  fun hex() {
    assertEquals("00ff10", BackupRules.hex(byteArrayOf(0, -1, 16)))
  }

  @Test
  fun throttleLetsFirstForcedAndSpacedEventsThrough() {
    var now = 1_000L
    val t = ProgressThrottle(100) { now }
    assertTrue(t.ready()) // first
    now += 50
    assertFalse(t.ready())
    assertTrue(t.ready(force = true))
    now += 99
    assertFalse(t.ready())
    now += 1
    assertTrue(t.ready())
    // A burst of 10,000 reports over one second yields ~10 events.
    var emitted = 0
    repeat(10_000) {
      if (it % 10 == 0) now++
      if (t.ready()) emitted++
    }
    assertTrue("emitted $emitted", emitted in 9..11)
  }
}
