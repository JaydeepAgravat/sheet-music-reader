package com.alphastack.scorereader.renderer

import com.alphastack.scorereader.renderer.core.CoverRenderer
import com.alphastack.scorereader.renderer.core.RenderEngine
import com.alphastack.scorereader.specs.NativeScoreRendererSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.roundToInt

class ScoreRendererModule(reactContext: ReactApplicationContext) : NativeScoreRendererSpec(reactContext) {

  private val engine = RenderEngine.get(reactContext)
  private val openedIds = mutableSetOf<String>()

  override fun getName() = NAME

  override fun open(path: String, promise: Promise) {
    io.execute {
      val t0 = System.nanoTime()
      try {
        val session = engine.open(path.removePrefix("file://"))
        synchronized(openedIds) { openedIds += session.docId }
        val sizes = Arguments.createArray()
        session.pageSizes.forEach {
          sizes.pushDouble(it.widthPt.toDouble())
          sizes.pushDouble(it.heightPt.toDouble())
        }
        promise.resolve(
            Arguments.createMap().apply {
              putString("docId", session.docId)
              putInt("pageCount", session.pageCount)
              putArray("pageSizes", sizes)
              putDouble("openMs", (System.nanoTime() - t0) / 1e6)
            })
      } catch (t: Throwable) {
        promise.reject("E_OPEN", t.message ?: t.javaClass.simpleName, t)
      }
    }
  }

  override fun close(docId: String) {
    synchronized(openedIds) { openedIds -= docId }
    engine.close(docId)
  }

  override fun getStats(): WritableMap {
    val s = engine.store.stats()
    return Arguments.createMap().apply {
      putInt("entries", s.entries)
      putDouble("bytes", s.bytes.toDouble())
      putInt("pooled", s.pooled)
      putDouble("pooledBytes", s.pooledBytes.toDouble())
      putDouble("maxBytes", s.maxBytes.toDouble())
      putInt("openDocuments", synchronized(openedIds) { openedIds.size })
    }
  }

  override fun clearCache() = engine.store.clear()

  override fun nowMs(): Double = android.os.SystemClock.elapsedRealtimeNanos() / 1e6

  override fun renderCover(path: String, outPath: String, widthPx: Double, aspect: Double, promise: Promise) {
    io.execute {
      try {
        val r = CoverRenderer.render(File(path.removePrefix("file://")), File(outPath.removePrefix("file://")), widthPx.roundToInt(), aspect)
        promise.resolve(
            Arguments.createMap().apply {
              putInt("width", r.width)
              putInt("height", r.height)
              putInt("pageCount", r.pageCount)
            })
      } catch (t: Throwable) {
        promise.reject("E_OPEN", t.message ?: t.javaClass.simpleName, t)
      }
    }
  }

  override fun listTestPdfs(promise: Promise) {
    io.execute {
      val dir = File(reactApplicationContext.filesDir, "test-pdfs")
      val out = Arguments.createArray()
      dir.listFiles()?.sortedBy { it.name }?.forEach { f ->
        out.pushMap(
            Arguments.createMap().apply {
              putString("name", f.name)
              putString("path", f.absolutePath)
              putDouble("bytes", f.length().toDouble())
            })
      }
      promise.resolve(out)
    }
  }

  override fun invalidate() {
    // JS reloaded / app destroyed: close anything JS opened so render threads don't leak.
    synchronized(openedIds) {
      openedIds.forEach { engine.close(it) }
      openedIds.clear()
    }
    super.invalidate()
  }

  companion object {
    const val NAME = "ScoreRenderer"
    private val io = Executors.newCachedThreadPool { r -> Thread(r, "score-renderer-io") }
  }
}
