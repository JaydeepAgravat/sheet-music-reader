package com.alphastack.scorereader.saf

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.provider.OpenableColumns
import java.io.File

/** Name / size / flags lookups for picked, shared and tree URIs. Blocking: call off the main thread. */
object SourceQuery {

  /**
   * Never fails: a provider that refuses the query (or a share from an app that only grants
   * openInputStream) still yields a SourceFile named after the URI, so the copy can be attempted.
   * [fallbackMime] is the type the sender declared (Intent.type), used when the provider has none.
   */
  fun describe(context: Context, uri: Uri, fallbackMime: String? = null): SourceFile {
    if (uri.scheme == ContentResolver.SCHEME_FILE) {
      val f = File(uri.path ?: "")
      return SourceFile(uri.toString(), f.name, if (f.isFile) f.length() else -1, "", false, fallbackMime)
    }
    val resolver = context.contentResolver
    // FLAGS / MIME_TYPE only exist on DocumentsProvider rows; asking a plain ContentProvider for
    // unknown columns throws on some providers.
    val isDoc = DocumentsContract.isDocumentUri(context, uri)
    val projection =
        if (isDoc) arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE, Document.COLUMN_FLAGS, Document.COLUMN_MIME_TYPE)
        else arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
    var name: String? = null
    var size = -1L
    var flags = 0
    var mime: String? = null
    try {
      resolver.query(uri, projection, null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 && !c.isNull(it) }?.let { name = c.getString(it) }
          c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !c.isNull(it) }?.let { size = c.getLong(it) }
          if (isDoc) {
            c.getColumnIndex(Document.COLUMN_FLAGS).takeIf { it >= 0 && !c.isNull(it) }?.let { flags = c.getInt(it) }
            c.getColumnIndex(Document.COLUMN_MIME_TYPE).takeIf { it >= 0 && !c.isNull(it) }?.let { mime = c.getString(it) }
          }
        }
      }
    } catch (_: Exception) {}
    if (mime == null) mime = runCatching { resolver.getType(uri) }.getOrNull() ?: fallbackMime
    return SourceFile(
        uri.toString(),
        name?.takeIf { it.isNotBlank() } ?: nameFromUri(uri),
        size,
        "",
        flags and Document.FLAG_VIRTUAL_DOCUMENT != 0,
        mime)
  }

  /** Virtual documents (e.g. Google Docs) have no raw bytes and must be opened as a typed stream. */
  fun isVirtual(context: Context, uri: Uri): Boolean {
    if (uri.scheme != ContentResolver.SCHEME_CONTENT || !DocumentsContract.isDocumentUri(context, uri)) return false
    return try {
      context.contentResolver.query(uri, arrayOf(Document.COLUMN_FLAGS), null, null, null)?.use { c ->
        c.moveToFirst() && c.getInt(0) and Document.FLAG_VIRTUAL_DOCUMENT != 0
      } ?: false
    } catch (_: Exception) {
      false
    }
  }

  /** Display name of a picked tree's root folder. */
  fun treeName(context: Context, treeUri: Uri): String {
    val root = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
    val name =
        try {
          context.contentResolver.query(root, arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
          }
        } catch (_: Exception) {
          null
        }
    return name?.takeIf { it.isNotBlank() } ?: nameFromUri(root)
  }

  /** Last segment of the URI's path, minus document-id prefixes like "primary:Download/". */
  private fun nameFromUri(uri: Uri): String =
      (uri.lastPathSegment ?: "").substringAfterLast('/').substringAfterLast(':').ifBlank { "document.pdf" }
}
