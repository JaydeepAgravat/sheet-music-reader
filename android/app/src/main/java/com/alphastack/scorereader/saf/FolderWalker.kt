package com.alphastack.scorereader.saf

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document

/**
 * Lists every PDF under a picked tree. One ContentResolver query per folder: DocumentFile.listFiles
 * would issue a further query per child just to read its name and type, which is slow on big trees
 * and cloud providers. Blocking — call off the main thread.
 */
object FolderWalker {

  /** Folders nested deeper than this are not entered (guards against pathological trees). */
  const val MAX_DEPTH = 12

  private val COLUMNS =
      arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_FLAGS)

  private class Dir(val id: String, val path: String, val depth: Int)

  fun list(resolver: ContentResolver, treeUri: Uri): List<SourceFile> {
    val out = ArrayList<SourceFile>()
    val stack = ArrayDeque<Dir>()
    stack.addLast(Dir(DocumentsContract.getTreeDocumentId(treeUri), "", 0))
    while (stack.isNotEmpty()) {
      val dir = stack.removeLast()
      val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, dir.id)
      resolver.query(children, COLUMNS, null, null, null)?.use { c ->
        while (c.moveToNext()) {
          val id = c.getString(0) ?: continue
          val name = c.getString(1) ?: continue
          if (PdfRules.isHidden(name)) continue
          val mime = c.getString(2)
          if (mime == Document.MIME_TYPE_DIR) {
            if (dir.depth < MAX_DEPTH) stack.addLast(Dir(id, PdfRules.childDir(dir.path, name), dir.depth + 1))
          } else if (PdfRules.isPdf(mime, name)) {
            out +=
                SourceFile(
                    DocumentsContract.buildDocumentUriUsingTree(treeUri, id).toString(),
                    name,
                    if (c.isNull(3)) -1 else c.getLong(3),
                    dir.path,
                    !c.isNull(4) && c.getInt(4) and Document.FLAG_VIRTUAL_DOCUMENT != 0,
                    mime)
          }
        }
      }
    }
    return out.sortedWith(SourceFile.ORDER)
  }
}
