package com.alphastack.scorereader.ink

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InkStoreTest {
  private fun stroke(id: String, page: Int) = InkStroke(id, page, InkKind.PEN, 0, 1f, floatArrayOf(0.5f, 0.5f, 0.5f))

  @Test
  fun versionsBumpPerPageAndListenersHearChanges() {
    val store = InkStore()
    val heard = ArrayList<Pair<String, Int>>()
    store.addListener { key, page -> heard += key to page }

    assertEquals(0L, store.version("a", 0))
    store.add("a", listOf(stroke("1", 0), stroke("2", 0), stroke("3", 2)))
    val v0 = store.version("a", 0)
    val v2 = store.version("a", 2)
    assertTrue(v0 > 0 && v2 > 0)
    assertEquals(0L, store.version("a", 1))
    assertEquals(setOf("a" to 0, "a" to 2), heard.toSet())

    heard.clear()
    store.remove("a", listOf("3", "missing"))
    assertEquals(v0, store.version("a", 0))
    assertTrue(store.version("a", 2) > v2)
    assertEquals(listOf("a" to 2), heard)
    assertEquals(listOf("1", "2"), store.strokes("a", 0).map { it.id })
  }

  @Test
  fun addReplacesById() {
    val store = InkStore()
    store.add("a", listOf(stroke("1", 0), stroke("2", 0)))
    store.add("a", listOf(stroke("1", 0)))
    assertEquals(listOf("1", "2"), store.strokes("a", 0).map { it.id }) // in place
    store.add("a", listOf(stroke("1", 4)))
    assertEquals(listOf("2"), store.strokes("a", 0).map { it.id })
    assertEquals(listOf("1"), store.strokes("a", 4).map { it.id })
  }

  @Test
  fun removeReturnsRemovedAndIgnoresUnknown() {
    val store = InkStore()
    store.add("a", listOf(stroke("1", 0), stroke("2", 1)))
    assertEquals(setOf("1", "2"), store.remove("a", listOf("1", "2", "x")).map { it.id }.toSet())
    assertTrue(store.remove("a", listOf("1")).isEmpty())
    assertTrue(store.remove("nope", listOf("1")).isEmpty())
  }

  @Test
  fun releaseDropsInkAndVersionsNeverRepeat() {
    val store = InkStore()
    store.add("a", listOf(stroke("1", 0)))
    val before = store.version("a", 0)
    val heard = ArrayList<Int>()
    store.addListener { _, page -> heard += page }
    store.release("a")
    assertEquals(listOf(0), heard)
    assertEquals(0L, store.version("a", 0))
    assertTrue(store.strokes("a", 0).isEmpty())
    store.add("a", listOf(stroke("1", 0)))
    assertTrue(store.version("a", 0) > before)
    store.add("b", listOf(stroke("1", 0))) // keys are independent
    assertEquals(1, store.strokes("a", 0).size)
  }
}
