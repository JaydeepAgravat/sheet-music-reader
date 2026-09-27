package com.alphastack.scorereader.backup

import java.io.File

/**
 * Pure rules of the backup archive (no Android dependencies, JVM unit-tested): entry naming,
 * zip-slip / path safety and progress throttling. The archive layout is documented in
 * docs/BACKUP_FORMAT.md.
 */
object BackupRules {
  const val MANIFEST = "manifest.json"
  const val LIBRARY = "library.json"
  const val SETTINGS = "settings.json"
  const val PDF_DIR = "pdfs/"
  const val COVER_DIR = "covers/"

  /** Longest entry name we write or accept (ours are at most ~76 chars). */
  const val MAX_NAME = 255

  private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

  fun isSha256(s: String): Boolean = SHA256_HEX.matches(s)

  fun pdfEntry(sha256: String): String = "$PDF_DIR$sha256.pdf"

  fun coverEntry(sha256: String): String = "$COVER_DIR$sha256.webp"

  /**
   * A relative, forward-slash name with no empty, "." or ".." segments, no drive letters, no
   * backslashes or control characters. Anything else is a zip-slip attempt or garbage: we neither
   * write nor extract it.
   */
  fun isSafeEntryName(name: String): Boolean {
    if (name.isEmpty() || name.length > MAX_NAME) return false
    if (name.startsWith("/") || name.endsWith("/")) return false
    if (name.any { it == '\\' || it == ':' || it < ' ' || it == '\u007f' }) return false
    return name.split('/').none { it.isEmpty() || it == "." || it == ".." }
  }

  /** [target] resolves (canonically: "..", symlinks) to a path strictly inside [root]. */
  fun isInside(root: File, target: File): Boolean {
    val r = root.canonicalFile.path
    val t = target.canonicalFile.path
    return t.startsWith(r + File.separator)
  }

  /** ENOSPC surfaces only in the message when the ErrnoException cause is lost. */
  fun isNoSpaceMessage(message: String?): Boolean {
    val m = message.orEmpty()
    return "ENOSPC" in m || "No space" in m
  }

  fun hex(bytes: ByteArray): String {
    val out = CharArray(bytes.size * 2)
    for (i in bytes.indices) {
      val v = bytes[i].toInt() and 0xff
      out[i * 2] = HEX[v ushr 4]
      out[i * 2 + 1] = HEX[v and 0x0f]
    }
    return String(out)
  }

  private val HEX = "0123456789abcdef".toCharArray()
}

/**
 * Lets a progress event through at most every [intervalMs] (plus forced ones: start and end), so a
 * 3 GB copy with 64 KB buffers doesn't flood the bridge with ~50k events. Not thread-safe: one
 * operation owns one throttle.
 */
class ProgressThrottle(private val intervalMs: Long, private val clock: () -> Long = System::currentTimeMillis) {
  private var last = 0L
  private var any = false

  fun ready(force: Boolean = false): Boolean {
    val now = clock()
    if (force || !any || now - last >= intervalMs) {
      last = now
      any = true
      return true
    }
    return false
  }
}
