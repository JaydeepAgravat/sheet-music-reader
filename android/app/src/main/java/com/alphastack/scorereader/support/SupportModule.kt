package com.alphastack.scorereader.support

import android.content.Intent
import com.alphastack.scorereader.specs.NativeSupportSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap

/** Crash reports, app/device info and the share sheet. See src/specs/NativeSupport.ts. */
class SupportModule(reactContext: ReactApplicationContext) : NativeSupportSpec(reactContext) {

  override fun getName() = NAME

  override fun takeCrashReport(): String? = CrashCapture.takeReport(reactApplicationContext)

  override fun recordJsCrash(text: String): Boolean = CrashCapture.recordJs(reactApplicationContext, text)

  override fun shareText(subject: String, text: String, recipient: String) {
    val send =
        Intent(Intent.ACTION_SEND).apply {
          type = "text/plain"
          putExtra(Intent.EXTRA_SUBJECT, subject)
          putExtra(Intent.EXTRA_TEXT, text)
          if (recipient.isNotEmpty()) putExtra(Intent.EXTRA_EMAIL, arrayOf(recipient))
        }
    val chooser = Intent.createChooser(send, null)
    val activity = reactApplicationContext.currentActivity
    if (activity != null) {
      activity.startActivity(chooser)
    } else {
      reactApplicationContext.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  override fun appInfo(): WritableMap {
    val env = CrashCapture.env(reactApplicationContext)
    return Arguments.createMap().apply {
      putString("appName", env.appName)
      putString("version", env.versionName)
      putDouble("build", env.versionCode.toDouble())
      putString("android", env.androidRelease)
      putInt("sdk", env.sdkInt)
      putString("device", env.device)
    }
  }

  companion object {
    const val NAME = "Support"
  }
}
