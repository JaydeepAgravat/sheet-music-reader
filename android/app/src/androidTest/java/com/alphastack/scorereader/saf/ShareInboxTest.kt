package com.alphastack.scorereader.saf

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShareInboxTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val dir = File(context.cacheDir, "share-test")
  private val a = Uri.parse("content://example/a.pdf")
  private val b = Uri.parse("content://example/b.pdf")

  @Before
  fun setUp() {
    dir.mkdirs()
    ShareInbox.take()
  }

  @After
  fun tearDown() {
    ShareInbox.listener = null
    ShareInbox.take()
  }

  @Test
  fun view() = assertEquals(listOf(a), ShareInbox.sharedUris(Intent(Intent.ACTION_VIEW, a)))

  @Test
  fun send() =
      assertEquals(listOf(a), ShareInbox.sharedUris(Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, a)))

  @Test
  fun sendMultipleDeduplicates() =
      assertEquals(
          listOf(a, b),
          ShareInbox.sharedUris(Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(a, b, a))))

  @Test
  fun otherIntentsCarryNothing() {
    assertEquals(emptyList<Uri>(), ShareInbox.sharedUris(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)))
    assertEquals(emptyList<Uri>(), ShareInbox.sharedUris(Intent(Intent.ACTION_SEND)))
  }

  @Test
  fun acceptQueuesPdfsAndNotifies() {
    val pdf = File(dir, "Autumn Leaves.pdf").apply { writeBytes("%PDF-1.4\n".toByteArray()) }
    val txt = File(dir, "notes.txt").apply { writeText("hi") }
    val latch = CountDownLatch(1)
    var count = 0
    ShareInbox.listener = { n ->
      count = n
      latch.countDown()
    }
    ShareInbox.accept(
        context,
        Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(Uri.fromFile(pdf), Uri.fromFile(txt))))
    assertTrue(latch.await(5, TimeUnit.SECONDS))
    assertEquals(1, count)
    val files = ShareInbox.take()
    assertEquals(listOf(SourceFile(Uri.fromFile(pdf).toString(), "Autumn Leaves.pdf", pdf.length(), "", false)), files)
    assertEquals(emptyList<SourceFile>(), ShareInbox.take())
  }
}
