package com.alphastack.scorereader.renderer.core

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Handler
import android.os.Looper
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Process-wide PDF page renderer. Owns open documents, the bitmap cache and memory policy.
 * Views subscribe for bitmaps; the RN module opens/closes documents. Callbacks arrive on main.
 */
class RenderEngine private constructor(context: Context) {

  interface Listener {
    fun onPageRendered(entry: PageBitmap)
    fun onPageFailed(key: RenderKey, error: Throwable) {}
  }

  private val main = Handler(Looper.getMainLooper())
  private val sessions = ConcurrentHashMap<String, DocumentSession>()
  private val listeners = CopyOnWriteArraySet<Listener>()
  private val memoryClassMb: Int =
      (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).memoryClass

  /** Budget scales with the device: ~40% of the app's memory class, 64–192 MB. */
  val defaultBudget: Long = (memoryClassMb * 1024L * 1024L * 0.4).toLong().coerceIn(64L shl 20, 192L shl 20)
  val store = BitmapStore(defaultBudget)

  init {
    context.applicationContext.registerComponentCallbacks(
        object : ComponentCallbacks2 {
          override fun onTrimMemory(level: Int) = trimMemory(level)
          override fun onConfigurationChanged(newConfig: Configuration) {}
          @Deprecated("Deprecated in Java") override fun onLowMemory() = store.trimTo(0)
        })
  }

  /** Opens a PDF. Blocks until parsed — call off the main thread. */
  fun open(path: String): DocumentSession {
    val file = File(path)
    require(file.isFile) { "File not found: $path" }
    val docId = UUID.randomUUID().toString()
    val session =
        DocumentSession(
            docId,
            file,
            store,
            onRendered = { entry ->
              // Atomic with close(): a document removed from `sessions` never gets pages cached.
              val kept =
                  synchronized(store) {
                    if (sessions.containsKey(docId)) store.put(entry).let { true } else store.recycleUnused(entry.bitmap).let { false }
                  }
              if (kept) main.post { listeners.forEach { it.onPageRendered(entry) } }
            },
            onFailed = { key, t -> main.post { listeners.forEach { it.onPageFailed(key, t) } } },
        )
    try {
      session.awaitOpen()
    } catch (t: Throwable) {
      session.close()
      throw t
    }
    sessions[docId] = session
    return session
  }

  fun session(docId: String): DocumentSession? = sessions[docId]

  fun close(docId: String) {
    synchronized(store) {
      sessions.remove(docId)?.close()
      store.evictDoc(docId)
    }
  }

  fun request(key: RenderKey, priority: Int, owner: Any) {
    sessions[key.docId]?.request(key, priority, owner)
  }

  fun cancelFor(docId: String, owner: Any, keep: (RenderKey) -> Boolean) {
    sessions[docId]?.cancelFor(owner, keep)
  }

  fun addListener(l: Listener) = listeners.add(l)

  fun removeListener(l: Listener) = listeners.remove(l)

  private fun trimMemory(level: Int) {
    when {
      level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> store.trimTo(0)
      level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE -> store.trimTo(store.maxBytes / 4)
      level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> store.trimTo(store.maxBytes / 2)
      // Foreground pressure: keep only what's on screen and ±1.
      level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> store.trimTo(store.maxBytes / 2)
    }
  }

  companion object {
    @Volatile private var instance: RenderEngine? = null

    fun get(context: Context): RenderEngine =
        instance ?: synchronized(this) { instance ?: RenderEngine(context.applicationContext).also { instance = it } }
  }
}
