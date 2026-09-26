package com.alphastack.scorereader.keys

import android.content.Context
import android.content.res.Configuration
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import com.alphastack.scorereader.specs.NativeKeyEventsSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/** JS side of pedal input: configures [KeyRouter] and emits what it sees. */
class KeyEventsModule(reactContext: ReactApplicationContext) : NativeKeyEventsSpec(reactContext) {

  private val inputManager = reactContext.getSystemService(Context.INPUT_SERVICE) as InputManager

  /** Info captured on connect, because a removed device can no longer be queried. UI thread only. */
  private val knownDevices = HashMap<Int, DeviceInfo>()

  private val deviceListener =
      object : InputManager.InputDeviceListener {
        override fun onInputDeviceAdded(deviceId: Int) {
          val info = externalKeyboard(inputManager.getInputDevice(deviceId)) ?: return
          knownDevices[deviceId] = info
          if (canEmit) emitOnDeviceAdded(info.toMap())
        }

        override fun onInputDeviceRemoved(deviceId: Int) {
          val info = knownDevices.remove(deviceId) ?: return
          if (canEmit) emitOnDeviceRemoved(info.toMap())
        }

        override fun onInputDeviceChanged(deviceId: Int) {}
      }

  /** The C++ side installs the emitter after construction; until then events can't reach JS. */
  val canEmit: Boolean
    get() = mEventEmitterCallback != null

  override fun getName() = NAME

  override fun initialize() {
    super.initialize()
    main.post {
      connectedDevices().forEach { knownDevices[it.id] = it }
      inputManager.registerInputDeviceListener(deviceListener, main)
    }
    KeyRouter.module = this
  }

  override fun invalidate() {
    if (KeyRouter.module === this) {
      KeyRouter.module = null
      KeyRouter.filter.reset()
    }
    main.post { inputManager.unregisterInputDeviceListener(deviceListener) }
    super.invalidate()
  }

  override fun setMappings(keyCodes: ReadableArray, actions: ReadableArray) {
    val n = minOf(keyCodes.size(), actions.size())
    KeyRouter.filter.setMappings(List(n) { keyCodes.getInt(it) }, List(n) { actions.getString(it) ?: "" })
  }

  override fun setDebounceMs(ms: Double) = KeyRouter.filter.setDebounceMs(ms.toLong())

  override fun setReaderActive(active: Boolean) = KeyRouter.filter.setReaderActive(active)

  override fun setTurnPlan(plan: ReadableMap) =
      KeyRouter.filter.setPlan(TurnPlan(plan.getInt("id"), targets(plan.getArray("next")), targets(plan.getArray("prev"))))

  override fun clearTurnPlan() = KeyRouter.filter.setPlan(null)

  override fun setLearning(learning: Boolean) = KeyRouter.filter.setLearning(learning)

  override fun getConnectedDevices(): WritableArray =
      Arguments.createArray().apply { connectedDevices().forEach { pushMap(it.toMap()) } }

  override fun hasHardwareKeyboard(): Boolean =
      reactApplicationContext.resources.configuration.keyboard != Configuration.KEYBOARD_NOKEYS

  // --- Called by KeyRouter on the UI thread ----------------------------------------------------

  fun emitPedal(action: String, keyCode: Int, deviceName: String, applied: Boolean, planId: Int) =
      emitOnPedal(
          Arguments.createMap().apply {
            putString("action", action)
            putInt("keyCode", keyCode)
            putString("deviceName", deviceName)
            putBoolean("applied", applied)
            putInt("planId", planId)
          })

  fun emitKeyLearned(keyCode: Int, deviceName: String, deviceId: Int) =
      emitOnKeyLearned(
          Arguments.createMap().apply {
            putInt("keyCode", keyCode)
            putString("keyName", KeyEvent.keyCodeToString(keyCode).removePrefix("KEYCODE_"))
            putString("deviceName", deviceName)
            putInt("deviceId", deviceId)
          })

  // --- Devices ---------------------------------------------------------------------------------

  private data class DeviceInfo(val id: Int, val name: String, val descriptor: String, val external: Boolean) {
    fun toMap(): WritableMap =
        Arguments.createMap().apply {
          putInt("id", id)
          putString("name", name)
          putString("descriptor", descriptor)
          putBoolean("external", external)
        }
  }

  private fun connectedDevices(): List<DeviceInfo> =
      inputManager.inputDeviceIds.asList().mapNotNull { externalKeyboard(inputManager.getInputDevice(it)) }

  /** Pedals present as external keyboards; built-in keys (volume, power) and virtual devices don't count. */
  private fun externalKeyboard(d: InputDevice?): DeviceInfo? {
    if (d == null || d.isVirtual || !d.isExternal || !d.supportsSource(InputDevice.SOURCE_KEYBOARD)) return null
    return DeviceInfo(d.id, d.name ?: "", d.descriptor ?: "", true)
  }

  private fun targets(arr: ReadableArray?): List<SlotTarget> {
    if (arr == null) return emptyList()
    return List(arr.size()) { i ->
      val m = arr.getMap(i)
      SlotTarget(m?.getString("slot") ?: "", m?.getInt("page") ?: -1, m?.getString("mode") ?: "SINGLE")
    }
  }

  companion object {
    const val NAME = "KeyEvents"
    private val main = Handler(Looper.getMainLooper())
  }
}
