package com.alphastack.scorereader.support

import android.content.Context
import android.os.Build
import android.os.Process
import java.io.File
import java.io.FileOutputStream
import kotlin.system.exitProcess

/**
 * Keeps the last crash on the device (app-private storage, never sent anywhere). On the next launch
 * JS asks for it once (takeReport) and offers to share it; see src/features/support/CrashPromptHost.
 *
 * Installed first thing in MainApplication.onCreate. The handler wraps the previous default handler
 * (RN / the platform), so the process still dies exactly as before, just after the report is saved.
 */
object CrashCapture {
  private const val DIR = "crash"
  private const val NATIVE_FILE = "native.txt"
  private const val JS_FILE = "js.txt"

  @Volatile private var installed = false

  fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      // Whatever happens while recording, the crash itself must proceed normally.
      try {
        recordNative(app, thread, error)
      } catch (_: Throwable) {}
      if (previous != null) {
        previous.uncaughtException(thread, error)
      } else {
        Process.killProcess(Process.myPid())
        exitProcess(10)
      }
    }
  }

  private fun recordNative(context: Context, thread: Thread, error: Throwable) {
    val now = System.currentTimeMillis()
    val dir = dir(context)
    if (CrashReport.isDuplicateOfJsReport(error, File(dir, JS_FILE), now)) return
    writeAtomically(File(dir, NATIVE_FILE), CrashReport.formatNative(env(context), now, thread.name, error))
  }

  /** Synchronous: called from the JS global error handler before the fatal error is rethrown. */
  fun recordJs(context: Context, body: String): Boolean =
      try {
        writeAtomically(File(dir(context), JS_FILE), CrashReport.formatJs(env(context), System.currentTimeMillis(), body))
        true
      } catch (_: Throwable) {
        false
      }

  /** Returns the stored report(s) as one text and deletes them, or null when there is nothing. */
  fun takeReport(context: Context): String? {
    val dir = dir(context)
    val files = listOf(File(dir, NATIVE_FILE), File(dir, JS_FILE))
    val texts = files.map { f -> if (f.isFile) runCatching { f.readText() }.getOrNull() else null }
    files.forEach { it.delete() }
    return CrashReport.combine(texts)
  }

  fun env(context: Context): CrashReport.Env {
    val pm = context.packageManager
    val info = runCatching { pm.getPackageInfo(context.packageName, 0) }.getOrNull()
    return CrashReport.Env(
        appName = runCatching { context.applicationInfo.loadLabel(pm).toString() }.getOrDefault(context.packageName),
        versionName = info?.versionName ?: "?",
        versionCode = info?.longVersionCode ?: 0L,
        androidRelease = Build.VERSION.RELEASE ?: "?",
        sdkInt = Build.VERSION.SDK_INT,
        device = CrashReport.deviceName(Build.MANUFACTURER ?: "", Build.MODEL ?: ""),
        abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "?",
    )
  }

  private fun dir(context: Context): File = File(context.filesDir, DIR).apply { mkdirs() }

  /** Write to a temp file, fsync, rename: a half-written report is never read back. */
  private fun writeAtomically(target: File, text: String) {
    val tmp = File(target.parentFile, target.name + ".part")
    FileOutputStream(tmp).use { out ->
      out.write(text.toByteArray(Charsets.UTF_8))
      out.fd.sync()
    }
    if (!tmp.renameTo(target)) {
      target.delete()
      tmp.renameTo(target)
    }
  }
}
