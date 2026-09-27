package com.alphastack.scorereader.backup

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicReference
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

class BackupZipTest {
  private lateinit var root: File

  @Before
  fun setUp() {
    root = Files.createTempDirectory("backup-test").toFile()
  }

  @After
  fun tearDown() {
    root.deleteRecursively()
  }

  private fun sha(b: ByteArray) = BackupRules.hex(MessageDigest.getInstance("SHA-256").digest(b))

  private val noProgress = ProgressSink { _, _ -> }

  private fun file(name: String, bytes: ByteArray): File = File(root, "src/$name").apply { parentFile!!.mkdirs(); writeBytes(bytes) }

  private fun writeZip(texts: List<TextEntry>, files: List<FileEntry>, source: FileSource = LocalFiles): Pair<File, BackupZipWriter.Result> {
    val zip = File(root, "out.zip")
    val r = BackupZipWriter(source, { false }, noProgress).write(FileOutputStream(zip), texts, files)
    return zip to r
  }

  @Test
  fun roundTripsTextsAndFiles() {
    val pdf = ByteArray(300_000) { (it * 31).toByte() }
    val cover = ByteArray(5_000) { it.toByte() }
    val h = sha(pdf)
    val (zip, r) =
        writeZip(
            listOf(TextEntry("manifest.json", "{\"format\":1,\"é\":\"🎵\"}"), TextEntry("library.json", "x".repeat(100_000))),
            listOf(FileEntry(file("a.pdf", pdf).path, BackupRules.pdfEntry(h), h), FileEntry(file("a.webp", cover).path, BackupRules.coverEntry(h), "")),
        )
    assertEquals(zip.length(), r.bytes)
    assertTrue(r.missing.isEmpty() && r.damaged.isEmpty())

    // Layout: JSON first (deflated), files stored.
    ZipFile(zip).use { z ->
      val names = z.entries().toList().map { it.name }
      assertEquals(listOf("manifest.json", "library.json", BackupRules.pdfEntry(h), BackupRules.coverEntry(h)), names)
      assertEquals(ZipEntry.DEFLATED, z.getEntry("library.json").method)
      assertEquals(ZipEntry.STORED, z.getEntry(BackupRules.pdfEntry(h)).method)
    }

    val reader = BackupZipReader({ false }, noProgress)
    val texts = reader.readTexts(FileInputStream(zip), setOf("manifest.json", "library.json", "settings.json"))
    assertEquals("{\"format\":1,\"é\":\"🎵\"}", texts["manifest.json"])
    assertEquals(100_000, texts["library.json"]!!.length)
    assertFalse(texts.containsKey("settings.json"))

    val lib = File(root, "files/library")
    val items =
        listOf(
            BackupZipReader.ExtractItem(BackupRules.pdfEntry(h), File(lib, "one.pdf"), h),
            BackupZipReader.ExtractItem(BackupRules.pdfEntry(h), File(lib, "two.pdf"), h), // same entry twice
            BackupZipReader.ExtractItem(BackupRules.coverEntry(h), File(root, "files/covers/c.webp"), ""),
            BackupZipReader.ExtractItem(BackupRules.pdfEntry("b".repeat(64)), File(lib, "missing.pdf"), "b".repeat(64)),
        )
    val res = reader.extract(FileInputStream(zip), items, File(root, "files"), zip.length())
    assertEquals(listOf(true, true, true, false), res.map { it.ok })
    assertArrayEquals(pdf, File(lib, "one.pdf").readBytes())
    assertArrayEquals(pdf, File(lib, "two.pdf").readBytes())
    assertArrayEquals(cover, File(root, "files/covers/c.webp").readBytes())
    assertFalse(File(lib, "missing.pdf").exists())
    assertEquals(h, res[0].sha256)
    assertTrue(lib.listFiles()!!.none { it.name.endsWith(".part") })
  }

  @Test
  fun hashMismatchLeavesNoFile() {
    val pdf = ByteArray(1000) { 7 }
    val h = sha(pdf)
    val (zip, _) = writeZip(emptyList(), listOf(FileEntry(file("a.pdf", pdf).path, BackupRules.pdfEntry(h), h)))
    val wrong = "c".repeat(64)
    val dest = File(root, "files/library/x.pdf")
    val res = BackupZipReader({ false }, noProgress).extract(FileInputStream(zip), listOf(BackupZipReader.ExtractItem(BackupRules.pdfEntry(h), dest, wrong)), File(root, "files"), -1)
    assertFalse(res[0].ok)
    assertEquals(h, res[0].sha256)
    assertFalse(dest.exists())
    assertFalse(File(dest.path + ".part").exists())
  }

