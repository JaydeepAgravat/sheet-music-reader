package com.alphastack.scorereader

import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Must run before super.onCreate. The splash dismisses on the first frame; the window
    // background is the app canvas colour, so there is no flash between splash and UI.
    installSplashScreen()
    // Pass null so react-native-screens doesn't try to restore fragments after process death.
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "ScoreReader"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
