package com.alphastack.scorereader.system

import android.app.DatePickerDialog
import android.content.DialogInterface
import android.content.pm.ActivityInfo
import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.WindowManager
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.alphastack.scorereader.specs.NativeAppSystemSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil

class AppSystemModule(reactContext: ReactApplicationContext) : NativeAppSystemSpec(reactContext) {

  override fun getName() = NAME

  override fun performHaptic(kind: String) {
    val constant = hapticConstant(kind) ?: return
    UiThreadUtil.runOnUiThread {
      reactApplicationContext.currentActivity?.window?.decorView?.performHapticFeedback(constant)
    }
  }

  override fun setSystemBarIconsDark(dark: Boolean) {
    UiThreadUtil.runOnUiThread {
      val window = reactApplicationContext.currentActivity?.window ?: return@runOnUiThread
      WindowCompat.getInsetsController(window, window.decorView).apply {
        isAppearanceLightStatusBars = dark
        isAppearanceLightNavigationBars = dark
      }
    }
  }

  override fun setNightMode(mode: String) {
    val nightMode =
        when (mode) {
          "light" -> AppCompatDelegate.MODE_NIGHT_NO
          "dark" -> AppCompatDelegate.MODE_NIGHT_YES
          else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
    UiThreadUtil.runOnUiThread {
      if (AppCompatDelegate.getDefaultNightMode() != nightMode) {
        AppCompatDelegate.setDefaultNightMode(nightMode)
      }
    }
  }

  override fun setKeepAwake(on: Boolean) {
    UiThreadUtil.runOnUiThread {
      val window = reactApplicationContext.currentActivity?.window ?: return@runOnUiThread
      if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  override fun setImmersive(on: Boolean) {
    UiThreadUtil.runOnUiThread {
      val window = reactApplicationContext.currentActivity?.window ?: return@runOnUiThread
      WindowCompat.getInsetsController(window, window.decorView).apply {
        systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (on) hide(WindowInsetsCompat.Type.systemBars()) else show(WindowInsetsCompat.Type.systemBars())
      }
    }
  }

  override fun setOrientationLock(locked: Boolean) {
    UiThreadUtil.runOnUiThread {
      reactApplicationContext.currentActivity?.requestedOrientation =
          if (locked) ActivityInfo.SCREEN_ORIENTATION_LOCKED else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }
  }

  override fun pickDate(initial: String, clearLabel: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread promise.resolve(null)
      val today = java.util.Calendar.getInstance()
      val parts = initial.split("-").mapNotNull { it.toIntOrNull() }
      val (y, m, d) =
          if (parts.size == 3) Triple(parts[0], parts[1] - 1, parts[2])
          else Triple(today.get(java.util.Calendar.YEAR), today.get(java.util.Calendar.MONTH), today.get(java.util.Calendar.DAY_OF_MONTH))
      var settled = false
      val settle = { value: String? ->
        if (!settled) {
          settled = true
          promise.resolve(value)
        }
      }
      val dialog =
          DatePickerDialog(activity, com.alphastack.scorereader.R.style.DatePickerTheme, { _, yy, mm, dd -> settle("%04d-%02d-%02d".format(yy, mm + 1, dd)) }, y, m, d)
      if (clearLabel.isNotEmpty()) dialog.setButton(DialogInterface.BUTTON_NEUTRAL, clearLabel) { _, _ -> settle("") }
      dialog.setOnDismissListener { settle(null) }
      dialog.show()
    }
  }

  /** Maps our semantic haptic names to the best constant available on this API level. */
  private fun hapticConstant(kind: String): Int? {
    val api30 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val api34 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    return when (kind) {
      "tick" -> if (api34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK
      "confirm" -> if (api30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
      "reject" -> if (api30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
      "longPress" -> HapticFeedbackConstants.LONG_PRESS
      "dragStart" -> if (api34) HapticFeedbackConstants.DRAG_START else HapticFeedbackConstants.LONG_PRESS
      "drop" -> if (api30) HapticFeedbackConstants.GESTURE_END else HapticFeedbackConstants.CLOCK_TICK
      "boundary" -> if (api30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.CLOCK_TICK
      else -> null
    }
  }

  companion object {
    const val NAME = "AppSystem"
  }
}
