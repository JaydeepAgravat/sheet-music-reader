/**
 * Pure entitlement rules: given what we cached and what Play says, what is the user now?
 * Kept free of native/React imports so the policy is unit-tested exactly as it runs.
 */

export const PRODUCT_ID = 'pro_lifetime';

/** Mirror of NativeBilling's PurchaseInfo (kept structural so tests don't need the native spec). */
export type OwnedPurchase = {
  productId: string;
  purchaseToken: string;
  state: string;
  acknowledged: boolean;
};

export type EntitlementCache = { unlocked: boolean; token: string | null };

export type Verdict = {
  state: 'pro' | 'free' | 'pending';
  cache: EntitlementCache;
  /** Purchased but never acknowledged (Play refunds those after 3 days): acknowledge now. */
  toAcknowledge: string[];
};

/**
 * Downgrade policy — conservative on purpose (a paying musician must never be locked out on the
 * way to a gig):
 *  - Play couldn't answer (`owned === null`: not connected, no Play, query error) → keep the cache.
 *  - Play reports a *purchased* pro_lifetime → Pro; cache its token.
 *  - Cached Pro and Play still lists *anything* for pro_lifetime (pending, unspecified, or the
 *    cached token) → keep Pro.
 *  - Cached Pro and the query *succeeded* with no pro_lifetime purchase at all → downgrade to Free
 *    (refunded, charged back, revoked, or a different Google account is active in Play). Nothing
 *    the user added is locked — only new imports/setlists beyond the free limits.
 *  - Not cached, only a pending purchase → 'pending' (Pro unlocks when payment clears).
 */
export function reconcile(cache: EntitlementCache, owned: readonly OwnedPurchase[] | null): Verdict {
  if (owned === null) return { state: cache.unlocked ? 'pro' : 'free', cache, toAcknowledge: [] };

  const mine = owned.filter(p => p.productId === PRODUCT_ID);
  const purchased = mine.filter(p => p.state === 'purchased');
  const toAcknowledge = purchased.filter(p => !p.acknowledged).map(p => p.purchaseToken);
  const pending = mine.some(p => p.state === 'pending');

  if (purchased.length > 0) {
    const keep = purchased.find(p => p.purchaseToken === cache.token) ?? purchased[0]!;
    return { state: 'pro', cache: { unlocked: true, token: keep.purchaseToken }, toAcknowledge };
  }
  if (cache.unlocked) {
    if (mine.length > 0) return { state: 'pro', cache, toAcknowledge };
    return { state: 'free', cache: { unlocked: false, token: null }, toAcknowledge };
  }
  return { state: pending ? 'pending' : 'free', cache, toAcknowledge };
}
