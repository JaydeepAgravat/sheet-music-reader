package com.alphastack.scorereader.saf

/** One importable document, as handed to JS (see NativeSafImport.ts SourceFile). */
data class SourceFile(
    val uri: String,
    val name: String,
    /** -1 when the provider doesn't know. */
    val size: Long,
    val relativeDir: String,
    val virtual: Boolean,
    /** Only used for filtering; not sent to JS. */
    val mime: String? = null,
) {
  companion object {
    /** Folder listing order: by folder path, then by name, both case-insensitive. */
    val ORDER: Comparator<SourceFile> =
        compareBy<SourceFile, String>(String.CASE_INSENSITIVE_ORDER) { it.relativeDir }
            .thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
  }
}

/** The import rules that don't need Android types, so they run as JVM unit tests. */
object PdfRules {

  const val PDF_MIME = "application/pdf"

  /**
   * How far into a file the "%PDF-" marker may start. Readers accept leading junk (mail gateways
   * and some scanners prepend bytes); 1024 matches what Acrobat tolerates.
   */
  const val HEADER_WINDOW = 1024

  private val MAGIC = "%PDF-".toByteArray(Charsets.US_ASCII)

  /**
   * Cloud providers often report PDFs as application/octet-stream, so the name counts as much as
   * the MIME type.
   */
  fun isPdf(mime: String?, name: String?): Boolean =
      mime.equals(PDF_MIME, ignoreCase = true) || name?.endsWith(".pdf", ignoreCase = true) == true

  /** Offset of "%PDF-" within the first [HEADER_WINDOW] bytes of [buf] (of which [len] are valid), or -1. */
  fun headerOffset(buf: ByteArray, len: Int): Int {
    val end = minOf(len, buf.size, HEADER_WINDOW) - MAGIC.size
    outer@ for (i in 0..end) {
      for (j in MAGIC.indices) if (buf[i + j] != MAGIC[j]) continue@outer
      return i
    }
    return -1
  }

  /** Dot-files are OS/app metadata (.thumbnails, ._foo.pdf resource forks), never scores. */
  fun isHidden(name: String): Boolean = name.startsWith(".")

  /** relativeDir of a child folder: "" at the tree root, "A/B" when nested. */
  fun childDir(parent: String, name: String): String = if (parent.isEmpty()) name else "$parent/$name"

  fun hex(bytes: ByteArray): String {
    val out = StringBuilder(bytes.size * 2)
    for (b in bytes) {
      val v = b.toInt() and 0xff
      out.append(HEX[v ushr 4]).append(HEX[v and 0x0f])
    }
    return out.toString()
  }

  private const val HEX = "0123456789abcdef"
}