  @Test
  fun unsafeItemsNeverTouchTheDisk() {
    val (zip, _) = writeZip(listOf(TextEntry("manifest.json", "{}")), emptyList())
    val outside = File(root, "outside.pdf")
    val res =
        BackupZipReader({ false }, noProgress)
            .extract(
                FileInputStream(zip),
                listOf(
                    BackupZipReader.ExtractItem("manifest.json", outside, ""),
                    BackupZipReader.ExtractItem("../manifest.json", File(root, "files/x"), ""),
                    BackupZipReader.ExtractItem("manifest.json", File(root, "files/../escape"), ""),
                ),
                File(root, "files"),
                -1)
    assertEquals(listOf(false, false, false), res.map { it.ok })
    assertFalse(outside.exists())
    assertFalse(File(root, "escape").exists())
  }

  @Test
  fun writerRejectsUnsafeTextNames() {
    try {
      writeZip(listOf(TextEntry("../x.json", "{}")), emptyList())
      fail("expected an exception")
    } catch (e: IllegalArgumentException) {
      // expected
    }
  }

  @Test
  fun missingAndDamagedFilesAreReportedNotArchived() {
    val pdf = ByteArray(10) { 1 }
    val (zip, r) =
        writeZip(
            emptyList(),
            listOf(
                FileEntry(File(root, "nope.pdf").path, BackupRules.pdfEntry("1".repeat(64)), "1".repeat(64)),
                FileEntry(file("a.pdf", pdf).path, BackupRules.pdfEntry("2".repeat(64)), "2".repeat(64)),
                FileEntry(file("b.pdf", pdf).path, BackupRules.pdfEntry(sha(pdf)), sha(pdf)),
            ))
    assertEquals(listOf(BackupRules.pdfEntry("1".repeat(64))), r.missing)
    assertEquals(listOf(BackupRules.pdfEntry("2".repeat(64))), r.damaged)
    ZipFile(zip).use { assertEquals(listOf(BackupRules.pdfEntry(sha(pdf))), it.entries().toList().map { e -> e.name }) }
  }

  @Test
  fun cancellationStopsTheWriter() {
    var calls = 0
    val pdf = ByteArray(2_000_000)
    try {
      BackupZipWriter(LocalFiles, { ++calls > 3 }, noProgress)
          .write(ByteArrayOutputStream(), emptyList(), listOf(FileEntry(file("a.pdf", pdf).path, BackupRules.pdfEntry(sha(pdf)), "")))
      fail("expected cancellation")
    } catch (e: CancelledException) {
      // expected
    }
  }

  @Test
  fun progressIsReportedWithStartAndEnd() {
    val pdf = ByteArray(1_000_000)
    val forced = ArrayList<Progress>()
    val all = ArrayList<Progress>()
    BackupZipWriter(LocalFiles, { false }, ProgressSink { p, force -> all.add(p); if (force) forced.add(p) })
        .write(ByteArrayOutputStream(), emptyList(), listOf(FileEntry(file("a.pdf", pdf).path, BackupRules.pdfEntry(sha(pdf)), "")))
    assertEquals(2, forced.size)
    assertEquals(0L, forced[0].bytesDone)
    assertEquals(1, forced[1].done)
    assertEquals(1_000_000L, forced[1].bytesDone)
    assertEquals(1_000_000L, forced[1].bytesTotal)
    assertTrue(all.size > 2)
  }

  /** Synthetic files: [size] zero bytes each, no disk needed. */
  private class ZeroFiles(private val sizes: Map<String, Long>) : FileSource {
    override fun size(path: String) = sizes[path] ?: -1L

    override fun open(path: String): InputStream =
        object : InputStream() {
          var left = sizes.getValue(path)

          override fun read(): Int = if (left-- > 0) 0 else -1

