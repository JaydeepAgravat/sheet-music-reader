package com.alphastack.scorereader.backup

import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.FilterOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipException
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/*
 * The backup archive engine, on plain java.io / java.util.zip so it runs (and is tested) on the JVM.
 * BackupModule only adapts content URIs, threads and events to it.
 *
 * Writer: text entries are DEFLATED; PDFs and covers are STORED (already compressed — deflating
 * them costs CPU and saves ~nothing). ZipOutputStream needs size + CRC-32 of a STORED entry *before*
 * its data, so each file is read twice: pass 1 computes CRC-32 + SHA-256 + size, pass 2 copies. The
 * alternatives are worse: DEFLATE level 0 is single-pass but still runs every byte through the
 * deflater and forces data descriptors; buffering whole files in memory is out for 100 MB scans.
 * Pass 1 is a local sequential read (the destination provider is the bottleneck, and pass 2 usually
 * hits the page cache), and it doubles as an integrity check: a PDF whose SHA-256 no longer matches
 * the library's file_hash is reported as damaged instead of being archived under a wrong name.
 * ZipOutputStream re-checks CRC + size on closeEntry, so a file changing between passes fails loudly.
 *
 * Reader: ZipInputStream, i.e. a single sequential pass over the local headers. Content URIs from
 * cloud providers are often not seekable, so the central directory (and ZipFile) can't be relied
 * on. The writer puts the small JSON entries first, so previews stop reading after ~3 entries.
 *
 * ZIP64: OpenJDK-derived java.util.zip (Android 7+, and the host JVM) writes ZIP64 records
 * automatically when the archive passes 4 GiB or 65,535 entries, and ZipInputStream never looks at
 * the central directory, so neither limit applies to reading. Covered by BackupZipTest.
 */

class TextEntry(val name: String, val text: String)

/** [sha256] = expected lowercase hex, or "" for no check (covers). */
class FileEntry(val path: String, val name: String, val sha256: String)

/** Where archived files come from (local files in the app; synthetic streams in tests). */
interface FileSource {
  /** Bytes, or -1 when the file is missing. */
  fun size(path: String): Long

  fun open(path: String): InputStream
}

object LocalFiles : FileSource {
  override fun size(path: String): Long = File(path).let { if (it.isFile) it.length() else -1L }

  override fun open(path: String): InputStream = FileInputStream(path)
}

class Progress(
    val done: Int,
    val total: Int,
    val bytesDone: Long,
    val bytesTotal: Long,
    val current: String,
)

fun interface ProgressSink {
  /** [force] = start/end of the operation; the sink may drop other reports (throttling). */
  fun report(p: Progress, force: Boolean)
}

class CancelledException : IOException("Cancelled")

private const val BUFFER = 128 * 1024

