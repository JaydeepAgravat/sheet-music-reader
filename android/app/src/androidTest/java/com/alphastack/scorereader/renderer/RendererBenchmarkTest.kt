package com.alphastack.scorereader.renderer

import android.os.Debug
import android.os.SystemClock
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.alphastack.scorereader.renderer.core.PageBitmap
import com.alphastack.scorereader.renderer.core.Priority
import com.alphastack.scorereader.renderer.core.RenderEngine
import com.alphastack.scorereader.renderer.core.RenderKey
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Phase 2 acceptance benchmarks for the renderer core (no React Native involved).
 * Corpus: scripts/gen-test-pdfs.py → scripts/push-test-pdfs.sh (files/test-pdfs).
 * Results are logged as JSON under tag "RendererBench".
 *
 *   adb shell am instrument -w -e class com.alphastack.scorereader.renderer.RendererBenchmarkTest \
 *     com.alphastack.scorereader.test/androidx.test.runner.AndroidJUnitRunner
 */
@RunWith(AndroidJUnit4::class)
class RendererBenchmarkTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val engine = RenderEngine.get(context)
  private val dir = File(context.filesDir, "test-pdfs")
  private val rendered = ConcurrentHashMap<RenderKey, CountDownLatch>()
  private val owner = Any()

  // A 16:10 tablet in portrait, page fitted to width (Galaxy Tab S9-class: 1600 px wide).
  private val targetWidth = 1600

  private val listener =
      object : RenderEngine.Listener {
        override fun onPageRendered(entry: PageBitmap) {
          rendered.getOrPut(entry.key) { CountDownLatch(1) }.countDown()
        }

        override fun onPageFailed(key: RenderKey, error: Throwable) {
          rendered.getOrPut(key) { CountDownLatch(1) }.countDown()
        }
      }

  @Before
  fun setUp() {
    assumeTrue("Test corpus missing — run scripts/push-test-pdfs.sh", File(dir, "scan-300p.pdf").isFile)
    engine.store.clear()
    engine.addListener(listener)
  }

  @After
  fun tearDown() {
    engine.removeListener(listener)
    engine.store.clear()
  }

  private fun f(name: String) = File(dir, name).absolutePath

  private fun keyFor(docId: String, sizes: List<com.alphastack.scorereader.renderer.core.PageSize>, page: Int, width: Int = targetWidth): RenderKey {
    val s = sizes[page]
    return RenderKey(docId, page, width, (width * s.heightPt / s.widthPt).roundToInt())
  }

  private fun awaitRendered(key: RenderKey, timeoutMs: Long = 10_000): Boolean {
    if (engine.store.get(key) != null) return true
    return rendered.getOrPut(key) { CountDownLatch(1) }.await(timeoutMs, TimeUnit.MILLISECONDS) && engine.store.get(key) != null
  }

  private fun pct(values: List<Double>): String {
    if (values.isEmpty()) return "{}"
    val s = values.sorted()
    fun p(q: Double) = s[min(s.size - 1, (q * (s.size - 1)).toInt())]
    fun r(v: Double) = (v * 10).roundToInt() / 10.0
    return """{"n":${s.size},"p50":${r(p(0.5))},"p95":${r(p(0.95))},"p99":${r(p(0.99))},"max":${r(s.last())},"mean":${r(s.average())}}"""
  }

  private fun report(name: String, json: String) {
    Log.i(TAG, """{"bench":"$name",$json}""")
  }

  @Test
  fun corpusOpensAndBrokenFilesFailCleanly() {
    val expected = mapOf("scan-300p.pdf" to 300, "vector-50p.pdf" to 50, "poster-1p.pdf" to 1, "mixed-10p.pdf" to 10, "tiny-1p.pdf" to 1)
    val openMs = StringBuilder()
    for ((name, pages) in expected) {
      val t0 = SystemClock.elapsedRealtimeNanos()
      val s = engine.open(f(name))
      val ms = (SystemClock.elapsedRealtimeNanos() - t0) / 1e6
      openMs.append("\"$name\":${ms.roundToInt()},")
      assertEquals(name, pages, s.pageCount)
      engine.close(s.docId)
    }
    for (bad in listOf("corrupt.pdf", "not-a-pdf.pdf")) {
      try {
        val s = engine.open(f(bad))
        engine.close(s.docId)
        fail("$bad should not open")
      } catch (_: Throwable) {
        // Expected: a clean exception, not a native crash.
      }
    }
    report("open", """"openMs":{${openMs.trimEnd(',')}}""")
  }

  /** First page of the 300-page, ~100 MB scan must be on screen within 1 s of open(). */
  @Test
  fun scanOpensToFirstPageUnderOneSecond() {
    val t0 = SystemClock.elapsedRealtimeNanos()
    val s = engine.open(f("scan-300p.pdf"))
    val openMs = (SystemClock.elapsedRealtimeNanos() - t0) / 1e6
    val key = keyFor(s.docId, s.pageSizes, 0)
    engine.request(key, Priority.VISIBLE, owner)
    assertTrue(awaitRendered(key))
    val firstPageMs = (SystemClock.elapsedRealtimeNanos() - t0) / 1e6
    engine.close(s.docId)
    report("scanFirstPage", """"openMs":${openMs.roundToInt()},"firstPageMs":${firstPageMs.roundToInt()}""")
    assertTrue("first page took ${firstPageMs}ms", firstPageMs < 1000)
  }

  /**
   * Pedal-paced turns (one every 250 ms) with ±2 prefetch, like a player reading.
   * "hit" = next page's bitmap was already cached at the moment of the turn (→ drawn next frame).
   */
  private fun pacedTurns(file: String, turns: Int, paceMs: Long) {
    val s = engine.open(f(file))
    val renderMs = ArrayList<Double>()
    var hits = 0
    var page = 0
    var dir = 1
    fun want(p: Int) {
      engine.request(keyFor(s.docId, s.pageSizes, p), Priority.VISIBLE, owner)
      for (d in 1..2) for (n in intArrayOf(p + d, p - d)) if (n in 0 until s.pageCount) engine.request(keyFor(s.docId, s.pageSizes, n), Priority.NEIGHBOR + d, owner)
    }
    want(0)
    assertTrue(awaitRendered(keyFor(s.docId, s.pageSizes, 0)))
    repeat(turns) {
      if (page + dir !in 0 until s.pageCount) dir = -dir
      page += dir
      val key = keyFor(s.docId, s.pageSizes, page)
      if (engine.store.get(key) != null) hits++
      want(page)
      assertTrue("page $page never rendered", awaitRendered(key))
      engine.store.get(key)?.let { renderMs += it.renderMs }
      SystemClock.sleep(paceMs)
    }
    val stats = engine.store.stats()
    engine.close(s.docId)
    report(
        "paced:$file",
        """"turns":$turns,"paceMs":$paceMs,"hitRate":${(hits * 1000.0 / turns).roundToInt() / 1000.0},"renderMs":${pct(renderMs)},"cacheMB":${stats.bytes shr 20},"budgetMB":${stats.maxBytes shr 20}""")
    assertTrue("hit rate ${hits}/$turns", hits >= turns * 0.97)
  }

  @Test fun pacedTurnsScan() = pacedTurns("scan-300p.pdf", 300, 250)

  @Test fun pacedTurnsVector() = pacedTurns("vector-50p.pdf", 200, 250)

  /** 500 turns as fast as possible: memory must stay bounded and nothing may crash. */
  @Test
  fun rapidTurnsStayWithinMemoryBudget() {
    val s = engine.open(f("scan-300p.pdf"))
    val nativeBefore = Debug.getNativeHeapAllocatedSize()
    var peakCache = 0L
    var peakNative = 0L
    for (i in 0 until 500) {
      val p = (i * 7) % s.pageCount // jump around: worst case for the cache
      engine.request(keyFor(s.docId, s.pageSizes, p), Priority.VISIBLE, owner)
      engine.cancelFor(s.docId, owner) { it.page == p }
      if (i % 10 == 0) {
        peakCache = maxOf(peakCache, engine.store.stats().bytes)
        peakNative = maxOf(peakNative, Debug.getNativeHeapAllocatedSize())
      }
      SystemClock.sleep(5)
    }
    SystemClock.sleep(1500)
    val budget = engine.store.maxBytes
    engine.close(s.docId)
    report(
        "rapid",
        """"turns":500,"peakCacheMB":${peakCache shr 20},"budgetMB":${budget shr 20},"nativeHeapBeforeMB":${nativeBefore shr 20},"peakNativeHeapMB":${peakNative shr 20}""")
    // One in-flight render may land after a trim, so allow a single page over budget.
    assertTrue("cache ${peakCache shr 20} MB > budget", peakCache <= budget + 32L * 1024 * 1024)
  }

  /** Open/close ×100, half of them racing an in-flight render. A native crash kills the test process. */
  @Test
  fun openCloseStress() {
    val times = ArrayList<Double>()
    repeat(100) { i ->
      val t0 = SystemClock.elapsedRealtimeNanos()
      val s = engine.open(f(if (i % 3 == 0) "vector-50p.pdf" else "scan-300p.pdf"))
      times += (SystemClock.elapsedRealtimeNanos() - t0) / 1e6
      val key = keyFor(s.docId, s.pageSizes, 0)
      engine.request(key, Priority.VISIBLE, owner)
      if (i % 2 == 1) awaitRendered(key, 3000)
      engine.close(s.docId)
    }
    SystemClock.sleep(1000)
    assertEquals("pages of closed documents must not stay cached", 0, engine.store.stats().entries)
    report("openClose", """"cycles":100,"openMs":${pct(times)},"threadsAlive":${Thread.getAllStackTraces().keys.count { it.name.startsWith("pdf-render-") && it.isAlive }}""")
    val leaked = Thread.getAllStackTraces().keys.count { it.name.startsWith("pdf-render-") && it.isAlive }
    assertEquals("render threads leaked", 0, leaked)
  }

  /** Worst-case vector page (A0, ~60k ops) at tablet width and at 2× zoom width. */
  @Test
  fun posterRender() {
    val s = engine.open(f("poster-1p.pdf"))
    val out = StringBuilder()
    for (w in listOf(targetWidth, targetWidth * 2)) {
      val key = keyFor(s.docId, s.pageSizes, 0, w)
      engine.request(key, Priority.VISIBLE, owner)
      assertTrue(awaitRendered(key, 30_000))
      out.append("\"w$w\":${engine.store.get(key)!!.renderMs.roundToInt()},")
    }
    engine.close(s.docId)
    report("poster", """"renderMs":{${out.trimEnd(',')}}""")
  }

  companion object {
    private const val TAG = "RendererBench"
  }
}