          override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (left <= 0) return -1
            val n = minOf(len.toLong(), left).toInt()
            java.util.Arrays.fill(b, off, off + n, 0)
            left -= n
            return n
          }
        }
  }

  /** More than 65,535 entries: the writer switches to ZIP64 records; both readers still see everything. */
  @Test
  fun zip64EntryCount() {
    val n = 70_000
    val source = ZeroFiles((0 until n).associate { "f$it" to 1L })
    val one = sha(byteArrayOf(0))
    val (zip, r) = writeZip(listOf(TextEntry("manifest.json", "{}")), (0 until n).map { FileEntry("f$it", "covers/$it.webp", "") }, source)
    assertTrue(r.missing.isEmpty())
    ZipFile(zip).use { assertEquals(n + 1, it.size()) } // central directory via ZIP64 end record
    val res =
        BackupZipReader({ false }, noProgress)
            .extract(FileInputStream(zip), listOf(BackupZipReader.ExtractItem("covers/${n - 1}.webp", File(root, "files/last.webp"), one)), File(root, "files"), zip.length())
    assertTrue(res[0].ok)
  }

  /**
   * An archive past 4 GiB, streamed writer → pipe → reader (no disk): the entry after the 4 GiB
   * offset extracts and verifies. Takes ~10–30 s, so it only runs with BACKUP_BIG_ZIP_TEST=1.
   */
  @Test
  fun zip64ArchiveSize() {
    assumeTrue(System.getenv("BACKUP_BIG_ZIP_TEST") == "1")
    val big = 1_100L * 1024 * 1024 // 4 × 1.1 GiB = 4.4 GiB
    val sizes = (0 until 4).associate { "big$it" to big } + ("tail" to 3L)
    val source = ZeroFiles(sizes)
    val files = (0 until 4).map { FileEntry("big$it", "pdfs/big$it.pdf", "") } + FileEntry("tail", "pdfs/tail.pdf", "")
    val pipeIn = PipedInputStream(1 shl 20)
    val pipeOut = PipedOutputStream(pipeIn)
    val written = AtomicReference<Any?>(null)
    // Keeps the last 64 KB the writer produced (the reader's buffers swallow the tail).
    val last = java.io.ByteArrayOutputStream()
    val tailKeeper =
        object : java.io.FilterOutputStream(pipeOut) {
          override fun write(b: ByteArray, off: Int, len: Int) {
            out.write(b, off, len)
            if (len >= 65_536) last.reset()
            last.write(b, off + maxOf(0, len - 65_536), minOf(len, 65_536))
            if (last.size() > 131_072) {
              val keep = last.toByteArray().copyOfRange(last.size() - 65_536, last.size())
              last.reset()
              last.write(keep)
            }
          }

          override fun write(b: Int) = write(byteArrayOf(b.toByte()), 0, 1)
        }
    val writer = Thread {
      written.set(
          try {
            BackupZipWriter(source, { false }, noProgress).write(tailKeeper, listOf(TextEntry("manifest.json", "{}")), files)
          } catch (t: Throwable) {
            t
          })
    }
    writer.start()
    val res =
        BackupZipReader({ false }, noProgress)
            .extract(
                object : java.io.FilterInputStream(pipeIn) {
                  override fun close() {} // keep the pipe open to drain it below
                },
                listOf(BackupZipReader.ExtractItem("pdfs/tail.pdf", File(root, "files/tail.pdf"), sha(ByteArray(3)))),
                File(root, "files"),
                -1)
    // The reader stops after the last wanted entry; drain the rest (central directory) so the writer finishes.
    pipeIn.readBytes()
    writer.join()
    val tail = last.toByteArray()
    // The central directory ends with a ZIP64 end-of-central-directory record (PK\u0006\u0006).
    val zip64End = byteArrayOf(0x50, 0x4b, 0x06, 0x06)
    assertTrue((0..tail.size - 4).any { i -> (0 until 4).all { tail[i + it] == zip64End[it] } })
    val w = written.get()
    assertTrue("writer: $w", w is BackupZipWriter.Result)
    assertTrue((w as BackupZipWriter.Result).bytes > 4L * 1024 * 1024 * 1024)
    assertTrue(res[0].ok)
    assertArrayEquals(ByteArray(3), File(root, "files/tail.pdf").readBytes())
  }

  @Test
  fun readerSeesEntriesOfAPlainZipStream() {
    // Sanity: ZipInputStream stops early for texts even when big entries follow.
    val bytes = ByteArrayOutputStream()
    BackupZipWriter(ZeroFiles(mapOf("x" to 10_000_000L)), { false }, noProgress)
        .write(bytes, listOf(TextEntry("manifest.json", "{\"a\":1}")), listOf(FileEntry("x", "pdfs/x.pdf", "")))
    val counting = CountingInputStream(ByteArrayInputStream(bytes.toByteArray()))
    val texts = BackupZipReader({ false }, noProgress).readTexts(counting, setOf("manifest.json"))
    assertEquals("{\"a\":1}", texts["manifest.json"])
    assertTrue("read ${counting.count}", counting.count < 1_000_000)
    ZipInputStream(ByteArrayInputStream(bytes.toByteArray())).use { assertEquals("manifest.json", it.nextEntry!!.name) }
  }
}
