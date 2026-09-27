package com.alphastack.scorereader.backup

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.system.ErrnoException
import android.system.OsConstants
import com.alphastack.scorereader.specs.NativeBackupSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.UiThreadUtil
import java.io.File
import java.io.FileNotFoundException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Backup archives: SAF pickers plus a thin adapter from content URIs / threads / events to
 * [BackupZipWriter] and [BackupZipReader] (see BackupZip.kt for the format decisions).
 */
class BackupModule(reactContext: ReactApplicationContext) : NativeBackupSpec(reactContext) {

  private class Pick(val requestCode: Int, val promise: Promise)

  private val pick = AtomicReference<Pick?>(null)
  private val running = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)

  private val activityListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
          val p = pick.get()?.takeIf { it.requestCode == requestCode } ?: return
          if (!pick.compareAndSet(p, null)) return
          val uri = data?.data?.takeIf { resultCode == Activity.RESULT_OK }
          p.promise.resolve(uri?.toString())
        }
      }

  private val canEmit: Boolean
    get() = mEventEmitterCallback != null

  private val resolver
    get() = reactApplicationContext.contentResolver

  override fun getName() = NAME

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addActivityEventListener(activityListener)
  }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(activityListener)
    pick.set(null)
    cancelled.set(true)
    super.invalidate()
  }

  // --- Pickers ---------------------------------------------------------------------------------

  override fun pickDestination(suggestedName: String, promise: Promise) =
      startPick(
          REQUEST_CREATE,
          Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = ZIP_MIME
            putExtra(Intent.EXTRA_TITLE, suggestedName)
          },
          promise)

  override fun pickBackupFile(promise: Promise) =
      startPick(
          REQUEST_OPEN,
          Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(ZIP_MIME, "application/x-zip-compressed", "application/octet-stream"))
          },
          promise)

  private fun startPick(requestCode: Int, intent: Intent, promise: Promise) {
    val activity = reactApplicationContext.currentActivity ?: return promise.reject("E_NO_ACTIVITY", "No foreground activity")
    val p = Pick(requestCode, promise)
    if (!pick.compareAndSet(null, p)) return promise.reject("E_BUSY", "A picker is already open")
    UiThreadUtil.runOnUiThread {
      try {
        activity.startActivityForResult(intent, requestCode)
      } catch (e: ActivityNotFoundException) {
        if (pick.compareAndSet(p, null)) promise.reject("E_NO_PICKER", "No document picker available", e)
      }
    }
  }

  // --- Archive operations ----------------------------------------------------------------------

  override fun writeBackup(destUri: String, entries: ReadableArray, files: ReadableArray, promise: Promise) {
    val texts = List(entries.size()) { i -> entries.getMap(i)!!.let { TextEntry(it.getString("name")!!, it.getString("text")!!) } }
    val list =
        List(files.size()) { i ->
          files.getMap(i)!!.let { FileEntry(it.getString("path")!!.removePrefix("file://"), it.getString("name")!!, it.getString("sha256").orEmpty()) }
        }
    runOp(promise, "write") { sink ->
      val uri = Uri.parse(destUri)
      try {
        val out = resolver.openOutputStream(uri, "w") ?: throw FileNotFoundException("Can't open $destUri")
        val r = BackupZipWriter(LocalFiles, cancelled::get, sink).write(out, texts, list)
        Arguments.createMap().apply {
          putDouble("bytes", r.bytes.toDouble())
          putArray("missing", Arguments.fromList(r.missing))
          putArray("damaged", Arguments.fromList(r.damaged))
        }
      } catch (t: Throwable) {
        // A partial archive is worse than none: it looks like a backup but can't be restored.
        try {
          DocumentsContract.deleteDocument(resolver, uri)
        } catch (_: Throwable) {}
        throw t
      }
    }
  }

  override fun readTextEntries(uri: String, names: ReadableArray, promise: Promise) {
    val wanted = List(names.size()) { names.getString(it)!! }.toSet()
    runOp(promise, "read", emitProgress = false) { sink ->
      val input = resolver.openInputStream(Uri.parse(uri)) ?: throw FileNotFoundException("Can't open $uri")
      val texts = BackupZipReader(cancelled::get, sink).readTexts(input, wanted)
      Arguments.createArray().apply {
        texts.forEach { (name, text) ->
          pushMap(Arguments.createMap().apply {
            putString("name", name)
            putString("text", text)
          })
        }
      }
    }
  }

  override fun extractFiles(uri: String, items: ReadableArray, promise: Promise) {
    val list =
        List(items.size()) { i ->
          items.getMap(i)!!.let {
            BackupZipReader.ExtractItem(it.getString("name")!!, File(it.getString("destPath")!!.removePrefix("file://")), it.getString("sha256").orEmpty())
          }
        }
    runOp(promise, "read") { sink ->
      val u = Uri.parse(uri)
      val total = sizeOf(u)
      val input = resolver.openInputStream(u) ?: throw FileNotFoundException("Can't open $uri")
      val results = BackupZipReader(cancelled::get, sink).extract(input, list, reactApplicationContext.filesDir, total)
      Arguments.createArray().apply {
        results.forEach { r ->
          pushMap(Arguments.createMap().apply {
            putString("name", r.name)
            putString("destPath", r.dest.absolutePath)
            putBoolean("ok", r.ok)
            putString("sha256", r.sha256)
          })
        }
      }
    }
  }

  override fun hashFiles(paths: ReadableArray, promise: Promise) {
    val files = List(paths.size()) { File(paths.getString(it)!!.removePrefix("file://")) }
    runOp(promise, "verify") { sink ->
      val root = reactApplicationContext.filesDir
      val total = files.sumOf { if (it.isFile) it.length() else 0L }
      var bytes = 0L
      val out = Arguments.createArray()
      files.forEachIndexed { i, f ->
        sink.report(Progress(i, files.size, bytes, total, f.path), false)
        val sha =
            if (BackupRules.isInside(root, f) && f.isFile) {
              try {
                sha256Of(f.inputStream(), cancelled::get) { n ->
                  bytes += n
                  sink.report(Progress(i, files.size, bytes, total, f.path), false)
                }
              } catch (e: CancelledException) {
                throw e
              } catch (e: java.io.IOException) {
                null
              }
            } else null
        out.pushMap(Arguments.createMap().apply {
          putString("path", f.path)
          putBoolean("ok", sha != null)
          putString("sha256", sha.orEmpty())
        })
      }
      sink.report(Progress(files.size, files.size, bytes, total, ""), true)
      out
    }
  }

  override fun cancel() {
    if (running.get()) cancelled.set(true)
  }

  override fun fileSize(uri: String, promise: Promise) {
    io.execute { promise.resolve(sizeOf(Uri.parse(uri)).toDouble()) }
  }

  // --- Plumbing --------------------------------------------------------------------------------

  /** Runs one archive operation on the IO thread; maps failures to rejection codes. */
  private fun runOp(promise: Promise, op: String, emitProgress: Boolean = true, body: (ProgressSink) -> Any) {
    if (!running.compareAndSet(false, true)) return promise.reject("E_BUSY", "A backup operation is already running")
    cancelled.set(false)
    val throttle = ProgressThrottle(PROGRESS_INTERVAL_MS)
    val sink = ProgressSink { p, force ->
      if (emitProgress && canEmit && throttle.ready(force)) {
        emitOnBackupProgress(
            Arguments.createMap().apply {
              putString("op", op)
              putInt("done", p.done)
              putInt("total", p.total)
              putDouble("bytesDone", p.bytesDone.toDouble())
              putDouble("bytesTotal", p.bytesTotal.toDouble())
              putString("current", p.current)
            })
      }
    }
    io.execute {
      try {
        promise.resolve(body(sink))
      } catch (e: CancelledException) {
        promise.reject("E_CANCELLED", "Cancelled", e)
      } catch (t: Throwable) {
        val msg = t.message ?: t.javaClass.simpleName
        val code = if (isNoSpace(t)) "E_NO_SPACE" else if (op == "write") "E_WRITE" else "E_READ"
        promise.reject(code, msg, t)
      } finally {
        running.set(false)
        cancelled.set(false)
      }
    }
  }

  private fun sizeOf(uri: Uri): Long =
      try {
        if (uri.scheme == "file") File(uri.path!!).length()
        else
            resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
              if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else -1L
            } ?: -1L
      } catch (_: Exception) {
        -1L
      }

  private fun isNoSpace(e: Throwable): Boolean {
    var t: Throwable? = e
    while (t != null) {
      if (t is ErrnoException && t.errno == OsConstants.ENOSPC) return true
      if (BackupRules.isNoSpaceMessage(t.message)) return true
      t = t.cause
    }
    return false
  }

  companion object {
    const val NAME = "Backup"
    private const val ZIP_MIME = "application/zip"
    private const val REQUEST_CREATE = 0xbac1
    private const val REQUEST_OPEN = 0xbac2
    private const val PROGRESS_INTERVAL_MS = 100L
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "backup-io") }
  }
}