class BackupZipWriter(
    private val source: FileSource,
    private val isCancelled: () -> Boolean,
    private val progress: ProgressSink,
) {
  class Result(val bytes: Long, val missing: List<String>, val damaged: List<String>)

  private class Scan(val size: Long, val crc: Long, val sha256: String)

  /** Writes the archive to [out] and closes it. Throws [CancelledException] or IOException. */
  fun write(out: OutputStream, texts: List<TextEntry>, files: List<FileEntry>): Result {
    val counting = CountingOutputStream(out)
    val missing = ArrayList<String>()
    val damaged = ArrayList<String>()
    val names = HashSet<String>()
    val sizes = files.map { source.size(it.path) }
    val bytesTotal = sizes.sumOf { maxOf(it, 0L) }
    var bytesDone = 0L
    var done = 0
    val buf = ByteArray(BUFFER)

    ZipOutputStream(BufferedOutputStream(counting, BUFFER)).use { zip ->
      progress.report(Progress(0, files.size, 0, bytesTotal, ""), true)
      for (t in texts) {
        require(BackupRules.isSafeEntryName(t.name) && names.add(t.name)) { "Bad entry name ${t.name}" }
        zip.putNextEntry(ZipEntry(t.name).apply { method = ZipEntry.DEFLATED })
        zip.write(t.text.toByteArray(Charsets.UTF_8))
        zip.closeEntry()
      }
      files.forEachIndexed { i, f ->
        if (isCancelled()) throw CancelledException()
        val size = sizes[i]
        progress.report(Progress(done, files.size, bytesDone, bytesTotal, f.name), false)
        if (!BackupRules.isSafeEntryName(f.name) || !names.add(f.name) || size < 0) {
          if (size < 0) missing.add(f.name)
          return@forEachIndexed
        }
        val scan =
            try {
              scan(f.path, buf)
            } catch (e: java.io.FileNotFoundException) {
              missing.add(f.name)
              bytesDone += size
              return@forEachIndexed
            }
        if (f.sha256.isNotEmpty() && scan.sha256 != f.sha256) {
          damaged.add(f.name)
          bytesDone += size
          return@forEachIndexed
        }
        zip.putNextEntry(
            ZipEntry(f.name).apply {
              method = ZipEntry.STORED
              this.size = scan.size
              compressedSize = scan.size
              crc = scan.crc
            })
        source.open(f.path).use { input ->
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            zip.write(buf, 0, n)
            bytesDone += n
            if (isCancelled()) throw CancelledException()
            progress.report(Progress(done, files.size, bytesDone, bytesTotal, f.name), false)
          }
        }
        zip.closeEntry()
        done++
      }
      zip.finish()
      progress.report(Progress(done, files.size, bytesDone, bytesTotal, ""), true)
    }
    return Result(counting.count, missing, damaged)
  }

  /** Pass 1: CRC-32 (needed up front for STORED), SHA-256 (integrity) and the exact size. */
  private fun scan(path: String, buf: ByteArray): Scan {
    val crc = CRC32()
    val sha = MessageDigest.getInstance("SHA-256")
    var size = 0L
    source.open(path).use { input ->
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        crc.update(buf, 0, n)
        sha.update(buf, 0, n)
        size += n
        if (isCancelled()) throw CancelledException()
      }
    }
    return Scan(size, crc.value, BackupRules.hex(sha.digest()))
  }
}

