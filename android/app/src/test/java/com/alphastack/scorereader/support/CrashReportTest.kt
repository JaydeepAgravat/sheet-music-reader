package com.alphastack.scorereader.support

import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CrashReportTest {
  private val env =
      CrashReport.Env(
          appName = "Score Reader",
          versionName = "1.0.0",
          versionCode = 7,
          androidRelease = "15",
          sdkInt = 35,
          device = "Samsung SM-X710",
          abi = "arm64-v8a",
      )

  @Test
  fun nativeReportHasHeaderAndWholeCauseChain() {
    val error = IllegalStateException("outer", IllegalArgumentException("root cause"))
    val text = CrashReport.formatNative(env, 0L, "main", error)
    assertTrue(text.startsWith("Score Reader crash report\n"))
    assertTrue(text.contains("Time: 1970-01-01T00:00:00Z\n"))
    assertTrue(text.contains("App: 1.0.0 (build 7)\n"))
    assertTrue(text.contains("Android: 15 (API 35)\n"))
    assertTrue(text.contains("Device: Samsung SM-X710 · arm64-v8a\n"))
    assertTrue(text.contains("Thread: main\n"))
    assertTrue(text.contains("Source: native\n"))
    assertTrue(text.contains("java.lang.IllegalStateException: outer"))
    assertTrue(text.contains("Caused by: java.lang.IllegalArgumentException: root cause"))
  }

  @Test
  fun jsReportWrapsBody() {
    val text = CrashReport.formatJs(env, 0L, "TypeError: x is undefined\n\n")
    assertTrue(text.contains("Source: javascript\n\nTypeError: x is undefined\n"))
    assertTrue(text.endsWith("undefined\n"))
  }

  @Test
  fun shortTextIsUntouched() {
    assertEquals("abc", CrashReport.truncate("abc", 10))
  }

  @Test
  fun truncationKeepsHeadAndTailWithinBudget() {
    val text = "H".repeat(5000) + "M".repeat(100_000) + "T".repeat(5000)
    val out = CrashReport.truncate(text, 2000)
    assertEquals(2000, out.length)
    assertTrue(out.startsWith("HHHH"))
    assertTrue(out.endsWith("TTTT"))
    assertTrue(out.contains("characters cut"))
  }

  @Test
  fun hugeStackIsCappedAt64K() {
    val deep = RuntimeException("boom").apply { stackTrace = Array(20_000) { StackTraceElement("C$it", "m", "F.kt", it) } }
    val out = CrashReport.formatNative(env, 0L, "main", deep)
    assertEquals(CrashReport.MAX_CHARS, out.length)
    assertTrue(out.startsWith("Score Reader crash report"))
  }

  @Test
  fun truncationNeverSplitsSurrogatePairs() {
    val text = "😀".repeat(1000)
    val out = CrashReport.truncate(text, 301)
    out.forEachIndexed { i, c ->
      if (Character.isHighSurrogate(c)) assertTrue(Character.isLowSurrogate(out[i + 1]))
      if (Character.isLowSurrogate(c)) assertTrue(Character.isHighSurrogate(out[i - 1]))
    }
  }

  @Test
  fun deviceName() {
    assertEquals("Samsung SM-X710", CrashReport.deviceName("samsung", "SM-X710"))
    assertEquals("Google Pixel Tablet", CrashReport.deviceName("Google", "Google Pixel Tablet"))
  }

  @Test
  fun combine() {
    assertNull(CrashReport.combine(listOf(null, null)))
    assertNull(CrashReport.combine(listOf("  ", null)))
    assertEquals("a\n", CrashReport.combine(listOf("a\n", null)))
    assertEquals("a\n\n────────\n\nb\n", CrashReport.combine(listOf("a", "b")))
  }

  class JavascriptException(msg: String) : RuntimeException(msg)

  @Test
  fun jsDuplicateOnlyWhenFreshJsReportExists() {
    val dir = Files.createTempDirectory("crash").toFile()
    val js = java.io.File(dir, "js.txt")
    val now = System.currentTimeMillis()
    assertFalse(CrashReport.isDuplicateOfJsReport(JavascriptException("x"), js, now))
    js.writeText("report")
    js.setLastModified(now - 1000)
    assertTrue(CrashReport.isDuplicateOfJsReport(JavascriptException("x"), js, now))
    assertFalse(CrashReport.isDuplicateOfJsReport(RuntimeException("x"), js, now))
    js.setLastModified(now - CrashReport.JS_DEDUPE_WINDOW_MS - 5000)
    assertFalse(CrashReport.isDuplicateOfJsReport(JavascriptException("x"), js, now))
    dir.deleteRecursively()
  }
}
