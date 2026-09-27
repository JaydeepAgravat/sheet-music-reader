package com.alphastack.scorereader.ink

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InkSmootherTest {
  @Test
  fun decimatesPointsCloserThanMinDistance() {
    val s = InkSmoother(streamline = 0f)
    s.begin(0f, 0f, 0.5f, minDistance = 1f)
    for (i in 1..100) s.add(i * 0.1f, 0f, 0.5f) // 10 units in 0.1 steps
    // ~one kept point per unit travelled (streamline 0 still lags slightly: t = 1.0 → exact).
    assertTrue("kept ${s.count}", s.count in 9..11)
    val pts = s.points()
    for (i in 1 until s.count) assertTrue(pts[i * 3] - pts[(i - 1) * 3] >= 1f - 1e-4f)
  }

  @Test
  fun streamlineLagsAndEndKeepsTheLiftPoint() {
    val s = InkSmoother(streamline = 0.45f)
    s.begin(0f, 0f, 0.5f, minDistance = 0.01f)
    s.add(10f, 0f, 0.7f)
    val kept = s.points()
    assertTrue(kept[3] > 0f && kept[3] < 10f) // pulled only part of the way
    s.end()
    val pts = s.points()
    assertEquals(10f, pts[(s.count - 1) * 3], 0f)
    assertEquals(0.7f, pts[(s.count - 1) * 3 + 2], 0f)
  }

  @Test
  fun endDoesNotDuplicateAStationaryPoint() {
    val s = InkSmoother()
    s.begin(5f, 5f, 0.5f, minDistance = 0.5f)
    assertFalse(s.add(5f, 5f, 0.5f))
    s.end()
    assertEquals(1, s.count) // a tap stays a single-point dot
  }

  @Test
  fun growsBeyondInitialCapacity() {
    val s = InkSmoother(streamline = 0f)
    s.begin(0f, 0f, 0.5f, minDistance = 0f)
    repeat(1000) { s.add(it + 1f, 0f, 0.5f) }
    assertEquals(1001, s.count)
    s.reset()
    assertEquals(0, s.count)
  }
}
