package com.alphastack.scorereader.renderer.core

import android.graphics.Bitmap
import android.util.Log

/**
 * A rendered page bitmap with a reference count. Views hold a reference while drawing it, so a
 * bitmap is never reused (pooled) while it may still be on screen.
 */
class PageBitmap internal constructor(val key: RenderKey, val bitmap: Bitmap, val renderMs: Double) {
  internal var refs = 0
  internal var evicted = false
}

/**
 * LRU cache of rendered pages + a small pool of recyclable bitmaps, bounded by bytes.
 * Thread-safe: called from the main thread (views) and render threads.
 */
class BitmapStore(@Volatile var maxBytes: Long) {
  private val lru = LinkedHashMap<RenderKey, PageBitmap>(16, 0.75f, true)
  private val pool = ArrayList<Bitmap>()
  private var cachedBytes = 0L
  private var pooledBytes = 0L

  @Synchronized
  fun get(key: RenderKey): PageBitmap? = lru[key]

  /** Returns and pins the bitmap; callers must [release] it. */
  @Synchronized
  fun acquire(key: RenderKey): PageBitmap? = lru[key]?.also { it.refs++ }

  @Synchronized
  fun release(entry: PageBitmap) {
    entry.refs--
    if (entry.refs <= 0 && entry.evicted) toPool(entry.bitmap)
  }

  @Synchronized
  fun put(entry: PageBitmap) {
    lru.remove(entry.key)?.let { dropEntry(it) }
    lru[entry.key] = entry
    cachedBytes += entry.bitmap.allocationByteCount
    trimTo(maxBytes)
  }

  /** A pooled bitmap of exactly this size (content is stale; caller must clear it), or null. */
  @Synchronized
  fun obtain(width: Int, height: Int): Bitmap? {
    val i = pool.indexOfFirst { it.width == width && it.height == height && !it.isRecycled }
    if (i < 0) return null
    val b = pool.removeAt(i)
    pooledBytes -= b.allocationByteCount
    return b
  }

  /** Return an unused bitmap (e.g. render was cancelled) to the pool. */
  @Synchronized fun recycleUnused(bitmap: Bitmap) = toPool(bitmap)

  @Synchronized
  fun evictDoc(docId: String) {
    lru.values.filter { it.key.docId == docId }.forEach {
      lru.remove(it.key)
      dropEntry(it)
    }
  }

  @Synchronized
  fun trimTo(bytes: Long) {
    val it = lru.values.iterator()
    while (cachedBytes > bytes && it.hasNext()) {
      val e = it.next()
      it.remove()
      dropEntry(e)
    }
    // The pool is part of the memory budget, not extra: at most a fifth of it (≈ one full page).
    while (pool.isNotEmpty() && (pooledBytes > poolBytes || cachedBytes + pooledBytes > maxBytes + poolBytes)) {
      val b = pool.removeAt(0)
      pooledBytes -= b.allocationByteCount
    }
  }

  @Synchronized
  fun clear() {
    lru.values.toList().forEach { dropEntry(it) }
    lru.clear()
    pool.clear()
    pooledBytes = 0
  }

  @Synchronized
  fun stats() = Stats(lru.size, cachedBytes, pool.size, pooledBytes, maxBytes)

  data class Stats(val entries: Int, val bytes: Long, val pooled: Int, val pooledBytes: Long, val maxBytes: Long)

  private fun dropEntry(e: PageBitmap) {
    cachedBytes -= e.bitmap.allocationByteCount
    e.evicted = true
    if (e.refs <= 0) toPool(e.bitmap)
  }

  private fun toPool(b: Bitmap) {
    if (b.isRecycled || !b.isMutable) return
    if (pooledBytes + b.allocationByteCount > poolBytes) return
    pool.add(b)
    pooledBytes += b.allocationByteCount
  }

  private val poolBytes: Long
    get() = maxBytes / 5

  companion object {
    @Suppress("unused") private const val TAG = "BitmapStore"
    @Suppress("unused") private fun log(msg: String) = Log.d(TAG, msg)
  }
}
