package com.alphastack.scorereader.ink

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class InkCodecTest {
  @Test
  fun pointsRoundTrip() {
    val pts = floatArrayOf(0f, 1f, 0.5f, 0.123456f, 0.987654f, 1f, 1e-7f, 0.5f, 0.25f)
    assertArrayEquals(pts, InkCodec.decodePoints(InkCodec.encodePoints(pts)), 0f)
  }

  @Test
  fun pointsAreLittleEndianFloat32() {
    // 1.0f = 0x3F800000 → bytes 00 00 80 3F.
    val b64 = InkCodec.encodePoints(floatArrayOf(1f, 0f, 0f))
    val bytes = java.util.Base64.getDecoder().decode(b64)
    assertEquals(listOf(0, 0, 0x80, 0x3F), bytes.take(4).map { it.toInt() and 0xFF })
  }

  @Test
  fun malformedPointsDecodeToWholeTriples() {
    assertEquals(0, InkCodec.decodePoints("not base64!!").size)
    val sevenFloats = InkCodec.encodePoints(FloatArray(7) { it.toFloat() })
    assertEquals(6, InkCodec.decodePoints(sevenFloats).size)
    assertEquals(0, InkCodec.decodePoints("").size)
  }

  @Test
  fun colourIsUnsignedOnTheWire() {
    val argb = 0xFFE53935.toInt() // negative as a signed Int
    val wire = InkCodec.colorToWire(argb)
    assertEquals(4293212469.0, wire, 0.0)
    assertEquals(argb, InkCodec.colorFromWire(wire))
    assertEquals(0x661E88E5, InkCodec.colorFromWire(InkCodec.colorToWire(0x661E88E5)))
    assertEquals(0.0, InkCodec.colorToWire(0), 0.0)
  }

  @Test
  fun decodeBuildsStroke() {
    val s = InkCodec.decode("a", 3, "HIGHLIGHTER", 4294967295.0, 6.0, InkCodec.encodePoints(floatArrayOf(0.1f, 0.2f, 0.5f, 0.3f, 0.4f, 0.5f)))
    assertEquals(InkKind.HIGHLIGHTER, s.kind)
    assertEquals(-1, s.color)
    assertEquals(6f, s.widthPt)
    assertEquals(2, s.pointCount)
    assertEquals(0.1f, s.minX)
    assertEquals(0.4f, s.maxY)
    assertEquals(InkKind.PEN, InkCodec.decode("b", 0, "???", 0.0, 1.0, "").kind)
  }
}
