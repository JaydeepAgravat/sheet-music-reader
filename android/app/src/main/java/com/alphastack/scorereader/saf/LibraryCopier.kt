package com.alphastack.scorereader.saf

import android.content.Context
import android.net.Uri
import android.system.ErrnoException
import android.system.OsConstants
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest

/**
 * Stream-copies a content:// or file:// URI into app storage, hashing on the way. Nothing is read in
 * place because content grants expire and cloud files move. Blocking and thread-safe (no shared
 * state), so several copies may run at once.
 */
class LibraryCopier(private val context: Context) {

  data class Result(val file: File, val size: Long, val sha256: String)

  /** [code] is the promise rejection code JS switches on. */
  class CopyException(val code: String, message: String, cause: Throwable? = null) : IOException(message, cause)

  /**
   * Writes to "[dest].part" and renames, so [dest] is either absent or complete — never partial.
   * Throws [CopyException] only; the temp file is removed on every failure.
   */
  fun copy(uri: Uri, dest: File): Result {
    val tmp = File(dest.path + ".part")
    try {
      dest.parentFile?.mkdirs()
      val digest = MessageDigest.getInstance("SHA-256")
      val head = ByteArray(PdfRules.HEADER_WINDOW)
      var headLen = 0
      var size = 0L
      open(uri).use { input ->
        FileOutputStream(tmp).use { out ->
          val buf = ByteArray(BUFFER_SIZE)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            // Check the header as soon as the window is full, so a large non-PDF fails fast.
            if (headLen < head.size) {
              val take = minOf(n, head.size - headLen)
              System.arraycopy(buf, 0, head, headLen, take)
              headLen += take
              if (headLen == head.size) requirePdf(head, headLen)
            }
            digest.update(buf, 0, n)
            out.write(buf, 0, n)
            size += n
          }
          if (headLen < head.size) requirePdf(head, headLen)
          // Flush to disk before the rename makes the file visible as complete.
          out.fd.sync()
        }
      }
      if (!tmp.renameTo(dest)) throw IOException("Can't rename to ${dest.path}")
      return Result(dest, size, PdfRules.hex(digest.digest()))
    } catch (e: CopyException) {
      tmp.delete()
      throw e
    } catch (e: Exception) {
      tmp.delete()
      val msg = e.message ?: e.javaClass.simpleName
      throw if (isNoSpace(e)) CopyException(E_NO_SPACE, msg, e) else CopyException(E_COPY, msg, e)
    }
  }

  private fun open(uri: Uri): InputStream {
    val resolver = context.contentResolver
    val stream =
        if (SourceQuery.isVirtual(context, uri)) {
          resolver.openTypedAssetFileDescriptor(uri, PdfRules.PDF_MIME, null)?.createInputStream()
        } else {
          resolver.openInputStream(uri)
        }
    return stream ?: throw FileNotFoundException("Can't open $uri")
  }

  private fun requirePdf(head: ByteArray, len: Int) {
    if (PdfRules.headerOffset(head, len) < 0) throw CopyException(E_NOT_PDF, "Not a PDF (no %PDF- header)")
  }

  /** ENOSPC surfaces as an IOException whose cause is an ErrnoException, or only in the message. */
  private fun isNoSpace(e: Throwable): Boolean {
    var t: Throwable? = e
    while (t != null) {
      if (t is ErrnoException && t.errno == OsConstants.ENOSPC) return true
      val m = t.message.orEmpty()
      if ("ENOSPC" in m || "No space" in m) return true
      t = t.cause
    }
    return false
  }

  companion object {
    const val E_NOT_PDF = "E_NOT_PDF"
    const val E_NO_SPACE = "E_NO_SPACE"
    const val E_COPY = "E_COPY"
    private const val BUFFER_SIZE = 64 * 1024
  }
}
