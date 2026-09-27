package com.alphastack.scorereader

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.alphastack.scorereader.backup.BackupPackage
import com.alphastack.scorereader.billing.BillingPackage
import com.alphastack.scorereader.ink.InkPackage
import com.alphastack.scorereader.keys.KeyEventsPackage
import com.alphastack.scorereader.renderer.RendererPackage
import com.alphastack.scorereader.saf.SafImportPackage
import com.alphastack.scorereader.support.CrashCapture
import com.alphastack.scorereader.support.SupportPackage
import com.alphastack.scorereader.system.AppSystemPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // App-local Turbo Modules (not autolinked).
          add(AppSystemPackage())
          add(RendererPackage())
          add(KeyEventsPackage())
          add(SafImportPackage())
          add(InkPackage())
          add(BackupPackage())
          add(SupportPackage())
          add(BillingPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // First: a crash anywhere after this point is kept on the device for the next launch.
    CrashCapture.install(this)
    loadReactNative(this)
  }
}
