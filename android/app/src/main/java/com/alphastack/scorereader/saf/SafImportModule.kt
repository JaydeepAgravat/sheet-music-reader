package com.alphastack.scorereader.saf

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.StatFs
import com.alphastack.scorereader.specs.NativeSafImportSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/**
 * Getting PDFs in: SAF pickers, folder trees and shares (via [ShareInbox]). Every import is
 * stream-copied into app storage by [LibraryCopier]; nothing is read in place.
 */
class SafImportModule(reactContext: ReactApplicationContext) : NativeSafImportSpec(reactContext) {

  private val copier = LibraryCopier(reactContext)

  /** The one picker in flight. Set from the JS thread, cleared from the UI thread. */
  private class Pick(val requestCode: Int, val promise: Promise)

  private val pick = AtomicReference<Pick?>(null)

  private val activityListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
          val p = pick.get()?.takeIf { it.requestCode == requestCode } ?: return
          if (!pick.compareAndSet(p, null)) return
          val ok = resultCode == Activity.RESULT_OK && data != null
          // Name/size queries are provider IPC — keep them off the UI thread.
          io.execute {
            try {
              when (requestCode) {
                REQUEST_FILES -> p.promise.resolve(if (ok) pickedFiles(data!!) else Arguments.createArray())
                else -> p.promise.resolve(data?.data?.takeIf { ok }?.let(::pickedFolder))
              }
            } catch (t: Throwable) {
              p.promise.reject("E_PICK", t.message ?: t.javaClass.simpleName, t)
            }
          }
        }
      }

  private val shareListener: (Int) -> Unit = { count -> if (canEmit) emitOnShareReceived(count.toDouble()) }

  /** The C++ side installs the emitter after construction; until then events can't reach JS. */
  private val canEmit: Boolean
    get() = mEventEmitterCallback != null

  override fun getName() = NAME

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addActivityEventListener(activityListener)
    ShareInbox.listener = shareListener
  }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(activityListener)
    // On reload the new instance may already have registered; only unhook ourselves.
    if (ShareInbox.listener === shareListener) ShareInbox.listener = null
    // JS reloaded: its promise is gone; drop it so the next pick isn't refused as E_BUSY.
    pick.set(null)
    super.invalidate()
  }

  override fun pickFiles(promise: Promise) =
      startPick(
          REQUEST_FILES,
          Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            // PDFs plus octet-stream: some cloud providers report PDFs as the latter. Anything
            // else stays hidden; the name check in [pickedFiles] drops non-PDF octet-streams.
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(PdfRules.PDF_MIME, "application/octet-stream"))
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
          },
          promise)

  override fun pickFolder(promise: Promise) = startPick(REQUEST_FOLDER, Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), promise)

  override fun listFolder(treeUri: String, promise: Promise) {
    io.execute {
      try {
        val files = FolderWalker.list(reactApplicationContext.contentResolver, Uri.parse(treeUri))
        promise.resolve(Arguments.createArray().apply { files.forEach { pushMap(it.toMap()) } })
      } catch (t: Throwable) {
        promise.reject("E_LIST", t.message ?: t.javaClass.simpleName, t)
      }
    }
  }

  override fun copyToLibrary(uri: String, destPath: String, promise: Promise) {
    io.execute {
      try {
        val r = copier.copy(Uri.parse(uri), File(destPath.removePrefix("file://")))
        promise.resolve(
            Arguments.createMap().apply {
              putString("path", r.file.absolutePath)
              putDouble("size", r.size.toDouble())
              putString("sha256", r.sha256)
            })
      } catch (e: LibraryCopier.CopyException) {
        promise.reject(e.code, e.message, e)
      }
    }
  }

  override fun copyAsset(assetPath: String, destPath: String, promise: Promise) {
    io.execute {
      try {
        val r = copier.copyAsset(assetPath, File(destPath.removePrefix("file://")))
        promise.resolve(
            Arguments.createMap().apply {
              putString("path", r.file.absolutePath)
              putDouble("size", r.size.toDouble())
              putString("sha256", r.sha256)
            })
      } catch (e: LibraryCopier.CopyException) {
        promise.reject(e.code, e.message, e)
      }
    }
  }

  override fun takePendingShares(): WritableArray =
      Arguments.createArray().apply { ShareInbox.take().forEach { pushMap(it.toMap()) } }

  override fun libraryDir(): String = appDir("library")

  override fun coversDir(): String = appDir("covers")

  override fun deleteFile(path: String): Boolean {
    val root = reactApplicationContext.filesDir.canonicalFile
    val f = File(path.removePrefix("file://")).canonicalFile
    // Canonical paths resolve ".." and symlinks, so JS can't reach outside app storage.
    if (!f.path.startsWith(root.path + File.separator) || !f.isFile) return false
    return f.delete()
  }

  override fun freeBytes(): Double = StatFs(reactApplicationContext.filesDir.path).availableBytes.toDouble()

  // --- Pickers ---------------------------------------------------------------------------------

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

  private fun pickedFiles(data: Intent): WritableArray {
    val clip = data.clipData
    val uris = if (clip != null) List(clip.itemCount) { clip.getItemAt(it).uri }.filterNotNull() else listOfNotNull(data.data)
    val out = Arguments.createArray()
    uris
        .map { SourceQuery.describe(reactApplicationContext, it) }
        .filter { PdfRules.isPdf(it.mime, it.name) }
        .forEach { out.pushMap(it.toMap()) }
    return out
  }

  private fun pickedFolder(treeUri: Uri): WritableMap =
      Arguments.createMap().apply {
        putString("uri", treeUri.toString())
        putString("name", SourceQuery.treeName(reactApplicationContext, treeUri))
      }

  private fun appDir(name: String): String = File(reactApplicationContext.filesDir, name).apply { mkdirs() }.absolutePath

  private fun SourceFile.toMap(): WritableMap =
      Arguments.createMap().apply {
        putString("uri", uri)
        putString("name", name)
        putDouble("size", size.toDouble())
        putString("relativeDir", relativeDir)
        putBoolean("virtual", virtual)
      }

  companion object {
    const val NAME = "SafImport"
    private const val REQUEST_FILES = 0x5af1
    private const val REQUEST_FOLDER = 0x5af2
    private val io = Executors.newFixedThreadPool(2) { r -> Thread(r, "saf-io") }
  }
}
