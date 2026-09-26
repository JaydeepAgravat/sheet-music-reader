package com.alphastack.scorereader.saf

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat
import java.util.concurrent.Executors

/**
 * Process-wide inbox for PDFs shared to / "opened with" the app. MainActivity feeds it every
 * launching and new intent; the SafImport module drains it ([take]) and is told when more arrive
 * ([listener]).
 *
 * The URIs carry a temporary read grant tied to the receiving activity, not a persistable one: JS
 * must copy them in this process session, and nothing here is persisted.
 */
object ShareInbox {

  private val pending = ArrayList<SourceFile>()

  /** Called with the number of newly queued files, on the inbox's worker thread. */
  @Volatile var listener: ((Int) -> Unit)? = null

  /** Name/size lookups are provider IPC; a single thread keeps arrivals in order. */
  private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "share-inbox") }

  fun accept(context: Context, intent: Intent?) {
    if (intent == null) return
    val uris = sharedUris(intent)
    if (uris.isEmpty()) return
    val app = context.applicationContext
    val declared = intent.type
    worker.execute {
      val files = uris.map { SourceQuery.describe(app, it, declared) }.filter { PdfRules.isPdf(it.mime, it.name) }
      if (files.isEmpty()) return@execute
      synchronized(pending) { pending += files }
      listener?.invoke(files.size)
    }
  }

  /** Returns and clears everything queued so far. */
  fun take(): List<SourceFile> =
      synchronized(pending) {
        val out = pending.toList()
        pending.clear()
        out
      }

  /** The document URIs an intent hands us; empty for anything that isn't a view/share. */
  fun sharedUris(intent: Intent): List<Uri> {
    val uris =
        when (intent.action) {
          Intent.ACTION_VIEW -> listOfNotNull(intent.data)
          Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
          Intent.ACTION_SEND_MULTIPLE ->
              IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty().filterNotNull()
          else -> emptyList()
        }
    return uris.distinct()
  }
}
