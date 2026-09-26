package com.alphastack.scorereader.system

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat
import com.alphastack.scorereader.specs.NativeAppSystemSpec
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