class BackupZipReader(
    private val isCancelled: () -> Boolean,
    private val progress: ProgressSink,
) {
  class ExtractItem(val name: String, val dest: File, val sha256: String)

  class ExtractResult(val name: String, val dest: File, val ok: Boolean, val sha256: String)

  /**
   * Reads the named (small, UTF-8) entries and stops as soon as all were seen. Entries larger than
   * [maxBytes] are an error (a crafted archive must not exhaust memory). Missing names are absent
   * from the result.
   */
  fun readTexts(input: InputStream, names: Set<String>, maxBytes: Int = MAX_TEXT_BYTES): Map<String, String> {
    val out = LinkedHashMap<String, String>()
    ZipInputStream(input.buffered(BUFFER)).use { zip ->
      val buf = ByteArray(BUFFER)
      while (out.size < names.size) {
        val e = zip.nextEntry ?: break
        if (e.name !in names || e.name in out) continue
        val bytes = java.io.ByteArrayOutputStream()
        while (true) {
          val n = zip.read(buf)
          if (n < 0) break
          bytes.write(buf, 0, n)
          if (bytes.size() > maxBytes) throw ZipException("Entry ${e.name} is too large")
          if (isCancelled()) throw CancelledException()
        }
        out[e.name] = bytes.toString(Charsets.UTF_8.name())
      }
    }
    return out
  }

  /**
   * Extracts the listed entries in one sequential pass. Each is written to "dest.part", hashed on
   * the way, and renamed only if the SHA-256 matches (when one is given); failures leave no file.
   * Several items may name the same entry (it's written once, then copied). Items whose dest isn't
   * inside [allowedRoot] or whose name isn't safe fail without touching the disk. [zipBytes] (-1 if
   * unknown) drives byte progress. Throws [CancelledException] (already-renamed files stay; the
   * caller owns their cleanup) or IOException for I/O errors outside a single entry.
   */
  fun extract(input: InputStream, items: List<ExtractItem>, allowedRoot: File, zipBytes: Long): List<ExtractResult> {
    val results = HashMap<ExtractItem, ExtractResult>()
    val wanted = LinkedHashMap<String, MutableList<ExtractItem>>()
    for (item in items) {
      val safe =
          BackupRules.isSafeEntryName(item.name) &&
              BackupRules.isInside(allowedRoot, item.dest) &&
              (item.sha256.isEmpty() || BackupRules.isSha256(item.sha256))
      if (safe) wanted.getOrPut(item.name) { ArrayList() }.add(item)
      else results[item] = ExtractResult(item.name, item.dest, false, "")
    }
    val counting = CountingInputStream(input.buffered(BUFFER))
    var done = 0
    val report = { current: String, force: Boolean ->
      progress.report(Progress(done, items.size, counting.count, zipBytes, current), force)
    }
    report("", true)
    val buf = ByteArray(BUFFER)
    ZipInputStream(counting).use { zip ->
      while (wanted.isNotEmpty()) {
        if (isCancelled()) throw CancelledException()
        val e =
            try {
              zip.nextEntry
            } catch (x: ZipException) {
              null // corrupt tail: whatever is still wanted fails below
            } ?: break
        val group = wanted.remove(e.name) ?: continue
        report(e.name, false)
        val first = group.first()
        val sha =
            try {
              writeVerified(zip, first, buf) { report(e.name, false) }
            } catch (x: CancelledException) {
              throw x
            } catch (x: ZipException) {
              null // CRC mismatch or truncated entry
            }
        val ok = sha != null && (first.sha256.isEmpty() || sha == first.sha256)
        results[first] = ExtractResult(first.name, first.dest, ok, sha.orEmpty())
        for (other in group.drop(1)) {
          val copied = ok && copyFile(first.dest, other.dest, buf)
          results[other] = ExtractResult(other.name, other.dest, copied, if (copied) sha.orEmpty() else "")
        }
        done += group.size
      }
    }
    for (group in wanted.values) for (item in group) results[item] = ExtractResult(item.name, item.dest, false, "")
    report("", true)
    return items.map { results.getValue(it) }
  }

  /** Streams the current entry to dest.part, returns its SHA-256, renames when it matches. */
  private fun writeVerified(zip: ZipInputStream, item: ExtractItem, buf: ByteArray, tick: () -> Unit): String {
    val tmp = File(item.dest.path + ".part")
    item.dest.parentFile?.mkdirs()
    try {
      val sha = MessageDigest.getInstance("SHA-256")
      FileOutputStream(tmp).use { out ->
        while (true) {
          val n = zip.read(buf)
          if (n < 0) break
          sha.update(buf, 0, n)
          out.write(buf, 0, n)
          if (isCancelled()) throw CancelledException()
          tick()
        }
        out.fd.sync()
      }
      val hex = BackupRules.hex(sha.digest())
      if (item.sha256.isEmpty() || hex == item.sha256) {
        if (!tmp.renameTo(item.dest)) throw IOException("Can't rename to ${item.dest.path}")
      }
      return hex
    } finally {
      tmp.delete()
    }
  }

  private fun copyFile(from: File, to: File, buf: ByteArray): Boolean {
    val tmp = File(to.path + ".part")
    return try {
      to.parentFile?.mkdirs()
      FileInputStream(from).use { input ->
        FileOutputStream(tmp).use { out ->
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
          }
          out.fd.sync()
        }
      }
      tmp.renameTo(to)
    } catch (e: IOException) {
      false
    } finally {
      tmp.delete()
    }
  }

  companion object {
    /** library.json of a 1,000-score library with heavy ink is tens of MB; 256 MB is the cap. */
    const val MAX_TEXT_BYTES = 256 * 1024 * 1024
  }
}

/** SHA-256 of a stream (integrity check of library files). */
fun sha256Of(input: InputStream, isCancelled: () -> Boolean, onBytes: (Int) -> Unit = {}): String {
  val sha = MessageDigest.getInstance("SHA-256")
  val buf = ByteArray(BUFFER)
  input.use {
    while (true) {
      val n = it.read(buf)
      if (n < 0) break
      sha.update(buf, 0, n)
      onBytes(n)
      if (isCancelled()) throw CancelledException()
    }
  }
  return BackupRules.hex(sha.digest())
}

class CountingOutputStream(out: OutputStream) : FilterOutputStream(out) {
  var count = 0L
    private set

  override fun write(b: Int) {
    out.write(b)
    count++
  }

  override fun write(b: ByteArray, off: Int, len: Int) {
    out.write(b, off, len)
    count += len
  }
}

class CountingInputStream(input: InputStream) : FilterInputStream(input) {
  var count = 0L
    private set

  override fun read(): Int = super.read().also { if (it >= 0) count++ }

  override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) count += it }

  override fun skip(n: Long): Long = super.skip(n).also { count += it }

  override fun markSupported() = false
}
