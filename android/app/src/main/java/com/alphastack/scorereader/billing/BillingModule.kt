package com.alphastack.scorereader.billing

import android.os.Handler
import android.os.Looper
import com.alphastack.scorereader.specs.NativeBillingSpec
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap

/**
 * Thin Play Billing wrapper for one non-consumable (`pro_lifetime`). JS owns the entitlement
 * logic (src/features/billing/entitlement.ts); this module only talks to Play.
 *
 * Threading: every BillingClient call and all module state live on the main thread (Play's
 * callbacks arrive there too), so there are no locks.
 *
 * Connection: connect() is idempotent and shared by concurrent callers. Transient setup failures
 * are retried with backoff (1 s, 2 s, 4 s); BILLING_UNAVAILABLE (no Play Store / Play too old /
 * emulator without Play) resolves false at once. After the first connection the client is built
 * with enableAutoServiceReconnection(), so Play re-binds by itself when a call is made after the
 * service dropped. Methods other than connect() connect first when needed.
 */
class BillingModule(reactContext: ReactApplicationContext) : NativeBillingSpec(reactContext) {

  private var client: BillingClient? = null
  private var connecting = false
  private var attempt = 0
  private val waiters = mutableListOf<(Boolean) -> Unit>()
  private val products = HashMap<String, ProductDetails>()

