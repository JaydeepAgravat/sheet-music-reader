package com.alphastack.scorereader.ink

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64

/**
 * The wire format shared with JS (NativeInk.ts) and the SQLite blobs: points are base64 of
 * little-endian Float32 [x, y, pressure] triples; colours are ARGB as an unsigned 32-bit number
 * (a JS double), so alpha ≥ 0x80 never turns into a negative value on the JS side.
 */
object InkCodec {
  fun encodePoints(points: FloatArray): String {
    val buf = ByteBuffer.allocate(points.size * 4).order(ByteOrder.LITTLE_ENDIAN)
    buf.asFloatBuffer().put(points)
    return Base64.getEncoder().encodeToString(buf.array())
  }

  /** Malformed input decodes to what is readable (whole triples only) rather than throwing. */
  fun decodePoints(base64: String): FloatArray {
    val bytes =
        try {
          Base64.getDecoder().decode(base64)
        } catch (_: IllegalArgumentException) {
          return FloatArray(0)
        }
    val floats = bytes.size / 4 / 3 * 3
    val out = FloatArray(floats)
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(out, 0, floats)
    return out
  }

  fun colorFromWire(value: Double): Int = value.toLong().toInt()

  fun colorToWire(color: Int): Double = (color.toLong() and 0xFFFFFFFFL).toDouble()

  fun decode(id: String, page: Int, kind: String?, color: Double, width: Double, points: String) =
      InkStroke(id, page, InkKind.parse(kind), colorFromWire(color), width.toFloat(), decodePoints(points))
}
