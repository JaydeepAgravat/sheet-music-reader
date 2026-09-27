import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Google Play Billing for one non-consumable (`pro_lifetime`). android/.../billing/BillingModule.kt.
 *
 * Offline-first: Play Billing talks to the Play Store app over IPC; the app itself never opens a
 * network connection. When Play isn't there (no Play Store, emulator without Play, Play disabled)
 * connect() resolves false and every other call fails gracefully — the app keeps working.
 */

/** 'purchased' | 'pending' | 'unspecified' (Purchase.PurchaseState). */
export type OwnedPurchaseState = string;

export type PurchaseInfo = {
  productId: string;
  purchaseToken: string;
  /** Empty for pending purchases (Play assigns the order id on payment). */
  orderId: string;
  state: OwnedPurchaseState;
  acknowledged: boolean;
  /** ms since epoch. */
  purchaseTime: CodegenTypes.Double;
};

export type ProductInfo = {
  productId: string;
  /** Localized, formatted by Play for the user's country/currency ("9,99 €"). Never hard-coded. */
  price: string;
  priceMicros: CodegenTypes.Double;
  /** ISO 4217, e.g. "EUR". */
  currency: string;
  title: string;
};

/** 'purchased' | 'pending' | 'cancelled' | 'error' | 'alreadyOwned' */
export type PurchaseUpdateState = string;

export type PurchaseUpdate = {
  state: PurchaseUpdateState;
  /** '' when Play reports no purchase (cancelled / error). */
  productId: string;
  purchaseToken: string;
  orderId: string;
  /** For 'purchased': the purchase is acknowledged (native acknowledges right away). */
  acknowledged: boolean;
  /** BillingClient.BillingResponseCode (0 = OK). */
  errorCode: CodegenTypes.Int32;
  /** Developer-facing text from Play; never shown to users. */
  debugMessage: string;
};

export interface Spec extends TurboModule {
  /**
   * Connects to Play (idempotent; concurrent calls share one attempt). Transient failures are
   * retried with backoff; after that the client reconnects automatically on the next call.
   * Resolves false when billing isn't available on this device — never rejects.
   */
  connect(): Promise<boolean>;
  /** Localized price and title for a one-time product; null when unknown/unavailable. */
  getProduct(productId: string): Promise<ProductInfo | null>;
  /**
   * Opens Play's purchase sheet over the current activity. Resolves once the sheet is launched
   * (or failed to launch); the outcome always arrives as onPurchaseUpdate. Rejects E_NO_ACTIVITY,
   * E_UNAVAILABLE (not connected / billing missing) or E_NO_PRODUCT.
   */
  purchase(productId: string): Promise<void>;
  /**
   * One-time products this Google account owns (restore). Served from the Play Store's cache,
   * so it also works offline. Rejects E_UNAVAILABLE / E_QUERY when Play can't answer — a rejection
   * means "unknown", never "not owned".
   */
  queryOwned(): Promise<ReadonlyArray<PurchaseInfo>>;
  /** Acknowledges a purchase (Play refunds unacknowledged purchases after 3 days). Idempotent. */
  acknowledge(purchaseToken: string): Promise<boolean>;

  readonly onPurchaseUpdate: CodegenTypes.EventEmitter<PurchaseUpdate>;
}

/**
 * Optional on purpose: a binary built before this module existed (or a stripped test build) gets a
 * stub that behaves like "no Play Billing on this device" instead of crashing at import.
 */
const unavailable = () => Promise.reject(Object.assign(new Error('Billing module missing'), { code: 'E_UNAVAILABLE' }));
const stub = {
  connect: () => Promise.resolve(false),
  getProduct: () => Promise.resolve(null),
  purchase: unavailable,
  queryOwned: unavailable,
  acknowledge: () => Promise.resolve(false),
  onPurchaseUpdate: () => ({ remove: () => {} }),
} as unknown as Spec;

export default TurboModuleRegistry.get<Spec>('Billing') ?? stub;
