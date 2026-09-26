package com.alphastack.scorereader.renderer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.ScorePageViewManagerDelegate
import com.facebook.react.viewmanagers.ScorePageViewManagerInterface

@ReactModule(name = ScorePageViewManager.NAME)
class ScorePageViewManager : SimpleViewManager<ScorePageView>(), ScorePageViewManagerInterface<ScorePageView> {

  private val delegate: ViewManagerDelegate<ScorePageView> = ScorePageViewManagerDelegate(this)

  override fun getDelegate() = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext): ScorePageView =
      ScorePageView(context).apply {
        onPageShown = { page, latencyMs, endToEndMs, fromCache, renderMs ->
          val reactContext = context as ReactContext
          val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
          UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
              ?.dispatchEvent(PageShownEvent(surfaceId, id, page, latencyMs, endToEndMs, fromCache, renderMs))
        }
      }

  @ReactProp(name = "docId") override fun setDocId(view: ScorePageView, value: String?) = view.setDocId(value)

  @ReactProp(name = "page") override fun setPage(view: ScorePageView, value: Int) = view.setPage(value)

  @ReactProp(name = "mode") override fun setMode(view: ScorePageView, value: String?) = view.setMode(value)

  @ReactProp(name = "halfSplit", defaultFloat = 0.5f)
  override fun setHalfSplit(view: ScorePageView, value: Float) = view.setHalfSplit(value)

  @ReactProp(name = "pageFilter") override fun setPageFilter(view: ScorePageView, value: String?) = view.setFilter(value)

  @ReactProp(name = "turnRequestedAtMs", defaultDouble = 0.0)
  override fun setTurnRequestedAtMs(view: ScorePageView, value: Double) = view.setTurnRequestedAt(value)

  @ReactProp(name = "prefetchRadius", defaultInt = 2)
  override fun setPrefetchRadius(view: ScorePageView, value: Int) = view.setPrefetchRadius(value)

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf(PageShownEvent.NAME to mapOf("registrationName" to "onPageShown"))

  private class PageShownEvent(
      surfaceId: Int,
      viewId: Int,
      private val page: Int,
      private val latencyMs: Double,
      private val endToEndMs: Double,
      private val fromCache: Boolean,
      private val renderMs: Double,
  ) : Event<PageShownEvent>(surfaceId, viewId) {
    override fun getEventName() = NAME

    override fun getEventData(): WritableMap =
        Arguments.createMap().apply {
          putInt("page", page)
          putDouble("latencyMs", latencyMs)
          putDouble("endToEndMs", endToEndMs)
          putBoolean("fromCache", fromCache)
          putDouble("renderMs", renderMs)
        }

    companion object {
      const val NAME = "topPageShown"
    }
  }

  companion object {
    const val NAME = "ScorePageView"
  }
}
