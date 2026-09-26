package com.alphastack.scorereader.renderer

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.alphastack.scorereader.renderer.core.BitmapStore
import com.alphastack.scorereader.renderer.core.PageBitmap
import com.alphastack.scorereader.renderer.core.RenderKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** The safety property: a bitmap a view is drawing is never handed out for reuse. */
@RunWith(AndroidJUnit4::class)
class BitmapStoreTest {
  private fun entry(page: Int, w: Int = 100, h: Int = 100): PageBitmap {
    val ctor = PageBitmap::class.java.declaredConstructors.first().apply { isAccessible = true }
    return ctor.newInstance(RenderKey("d", page, w, h), Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888), 1.0) as PageBitmap
  }

  private val pageBytes = 100L * 100 * 4

  @Test
  fun evictsLeastRecentlyUsedWithinBudget() {
    val store = BitmapStore(pageBytes * 5 * 3) // pool = budget/5 → room for 3 pooled pages
    repeat(4) { store.put(entry(it)) }
    store.get(RenderKey("d", 0, 100, 100)) // touch page 0
    store.maxBytes = pageBytes * 3
    store.trimTo(store.maxBytes)
    assertNull("page 1 was least recently used", store.get(RenderKey("d", 1, 100, 100)))
    assertTrue(store.get(RenderKey("d", 0, 100, 100)) != null)
    assertTrue(store.stats().bytes <= pageBytes * 3)
  }

  @Test
  fun pinnedBitmapIsNotReusedUntilReleased() {
    val store = BitmapStore(pageBytes * 10)
    val e = entry(0)
    store.put(e)
    val pinned = store.acquire(e.key)!!
    store.trimTo(0) // evict everything while pinned
    assertNull(store.get(e.key))
    assertNull("pinned bitmap must not be in the pool", store.obtain(100, 100))
    store.release(pinned)
    assertSame("released bitmap returns to the pool", e.bitmap, store.obtain(100, 100))
  }

  @Test
  fun poolOnlyReturnsExactSize() {
    val store = BitmapStore(pageBytes * 10)
    store.recycleUnused(Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888))
    assertNull(store.obtain(100, 101))
    val b = store.obtain(100, 100)
    assertTrue(b != null)
    assertNull("each pooled bitmap is handed out once", store.obtain(100, 100))
  }

  @Test
  fun evictDocRemovesOnlyThatDocument() {
    val store = BitmapStore(pageBytes * 10)
    store.put(entry(0))
    val other = PageBitmap::class.java.declaredConstructors.first().apply { isAccessible = true }
        .newInstance(RenderKey("other", 0, 100, 100), Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888), 1.0) as PageBitmap
    store.put(other)
    store.evictDoc("d")
    assertNull(store.get(RenderKey("d", 0, 100, 100)))
    assertNotSame(null, store.get(other.key))
    assertEquals(1, store.stats().entries)
  }
}
