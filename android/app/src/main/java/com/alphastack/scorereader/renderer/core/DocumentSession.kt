package com.alphastack.scorereader.renderer.core

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Log
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.PriorityBlockingQueue
import java.util.concurrent.atomic.AtomicLong

/**
 * One open PDF with its own render thread. PdfRenderer is not thread-safe and allows one open page
 * at a time, so every PdfRenderer call happens on [thread] — including close(), which runs only
 * after the queue is drained. That ordering is what prevents the "fast close" SIGSEGV class.
 */
class DocumentSession internal constructor(
    val docId: String,
    private val file: File,
    private val store: BitmapStore,
    private val onRendered: (PageBitmap) -> Unit,
    private val onFailed: (RenderKey, Throwable) -> Unit,
) {
  private val queue = PriorityBlockingQueue<Task>()
  private val pending = HashMap<RenderKey, Task>()
  private val seq = AtomicLong()
  @Volatile private var closing = false
  private val opened = CountDownLatch(1)
  @Volatile private var openError: Throwable? = null

  lateinit var pageSizes: List<PageSize>
    private set

  val pageCount: Int
    get() = pageSizes.size

  private var renderer: PdfRenderer? = null
  private var pfd: ParcelFileDescriptor? = null

  private val thread =
      Thread({ loop() }, "pdf-render-$docId").apply {
        priority = Thread.NORM_PRIORITY + 1
        start()
      }

  /** Blocks until the document is open (or failed). Called off the main thread. */
  fun awaitOpen(): DocumentSession {
    opened.await()
    openError?.let { throw it }
    return this
  }

  /**
   * Queue a render on behalf of [owner] (a view, a thumbnail job…). Re-requesting a pending key
   * adds the owner and can only raise its priority.
   */
  fun request(key: RenderKey, priority: Int, owner: Any) {
    if (closing) return
    synchronized(pending) {
      val existing = pending[key]
      if (existing != null) {
        existing.owners += owner
        if (priority < existing.priority) {
          queue.remove(existing)
          val bumped = Task(key, priority, seq.incrementAndGet(), existing.owners)
          pending[key] = bumped
          queue.add(bumped)
        }
        return
      }
      val task = Task(key, priority, seq.incrementAndGet(), mutableSetOf(owner))
      pending[key] = task
      queue.add(task)
    }
  }

  /**
   * Withdraw [owner]'s interest in queued renders it no longer needs. A render is dropped only
   * when nobody wants it any more, so one view can't cancel another view's pages.
   */
  fun cancelFor(owner: Any, keep: (RenderKey) -> Boolean) {
    synchronized(pending) {
      val drop = ArrayList<Task>()
      for (t in pending.values) {
        if (owner in t.owners && !keep(t.key)) {
          t.owners -= owner
          if (t.owners.isEmpty()) drop += t
        }
      }
      drop.forEach {
        pending.remove(it.key)
        queue.remove(it)
      }
    }
  }

  /** Cancels everything, closes the renderer on its own thread, then ends the thread. */
  fun close() {
    if (closing) return
    closing = true
    synchronized(pending) {
      pending.clear()
      queue.clear()
    }
    queue.add(Task.POISON)
  }

  private fun loop() {
    try {
      val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
      pfd = fd
      val r = PdfRenderer(fd)
      renderer = r
      // Page sizes up front: JS needs aspect ratios for layout before any bitmap exists.
      // openPage() parses only the page dictionary (no content decode), so this is cheap.
      pageSizes =
          List(r.pageCount) { i -> r.openPage(i).use { p -> PageSize(p.width.toFloat(), p.height.toFloat()) } }
    } catch (t: Throwable) {
      openError = t
      closeQuietly()
      opened.countDown()
      return
    }
    opened.countDown()

    while (true) {
      val task = queue.take()
      if (task === Task.POISON || closing) break
      synchronized(pending) { if (pending[task.key] !== task) return@synchronized null else pending.remove(task.key) } ?: continue
      if (store.get(task.key) != null) continue
      try {
        val entry = render(task.key)
        // close() may have arrived mid-render: don't cache pages of a closed document.
        if (closing) store.recycleUnused(entry.bitmap) else onRendered(entry)
      } catch (t: Throwable) {
        Log.w(TAG, "render failed ${task.key}", t)
        onFailed(task.key, t)
      }
    }
    closeQuietly()
  }

  private fun render(key: RenderKey): PageBitmap {
    val r = renderer ?: error("renderer closed")
    val t0 = SystemClock.elapsedRealtimeNanos()
    val bitmap = store.obtain(key.widthPx, key.heightPx) ?: Bitmap.createBitmap(key.widthPx, key.heightPx, Bitmap.Config.ARGB_8888)
    // PDF pages are transparent; paper must be white before rendering (filters tint it later).
    bitmap.eraseColor(Color.WHITE)
    r.openPage(key.page).use { page ->
      val c = key.crop
      val cropW = (c.r - c.l) / 1000f * page.width
      val cropH = (c.b - c.t) / 1000f * page.height
      val m = Matrix()
      m.setTranslate(-c.l / 1000f * page.width, -c.t / 1000f * page.height)
      m.postScale(key.widthPx / cropW, key.heightPx / cropH)
      page.render(bitmap, null, m, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
    }
    val ms = (SystemClock.elapsedRealtimeNanos() - t0) / 1e6
    return PageBitmap(key, bitmap, ms)
  }

  private fun closeQuietly() {
    try {
      renderer?.close()
    } catch (_: Throwable) {}
    try {
      pfd?.close()
    } catch (_: Throwable) {}
    renderer = null
    pfd = null
  }

  private class Task(val key: RenderKey, val priority: Int, val order: Long, val owners: MutableSet<Any> = HashSet()) :
      Comparable<Task> {
    override fun compareTo(other: Task): Int =
        if (priority != other.priority) priority.compareTo(other.priority) else order.compareTo(other.order)

    companion object {
      val POISON = Task(RenderKey("", -1, 0, 0), Int.MIN_VALUE, Long.MIN_VALUE)
    }
  }

  companion object {
    private const val TAG = "DocumentSession"
  }
}
