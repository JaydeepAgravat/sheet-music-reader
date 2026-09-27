package com.alphastack.scorereader.ink

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InkHitTestTest {
  private val w = 600f
  private val h = 800f

  /** Horizontal line from (100,100) to (300,100) page points, 2pt wide. */
  private val line = stroke("line", floatArrayOf(100f / w, 100f / h, 0.5f, 300f / w, 100f / h, 0.5f), width = 2f)

  private fun stroke(id: String, pts: FloatArray, width: Float = 2f) = InkStroke(id, 0, InkKind.PEN, 0, width, pts)

  @Test
  fun hitsWithinRadiusPlusHalfWidth() {
    assertTrue(InkHitTest.hits(line, 200f, 110f, 9.5f, w, h)) // 10 ≤ 9.5 + 1
    assertTrue(InkHitTest.hits(line, 305f, 100f, 5f, w, h)) // past the end cap
  }

  @Test
  fun missesOutsideReach() {
    assertFalse(InkHitTest.hits(line, 200f, 111f, 9.5f, w, h))
    assertFalse(InkHitTest.hits(line, 320f, 100f, 5f, w, h))
  }

  @Test
  fun bboxRejectsFarStrokesAndDotsHit() {
    assertFalse(InkHitTest.hits(line, 550f, 700f, 20f, w, h))
    val dot = stroke("dot", floatArrayOf(0.5f, 0.5f, 0.5f))
    assertTrue(InkHitTest.hits(dot, 303f, 400f, 2.5f, w, h))
    assertFalse(InkHitTest.hits(dot, 310f, 400f, 2.5f, w, h))
  }

  @Test
  fun thousandsOfStrokesAreFast() {
    val rnd = java.util.Random(1)
    val strokes =
        List(2000) { i ->
          val x0 = rnd.nextFloat() * 0.9f
          val y0 = rnd.nextFloat() * 0.9f
          stroke("s$i", FloatArray(150 * 3) { k -> when (k % 3) { 0 -> x0 + k / 3 * 0.0005f; 1 -> y0 + (k / 3 % 7) * 0.0003f; else -> 0.5f } })
        }
    InkHitTest.hitIds(strokes, 300f, 400f, 10f, w, h) // warm up
    val t0 = System.nanoTime()
    repeat(20) { InkHitTest.hitIds(strokes, rnd.nextFloat() * w, rnd.nextFloat() * h, 10f, w, h) }
    val perPassMs = (System.nanoTime() - t0) / 1e6 / 20
    assertTrue("pass took $perPassMs ms", perPassMs < 8.0)
    assertEquals(listOf("line"), InkHitTest.hitIds(listOf(line), 150f, 100f, 1f, w, h))
  }
}
