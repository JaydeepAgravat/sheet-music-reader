package com.alphastack.scorereader.ink

import kotlin.math.hypot

/**
 * Input filter for a stroke being drawn, in any isotropic unit (the view feeds page points).
 *
 * - Streamline (perfect-freehand style): each sample pulls the pen position only part of the way
 *   towards the raw input, which removes jitter from finger/stylus sampling.
 * - Decimation: filtered points closer than [minDistance] to the last kept point are dropped, so
 *   a slow stroke doesn't store hundreds of redundant points.
 * - [end] appends the last raw point so the stroke finishes exactly where the pen lifted (the
 *   streamline would otherwise leave it short).
 */
class InkSmoother(streamline: Float = 0.45f) {
  private val t = 0.15f + (1f - streamline.coerceIn(0f, 1f)) * 0.85f
  private var minDistance = 0f

  /** Kept points as [x, y, pressure] triples; valid up to [count]. */
  var buffer = FloatArray(3 * 128)
    private set
  var count = 0
    private set

  private var fx = 0f
  private var fy = 0f

  /** Latest raw sample (the live stroke is drawn up to it for responsiveness). */
  var rawX = 0f
    private set
  var rawY = 0f
    private set
  private var rawP = 0f

  fun begin(x: Float, y: Float, pressure: Float, minDistance: Float) {
    this.minDistance = minDistance
    count = 0
    fx = x
    fy = y
    rawX = x
    rawY = y
    rawP = pressure
    push(x, y, pressure)
  }

  /** Returns true when a point was kept. */
  fun add(x: Float, y: Float, pressure: Float): Boolean {
    rawX = x
    rawY = y
    rawP = pressure
    fx += (x - fx) * t
    fy += (y - fy) * t
    val i = (count - 1) * 3
    if (count > 0 && hypot(fx - buffer[i], fy - buffer[i + 1]) < minDistance) return false
    push(fx, fy, pressure)
    return true
  }

  fun end() {
    val i = (count - 1) * 3
    if (count > 0 && hypot(rawX - buffer[i], rawY - buffer[i + 1]) <= END_EPSILON) return
    push(rawX, rawY, rawP)
  }

  fun reset() {
    count = 0
  }

  fun points(): FloatArray = buffer.copyOf(count * 3)

  private fun push(x: Float, y: Float, p: Float) {
    if ((count + 1) * 3 > buffer.size) buffer = buffer.copyOf(buffer.size * 2)
    val i = count * 3
    buffer[i] = x
    buffer[i + 1] = y
    buffer[i + 2] = p
    count++
  }

  private companion object {
    const val END_EPSILON = 1e-3f
  }
}
