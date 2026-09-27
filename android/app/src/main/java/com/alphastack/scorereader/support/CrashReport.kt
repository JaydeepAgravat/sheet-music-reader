package com.alphastack.scorereader.support

import java.io.File
import java.time.Instant

/**
 * Pure crash-report formatting and storage rules (no Android types, so JVM unit tests cover it).
 * Reports are plain, human-readable text: the user sees exactly what they share.
 */
object CrashReport {
  /** Upper bound for one stored report (~64 KB of text). */
  const val MAX_CHARS = 64 * 1024

  /** Everything about the app/device that goes into the header. No identifiers, no user data. */
  data class Env(
      val appName: String,
      val versionName: String,
      val versionCode: Long,
      val androidRelease: String,
      val sdkInt: Int,
      val device: String,
      val abi: String,
  )

  fun header(env: Env, timeMillis: Long, thread: String, source: String): String = buildString {
    append(env.appName).append(" crash report\n")
    append("Time: ").append(Instant.ofEpochMilli(timeMillis).toString()).append('\n')
    append("App: ").append(env.versionName).append(" (build ").append(env.versionCode).append(")\n")
    append("Android: ").append(env.androidRelease).append(" (API ").append(env.sdkInt).append(")\n")
    append("Device: ").append(env.device).append(" · ").append(env.abi).append('\n')
    append("Thread: ").append(thread).append('\n')
    append("Source: ").append(source).append("\n\n")
  }

  /** A native (JVM) crash: header + full stack trace including every "Caused by". */
  fun formatNative(env: Env, timeMillis: Long, thread: String, error: Throwable): String =
      truncate(header(env, timeMillis, thread, "native") + error.stackTraceToString().trimEnd() + "\n")

  /** A fatal JS error: header + the body JS already formatted (message, stacks, recent log). */
  fun formatJs(env: Env, timeMillis: Long, body: String): String =
      truncate(header(env, timeMillis, "js", "javascript") + body.trimEnd() + "\n")

  /**
   * Keeps [max] characters: the head (exception + top frames) and a shorter tail (in JVM traces the
   * root cause, "Caused by: …", comes last), with a marker saying how much was cut.
   */
  fun truncate(text: String, max: Int = MAX_CHARS): String {
    if (text.length <= max) return text
    val marker = "\n… [${text.length - max} characters cut] …\n"
    val budget = (max - marker.length).coerceAtLeast(0)
    var headEnd = budget * 3 / 4
    var tailStart = text.length - (budget - headEnd)
    // Never split a surrogate pair.
    if (headEnd > 0 && Character.isHighSurrogate(text[headEnd - 1])) headEnd--
    if (tailStart < text.length && Character.isLowSurrogate(text[tailStart])) tailStart++
    return text.substring(0, headEnd) + marker + text.substring(tailStart)
  }

  /** "Samsung SM-X710", without repeating the maker when the model already starts with it. */
  fun deviceName(manufacturer: String, model: String): String {
    val maker = manufacturer.replaceFirstChar { it.uppercase() }
    return if (model.startsWith(manufacturer, ignoreCase = true)) model else "$maker $model"
  }

  /**
   * RN rethrows a fatal JS error on the native side as a JavascriptException. When the JS handler
   * has just written its richer report (with the component stack and log), the native copy is noise.
   */
  fun isDuplicateOfJsReport(error: Throwable, jsReport: File, nowMillis: Long): Boolean =
      error.javaClass.name.endsWith("JavascriptException") &&
          jsReport.exists() &&
          nowMillis - jsReport.lastModified() in 0..JS_DEDUPE_WINDOW_MS

  /** Joins the stored reports (native first, then JS) into one text, or null when there are none. */
  fun combine(reports: List<String?>): String? {
    val present = reports.filterNotNull().map { it.trimEnd() }.filter { it.isNotEmpty() }
    if (present.isEmpty()) return null
    return present.joinToString("\n\n────────\n\n") + "\n"
  }

  const val JS_DEDUPE_WINDOW_MS = 15_000L
}