  private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
    main.post { onPurchasesUpdated(result, purchases.orEmpty()) }
  }

  /** The C++ side installs the emitter after construction; until then events can't reach JS. */
  private val canEmit: Boolean
    get() = mEventEmitterCallback != null

  override fun getName() = NAME

  override fun invalidate() {
    main.post {
      client?.endConnection()
      client = null
      connecting = false
      flushWaiters(false)
    }
    super.invalidate()
  }

  // --- Connection ------------------------------------------------------------------------------

  override fun connect(promise: Promise) {
    main.post { withConnection { ok -> promise.resolve(ok) } }
  }

  /** Runs [then] once connected (true) or once connecting has definitely failed (false). */
  private fun withConnection(then: (Boolean) -> Unit) {
    val c = client
    if (c != null && c.isReady) return then(true)
    waiters += then
    if (!connecting) startConnection()
  }

  private fun billingClient(): BillingClient {
    val existing = client
    if (existing != null && existing.connectionState != BillingClient.ConnectionState.CLOSED) return existing
    return BillingClient.newBuilder(reactApplicationContext)
        .setListener(purchasesListener)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()
        .also { client = it }
  }

  private fun startConnection() {
    connecting = true
    val c =
        try {
          billingClient()
        } catch (t: Throwable) {
          // Extremely old/odd devices: treat as "billing not available", never crash.
          connecting = false
          return flushWaiters(false)
        }
    c.startConnection(
        object : BillingClientStateListener {
          override fun onBillingSetupFinished(result: BillingResult) {
            main.post { onSetupFinished(result.responseCode) }
          }

          override fun onBillingServiceDisconnected() {
            // While connecting: a failed attempt (retry). Afterwards: auto-reconnection re-binds on
            // the next call, so there's nothing to do here.
            main.post { if (connecting) onSetupFinished(BillingResponseCode.SERVICE_DISCONNECTED) }
          }
        })
  }

  private fun onSetupFinished(code: Int) {
    if (!connecting) return
    when {
      code == BillingResponseCode.OK -> {
        connecting = false
        attempt = 0
        flushWaiters(true)
      }
      code in RETRYABLE && attempt < MAX_RETRIES -> {
        val delay = 1000L shl attempt
        attempt++
        main.postDelayed({ if (connecting) startConnection() }, delay)
      }
      else -> {
        connecting = false
        attempt = 0
        flushWaiters(false)
      }
    }
  }

  private fun flushWaiters(ok: Boolean) {
    val pending = waiters.toList()
    waiters.clear()
    pending.forEach { it(ok) }
  }

  // --- Product ---------------------------------------------------------------------------------

  override fun getProduct(productId: String, promise: Promise) {
    main.post {
      withConnection { ok ->
        if (!ok) return@withConnection promise.resolve(null)
        queryProduct(productId) { details -> promise.resolve(details?.let(::productMap)) }
      }
    }
  }

  private fun queryProduct(productId: String, then: (ProductDetails?) -> Unit) {
    val c = client ?: return then(null)
    val params =
        QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()))
            .build()
    c.queryProductDetailsAsync(params) { result, details ->
      main.post {
        val found = details.productDetailsList.firstOrNull { it.productId == productId }
        if (result.responseCode == BillingResponseCode.OK && found != null) products[productId] = found
        then(found ?: products[productId])
      }
    }
  }

  private fun productMap(d: ProductDetails): WritableMap? {
    val offer = d.oneTimePurchaseOfferDetails ?: return null
    return Arguments.createMap().apply {
      putString("productId", d.productId)
      putString("price", offer.formattedPrice)
      putDouble("priceMicros", offer.priceAmountMicros.toDouble())
      putString("currency", offer.priceCurrencyCode)
      // Play appends the app name to title ("Pro (Score Reader)"); name is the bare product name.
      putString("title", d.name)
    }
  }

  // --- Purchase --------------------------------------------------------------------------------

  override fun purchase(productId: String, promise: Promise) {
    main.post {
      withConnection { ok ->
        if (!ok) return@withConnection promise.reject("E_UNAVAILABLE", "Billing is not available")
        val cached = products[productId]
        if (cached != null) launch(cached, promise)
        else
            queryProduct(productId) { d ->
              if (d == null) promise.reject("E_NO_PRODUCT", "Product $productId not found")
              else launch(d, promise)
            }
      }
    }
  }

  private fun launch(details: ProductDetails, promise: Promise) {
    val activity = reactApplicationContext.currentActivity ?: return promise.reject("E_NO_ACTIVITY", "No foreground activity")
    val c = client ?: return promise.reject("E_UNAVAILABLE", "Billing is not available")
    val params =
        BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build()))
            .build()
    val result = c.launchBillingFlow(activity, params)
    // OK = the sheet is up; its outcome arrives in onPurchasesUpdated. Anything else is final now.
    if (result.responseCode != BillingResponseCode.OK) onPurchasesUpdated(result, emptyList(), details.productId)
    promise.resolve(null)
  }

  private fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>, productId: String = "") {
    when (result.responseCode) {
      BillingResponseCode.OK -> purchases.forEach(::handlePurchase)
      BillingResponseCode.USER_CANCELED -> emit("cancelled", productId, result = result)
      BillingResponseCode.ITEM_ALREADY_OWNED -> emit("alreadyOwned", productId, result = result)
      else -> emit("error", productId, result = result)
    }
  }

  private fun handlePurchase(p: Purchase) {
    val productId = p.products.firstOrNull() ?: ""
    when (p.purchaseState) {
      Purchase.PurchaseState.PURCHASED ->
          if (p.isAcknowledged) emit("purchased", productId, p, acknowledged = true)
          else acknowledgeToken(p.purchaseToken) { ok -> emit("purchased", productId, p, acknowledged = ok) }
      Purchase.PurchaseState.PENDING -> emit("pending", productId, p)
      else -> Unit // UNSPECIFIED_STATE: nothing to grant or report.
    }
  }

  // --- Restore / acknowledge -------------------------------------------------------------------

  override fun queryOwned(promise: Promise) {
    main.post {
      withConnection { ok ->
        val c = client
        if (!ok || c == null) return@withConnection promise.reject("E_UNAVAILABLE", "Billing is not available")
        c.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()) { result, purchases ->
          if (result.responseCode != BillingResponseCode.OK) {
            promise.reject("E_QUERY", "queryPurchases failed (${result.responseCode}): ${result.debugMessage}")
            return@queryPurchasesAsync
          }
          promise.resolve(
              Arguments.createArray().apply {
                purchases.forEach { p ->
                  p.products.forEach { id ->
                    pushMap(
                        Arguments.createMap().apply {
                          putString("productId", id)
                          putString("purchaseToken", p.purchaseToken)
                          putString("orderId", p.orderId ?: "")
                          putString("state", stateName(p.purchaseState))
                          putBoolean("acknowledged", p.isAcknowledged)
                          putDouble("purchaseTime", p.purchaseTime.toDouble())
                        })
                  }
                }
              })
        }
      }
    }
  }

  override fun acknowledge(purchaseToken: String, promise: Promise) {
    main.post {
      withConnection { ok ->
        if (!ok) return@withConnection promise.resolve(false)
        acknowledgeToken(purchaseToken) { acked -> promise.resolve(acked) }
      }
    }
  }

  private fun acknowledgeToken(token: String, then: (Boolean) -> Unit) {
    val c = client ?: return then(false)
    c.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build()) { r ->
      // ITEM_NOT_OWNED here means "already acknowledged / consumed" on some Play versions: not fatal.
      main.post { then(r.responseCode == BillingResponseCode.OK) }
    }
  }

  // --- Events ----------------------------------------------------------------------------------

  private fun emit(state: String, productId: String, p: Purchase? = null, acknowledged: Boolean = false, result: BillingResult? = null) {
    if (!canEmit) return
    emitOnPurchaseUpdate(
        Arguments.createMap().apply {
          putString("state", state)
          putString("productId", productId)
          putString("purchaseToken", p?.purchaseToken ?: "")
          putString("orderId", p?.orderId ?: "")
          putBoolean("acknowledged", acknowledged)
          putInt("errorCode", result?.responseCode ?: BillingResponseCode.OK)
          putString("debugMessage", result?.debugMessage ?: "")
        })
  }

  companion object {
    const val NAME = "Billing"
    private const val MAX_RETRIES = 3
    private val RETRYABLE =
        setOf(
            BillingResponseCode.SERVICE_DISCONNECTED,
            BillingResponseCode.SERVICE_UNAVAILABLE,
            BillingResponseCode.SERVICE_TIMEOUT,
            BillingResponseCode.NETWORK_ERROR,
            BillingResponseCode.ERROR,
        )
    private val main = Handler(Looper.getMainLooper())

    private fun stateName(s: Int) =
        when (s) {
          Purchase.PurchaseState.PURCHASED -> "purchased"
          Purchase.PurchaseState.PENDING -> "pending"
          else -> "unspecified"
        }
  }
}
